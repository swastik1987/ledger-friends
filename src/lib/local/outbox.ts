import type { capSQLiteSet } from '@capacitor-community/sqlite';
import { supabase } from '@/integrations/supabase/client';
import { findBankMatch } from '@/lib/bankResolver';
import { bankHashColor, guessDomain } from '@/lib/bankBrand';
import type { Bank } from '@/types';
import { toast } from 'sonner';
import { currentEpoch, query, runInTransaction } from './db';
import { markStale, refreshQueries } from './state';

// Offline writes for the Android app (docs/android-app-plan.md §3–4).
//
// Every create, edit or delete of a transaction changes the local row and
// appends to the outbox in one SQLite transaction, so a crash can't leave a
// local change that never syncs. The UI reads the local row straight away.
// The push engine then replays the outbox in order against Supabase:
// - Rows get their id on the device (crypto.randomUUID), so an insert retried
//   after a lost response hits a duplicate key (23505), which counts as done.
// - Pushes never send created_at/updated_at: the server stamps them, and pull
//   cursors compare server time only.
// - A network failure stops the drain and keeps the order; it's retried later.
// - A permanent failure (RLS denial, FK violation, bad data) marks that entry
//   and its row "failed" and moves on, so one bad entry can't block the rest.
//
// expenses.sync_state is 'synced', 'pending_insert', 'pending_update',
// 'pending_delete' or 'failed'. Pulls never overwrite a row that isn't
// 'synced' (rule 4). A pending delete keeps the row, flagged local_deleted,
// until the delete reaches the server, so a pull can't bring it back.

type Row = Record<string, unknown>;
type Op = 'insert' | 'update' | 'delete';

const REQUEST_TIMEOUT_MS = 20_000;
const sig = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

// Server-stamped, joined in by reads, or local bookkeeping: never pushed.
const NOT_PUSHED = new Set(['created_at', 'updated_at', 'category', 'created_by_profile', 'sync_status']);

function pushable(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (!NOT_PUSHED.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

function rowStatement(e: Row, syncState: string): capSQLiteSet {
  return {
    statement: `INSERT OR REPLACE INTO expenses
      (id, tracker_id, date, updated_at, category_id, amount, is_debit, is_transfer, row_json, sync_state, local_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    values: [
      e.id, e.tracker_id, e.date, e.updated_at, e.category_id ?? null,
      Number(e.amount), e.is_debit ? 1 : 0, e.is_transfer ? 1 : 0, JSON.stringify(e), syncState,
    ],
  };
}

function outboxStatement(op: Op, id: string, payload: Row): capSQLiteSet {
  return {
    statement: 'INSERT INTO outbox (op, entity_id, payload, created_at) VALUES (?, ?, ?, ?)',
    values: [op, id, JSON.stringify(payload), new Date().toISOString()],
  };
}

/** After a local write: show it now, and push it if the network is there. */
function afterLocalWrite(): void {
  refreshQueries();
  if (navigator.onLine) void pushOutbox().catch(() => undefined); // retried by the next pull
}

async function readRows(ids: string[]): Promise<Map<string, { row: Row; syncState: string }>> {
  const out = new Map<string, { row: Row; syncState: string }>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await query<{ id: string; row_json: string; sync_state: string }>(
      `SELECT id, row_json, sync_state FROM expenses WHERE id IN (${chunk.map(() => '?').join(',')}) AND local_deleted = 0`,
      chunk,
    );
    for (const r of rows) out.set(r.id, { row: JSON.parse(r.row_json) as Row, syncState: r.sync_state });
  }
  return out;
}

// ─── Local writes ──────────────────────────────────────────────────────────

/** Saves new transactions locally and queues their insert. Returns the stored rows. */
export async function createExpenses(rows: Row[]): Promise<Row[]> {
  const now = new Date().toISOString();
  const created = rows.map(r => ({
    ...pushable(r),
    id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
    // Placeholders until the pushed row comes back with the server's stamps.
    created_at: now,
    updated_at: now,
  }));
  await runInTransaction(created.flatMap(e => [
    rowStatement(e, 'pending_insert'),
    outboxStatement('insert', e.id, pushable(e)),
  ]));
  afterLocalWrite();
  return created;
}

interface FailedEntity { insert: { seq: number; payload: Row } | null }

/** Rows among `ids` with entries the server rejected, and their unsent insert if any. */
async function readFailedEntities(ids: string[]): Promise<Map<string, FailedEntity>> {
  const out = new Map<string, FailedEntity>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await query<{ seq: number; entity_id: string; op: Op; payload: string }>(
      `SELECT seq, entity_id, op, payload FROM outbox
        WHERE status = 'failed' AND entity_id IN (${chunk.map(() => '?').join(',')}) ORDER BY seq`,
      chunk,
    );
    for (const r of rows) {
      const entity = out.get(r.entity_id) ?? { insert: null };
      if (r.op === 'insert') entity.insert = { seq: r.seq, payload: JSON.parse(r.payload) as Row };
      out.set(r.entity_id, entity);
    }
  }
  return out;
}

/**
 * Applies `patch` to each transaction locally and queues the update.
 *
 * Editing a row the server rejected means "fix it and send it again": its
 * failed entries go back in the queue, and if its insert never landed, the
 * edit is folded into that insert. (Only failed inserts are rewritten: a
 * pending one may be in flight right now.)
 */
export async function updateExpenses(ids: string[], patch: Row): Promise<void> {
  const fields = pushable(patch);
  delete fields.id;
  const current = await readRows(ids);
  const failed = await readFailedEntities([...current.keys()]);
  const statements: capSQLiteSet[] = [];
  for (const [id, { row, syncState }] of current) {
    const merged = { ...row, ...fields };
    const rejected = failed.get(id);
    if (rejected) {
      statements.push({
        statement: "UPDATE outbox SET status = 'pending', last_error = NULL WHERE entity_id = ? AND status = 'failed'",
        values: [id],
      });
    }
    if (rejected?.insert) {
      statements.push(
        {
          statement: 'UPDATE outbox SET payload = ? WHERE seq = ?',
          values: [JSON.stringify({ ...rejected.insert.payload, ...fields }), rejected.insert.seq],
        },
        rowStatement(merged, 'pending_insert'),
      );
      continue;
    }
    // Still waiting for its insert: the update rides along after it.
    const state = syncState === 'pending_insert' ? 'pending_insert' : 'pending_update';
    statements.push(rowStatement(merged, state), outboxStatement('update', id, fields));
  }
  await runInTransaction(statements);
  afterLocalWrite();
}

/**
 * Hides the transactions locally and queues their delete. A rejected row
 * that never reached the server is simply dropped; a rejected change to a
 * row that did is abandoned in favour of the delete.
 */
export async function deleteExpenses(ids: string[]): Promise<void> {
  const failed = await readFailedEntities(ids);
  const statements: capSQLiteSet[] = [];
  for (const id of ids) {
    const rejected = failed.get(id);
    if (rejected?.insert) {
      statements.push(
        { statement: 'DELETE FROM outbox WHERE entity_id = ?', values: [id] },
        { statement: 'DELETE FROM expenses WHERE id = ?', values: [id] },
      );
      continue;
    }
    if (rejected) {
      statements.push({ statement: "DELETE FROM outbox WHERE entity_id = ? AND status = 'failed'", values: [id] });
    }
    statements.push(
      { statement: "UPDATE expenses SET local_deleted = 1, sync_state = 'pending_delete' WHERE id = ?", values: [id] },
      outboxStatement('delete', id, {}),
    );
  }
  await runInTransaction(statements);
  afterLocalWrite();
}

// ─── Push engine ───────────────────────────────────────────────────────────

interface Entry { seq: number; op: Op; entity_id: string; payload: string }

class PermanentPushError extends Error {}

// Retrying won't help with these SQLSTATE classes / PostgREST codes: integrity
// (23), data (22), syntax and access, including RLS (42), and request errors
// (PGRST1xx/2xx). Anything else, including no code at all (the request never
// got a response) and expired JWTs (PGRST3xx), is treated as transient.
function isPermanent(error: { code?: string }): boolean {
  const code = error.code ?? '';
  return /^(22|23|42)/.test(code) || /^PGRST[12]/.test(code);
}

function check(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (isPermanent(error)) throw new PermanentPushError(`${error.code}: ${error.message ?? ''}`.trim());
  throw error;
}

/**
 * Bank names typed offline that matched nothing in the cached registry are
 * saved without a bank_id; resolve or register them now, the same way
 * useResolveBankName does online.
 */
async function withBankId(row: Row): Promise<Row> {
  const name = typeof row.bank_name === 'string' ? row.bank_name.trim() : '';
  if (!name || row.bank_id) return row;
  const banks = (await query<{ row_json: string }>('SELECT row_json FROM banks')).map(r => JSON.parse(r.row_json) as Bank);
  const match = findBankMatch(name, banks);
  if (match) return { ...row, bank_id: match.id, bank_name: match.canonical_name };

  const { data, error } = await supabase
    .from('banks')
    .insert({ canonical_name: name, domain: guessDomain(name), brand_color: bankHashColor(name) })
    .select('id, canonical_name')
    .abortSignal(sig())
    .single();
  if (error?.code === '23505') {
    const { data: existing, error: fetchErr } = await supabase
      .from('banks').select('id, canonical_name').eq('canonical_name', name).abortSignal(sig()).single();
    check(fetchErr);
    return { ...row, bank_id: existing!.id, bank_name: existing!.canonical_name };
  }
  check(error);
  return { ...row, bank_id: data!.id, bank_name: data!.canonical_name };
}

/** Sends one entry. Resolves false when the row no longer exists on the server. */
async function send(entry: Entry): Promise<boolean> {
  const payload = JSON.parse(entry.payload) as Row;
  if (entry.op === 'insert') {
    const { error } = await supabase.from('expenses').insert(await withBankId(payload) as never).abortSignal(sig());
    if (error?.code === '23505') return true; // an earlier attempt landed; its response was lost
    check(error);
    return true;
  }
  if (entry.op === 'update') {
    const { data, error } = await supabase
      .from('expenses').update(await withBankId(payload) as never).eq('id', entry.entity_id).select('id').abortSignal(sig());
    check(error);
    // No row matched: deleted on the server, or RLS now hides it (removed from the tracker).
    return (data ?? []).length > 0;
  }
  const { error } = await supabase.from('expenses').delete().eq('id', entry.entity_id).abortSignal(sig());
  check(error);
  return true;
}

/** After an entity's last pending entry is done, its row stops being pending. */
function settleStatements(entry: Entry, outcome: 'ok' | 'gone'): capSQLiteSet[] {
  const id = entry.entity_id;
  if (outcome === 'gone') {
    return [
      { statement: 'DELETE FROM outbox WHERE entity_id = ?', values: [id] },
      { statement: 'DELETE FROM expenses WHERE id = ?', values: [id] },
    ];
  }
  return [
    { statement: 'DELETE FROM outbox WHERE seq = ?', values: [entry.seq] },
    entry.op === 'delete'
      ? { statement: "DELETE FROM expenses WHERE id = ? AND NOT EXISTS (SELECT 1 FROM outbox WHERE entity_id = ?)", values: [id, id] }
      : {
          statement: `UPDATE expenses SET sync_state = 'synced'
                       WHERE id = ? AND sync_state != 'failed'
                         AND NOT EXISTS (SELECT 1 FROM outbox WHERE entity_id = ?)`,
          values: [id, id],
        },
  ];
}

async function drain(): Promise<void> {
  const epoch = currentEpoch();
  let pushed = false;
  let lostEdits = 0;
  try {
    for (;;) {
      if (!navigator.onLine) return;
      const [entry] = await query<Entry>(
        "SELECT seq, op, entity_id, payload FROM outbox WHERE status = 'pending' ORDER BY seq LIMIT 1",
      );
      if (!entry) return;
      try {
        const found = await send(entry);
        await runInTransaction(settleStatements(entry, found ? 'ok' : 'gone'), epoch);
        if (!found) lostEdits++;
      } catch (err) {
        if (!(err instanceof PermanentPushError)) throw err; // transient: stop, keep the order
        console.warn('[local] push failed permanently:', err.message);
        await runInTransaction([
          // Later entries for the same row build on this one, so they fail with it.
          {
            statement: "UPDATE outbox SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE entity_id = ? AND status = 'pending'",
            values: [err.message, entry.entity_id],
          },
          { statement: "UPDATE expenses SET sync_state = 'failed' WHERE id = ?", values: [entry.entity_id] },
        ], epoch);
      }
      pushed = true;
    }
  } finally {
    // Delete wins over edit (docs/android-app-plan.md §9): say so rather than
    // letting an offline edit vanish silently.
    if (lostEdits > 0) {
      toast.info(`${lostEdits === 1 ? 'A transaction you edited was' : `${lostEdits} transactions you edited were`} deleted on another device, so ${lostEdits === 1 ? 'the edit was' : 'the edits were'} dropped.`);
    }
    // The server now has newer versions of these rows; the next read pulls them.
    if (pushed) {
      markStale();
      refreshQueries();
    }
  }
}

let pushing: Promise<void> | null = null;

/** Replays the outbox against Supabase. Concurrent callers share one drain. Rejects on a transient failure. */
export function pushOutbox(): Promise<void> {
  if (!pushing) {
    pushing = drain().finally(() => {
      pushing = null;
    });
  }
  return pushing;
}

export interface SyncCounts { pending: number; failed: number; lastError: string | null }

/** Counts for the sync status indicator. */
export async function readSyncCounts(): Promise<SyncCounts> {
  const rows = await query<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM outbox GROUP BY status');
  const count = (s: string) => Number(rows.find(r => r.status === s)?.n ?? 0);
  const failed = count('failed');
  const [last] = failed
    ? await query<{ last_error: string | null }>("SELECT last_error FROM outbox WHERE status = 'failed' ORDER BY seq DESC LIMIT 1")
    : [];
  return { pending: count('pending'), failed, lastError: last?.last_error ?? null };
}

// ─── Rejected changes ──────────────────────────────────────────────────────

export interface FailedChange {
  id: string;
  description: string;
  amount: number | null;
  currency: string;
  date: string | null;
  /** True when the row never reached the server (its insert was rejected). */
  isNew: boolean;
  isDelete: boolean;
  error: string | null;
}

/** One entry per transaction with rejected changes, oldest first. */
export async function readFailedChanges(): Promise<FailedChange[]> {
  const rows = await query<{ entity_id: string; ops: string; error: string | null; row_json: string | null }>(
    `SELECT o.entity_id, GROUP_CONCAT(o.op) AS ops, MAX(o.last_error) AS error, e.row_json
       FROM outbox o LEFT JOIN expenses e ON e.id = o.entity_id
      WHERE o.status = 'failed'
      GROUP BY o.entity_id
      ORDER BY MIN(o.seq)`,
  );
  return rows.map(r => {
    const row = r.row_json ? (JSON.parse(r.row_json) as Row) : {};
    const ops = r.ops.split(',');
    return {
      id: r.entity_id,
      description: String(row.merchant_name || row.description || 'Transaction'),
      amount: row.amount === undefined ? null : Number(row.amount),
      currency: typeof row.currency === 'string' ? row.currency : 'INR',
      date: typeof row.date === 'string' ? row.date : null,
      isNew: ops.includes('insert'),
      isDelete: ops.includes('delete'),
      error: r.error,
    };
  });
}

/** Puts every rejected change back in the queue and pushes (e.g. after a server-side fix). */
export async function retryFailed(): Promise<void> {
  await runInTransaction([
    { statement: "UPDATE outbox SET status = 'pending', last_error = NULL WHERE status = 'failed'", values: [] },
    {
      statement: `UPDATE expenses SET sync_state = CASE
          WHEN EXISTS (SELECT 1 FROM outbox WHERE entity_id = expenses.id AND op = 'insert') THEN 'pending_insert'
          WHEN local_deleted = 1 THEN 'pending_delete'
          ELSE 'pending_update' END
        WHERE sync_state = 'failed'`,
      values: [],
    },
  ]);
  afterLocalWrite();
}

/**
 * Drops every rejected change and goes back to the server's version: rows
 * that never reached the server are removed; the rest are re-fetched (or
 * removed if the server no longer has them). Needs the network.
 */
export async function discardFailed(): Promise<number> {
  const failed = await readFailedChanges();
  if (failed.length === 0) return 0;
  const existing = failed.filter(f => !f.isNew).map(f => f.id);
  const serverRows = new Map<string, Row>();
  for (let i = 0; i < existing.length; i += 100) {
    const { data, error } = await supabase
      .from('expenses').select('*').in('id', existing.slice(i, i + 100)).abortSignal(sig());
    if (error) throw error;
    for (const r of (data ?? []) as unknown as Row[]) serverRows.set(r.id as string, r);
  }
  const statements: capSQLiteSet[] = [];
  for (const f of failed) {
    statements.push({ statement: 'DELETE FROM outbox WHERE entity_id = ?', values: [f.id] });
    const server = serverRows.get(f.id);
    statements.push(server
      ? rowStatement(server, 'synced')
      : { statement: 'DELETE FROM expenses WHERE id = ?', values: [f.id] });
  }
  await runInTransaction(statements);
  refreshQueries();
  return failed.length;
}
