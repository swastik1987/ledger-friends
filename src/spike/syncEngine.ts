import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { getDb, getMeta, setMeta } from './localDb';

// Phase 0 spike (throwaway) — see docs/android-spike-runbook.md.
// Prototypes the sync rules from docs/android-app-plan.md §4:
//  1. Client-generated UUIDs make pushes idempotent — a retried insert that
//     already landed fails with 23505 and is treated as success.
//  2. The server owns updated_at — payloads never carry it, so pull cursors
//     only ever compare server timestamps.
//  3. Pulls re-read an overlap window behind the cursor, because now() is the
//     transaction *start* time and a slow commit can land behind a cursor.
//  4. A pulled row never overwrites a local row that's still pending push.

type ExpenseRow = Tables<'expenses'>;
type ExpenseInsert = TablesInsert<'expenses'>;

const PULL_OVERLAP_MS = 5 * 60_000;
const UNIQUE_VIOLATION = '23505';
const LAST_SPIKE_ID_KEY = 'last_spike_expense_id';

export interface LocalExpense {
  id: string;
  tracker_id: string;
  date: string;
  updated_at: string | null;
  row_json: string;
  sync_status: 'synced' | 'pending';
}

export interface OutboxEntry {
  seq: number;
  op: string;
  entity_id: string;
  payload: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

export interface PushResult {
  /** Outbox entries drained, including the ones recovered via 23505. */
  pushed: number;
  /** Entries that were already on the server (a retry after a lost response). */
  recoveredDuplicates: number;
  error: string | null;
}

export type NewExpense = Pick<
  ExpenseInsert,
  'tracker_id' | 'category_id' | 'amount' | 'currency' | 'date' | 'description' | 'is_debit' | 'created_by_id' | 'created_by_name'
>;

/** Writes the row locally and queues it for push, atomically. Works offline. */
export async function createExpenseOffline(input: NewExpense): Promise<string> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payload: ExpenseInsert = {
    ...input,
    id,
    source: 'manual',
    is_transfer: false,
    suspected_transfer: false,
    rejected_as_transfer: false,
    // Device time: when the user actually added it, even if it syncs hours later.
    created_at: createdAt,
    // updated_at deliberately omitted — the server assigns it (rule 2).
  };
  const db = await getDb();
  // Row + outbox entry commit together, so a crash can't leave a local row that never syncs.
  await db.executeSet([
    {
      statement: "INSERT INTO expenses (id, tracker_id, date, updated_at, row_json, sync_status) VALUES (?, ?, ?, NULL, ?, 'pending')",
      values: [id, input.tracker_id, input.date, JSON.stringify(payload)],
    },
    {
      statement: 'INSERT INTO outbox (op, entity_id, payload, created_at) VALUES (?, ?, ?, ?)',
      values: ['insert_expense', id, JSON.stringify(payload), createdAt],
    },
  ], true);
  await setMeta(LAST_SPIKE_ID_KEY, id);
  return id;
}

/** Drains the outbox in order. Stops at the first failure so order is preserved. */
export async function pushOutbox(): Promise<PushResult> {
  const db = await getDb();
  const entries = ((await db.query('SELECT * FROM outbox ORDER BY seq', [])).values ?? []) as OutboxEntry[];
  const result: PushResult = { pushed: 0, recoveredDuplicates: 0, error: null };

  for (const entry of entries) {
    const payload = JSON.parse(entry.payload) as ExpenseInsert;
    let serverRow: ExpenseRow | null = null;

    const inserted = await supabase.from('expenses').insert(payload).select().single();
    if (!inserted.error) {
      serverRow = inserted.data;
    } else if (inserted.error.code === UNIQUE_VIOLATION) {
      // An earlier attempt already landed but its response was lost (rule 1).
      const existing = await supabase.from('expenses').select('*').eq('id', entry.entity_id).single();
      if (existing.error) return recordFailure(entry, existing.error.message, result);
      serverRow = existing.data;
      result.recoveredDuplicates++;
    } else {
      // Offline, RLS denial, FK violation… all stop the drain here. Phase 4 must
      // split transient from permanent failures, or one poison entry blocks the
      // queue forever (plan §4, rule 5).
      return recordFailure(entry, inserted.error.message, result);
    }

    await db.executeSet([
      {
        statement: "UPDATE expenses SET row_json = ?, updated_at = ?, sync_status = 'synced' WHERE id = ?",
        values: [JSON.stringify(serverRow), serverRow.updated_at, entry.entity_id],
      },
      { statement: 'DELETE FROM outbox WHERE seq = ?', values: [entry.seq] },
    ], true);
    result.pushed++;
  }
  return result;
}

async function recordFailure(entry: OutboxEntry, message: string, result: PushResult): Promise<PushResult> {
  const db = await getDb();
  await db.run('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?', [message, entry.seq]);
  return { ...result, error: message };
}

/** Pulls rows changed since the last pull (minus an overlap window) into SQLite. */
export async function pullExpenses(trackerId: string): Promise<number> {
  const cursorKey = `pull_cursor:${trackerId}`;
  const cursor = await getMeta(cursorKey);
  const since = cursor ? new Date(new Date(cursor).getTime() - PULL_OVERLAP_MS).toISOString() : null;

  const rows = await fetchAllPages<ExpenseRow>((from, to) => {
    let query = supabase.from('expenses').select('*').eq('tracker_id', trackerId);
    if (since) query = query.gt('updated_at', since);
    return query.order('updated_at', { ascending: true }).order('id', { ascending: true }).range(from, to);
  });
  if (rows.length === 0) return 0;

  const db = await getDb();
  // The WHERE on DO UPDATE is rule 4: a locally pending row keeps its local version.
  await db.executeSet(rows.map(row => ({
    statement: `INSERT INTO expenses (id, tracker_id, date, updated_at, row_json, sync_status)
      VALUES (?, ?, ?, ?, ?, 'synced')
      ON CONFLICT(id) DO UPDATE SET
        tracker_id = excluded.tracker_id,
        date = excluded.date,
        updated_at = excluded.updated_at,
        row_json = excluded.row_json
      WHERE expenses.sync_status = 'synced'`,
    values: [row.id, row.tracker_id, row.date, row.updated_at, JSON.stringify(row)],
  })), true);

  // Server timestamps share one format/offset, so string comparison orders them.
  const newest = rows.reduce<string | null>(
    (max, r) => (r.updated_at && (!max || r.updated_at > max) ? r.updated_at : max),
    null,
  );
  if (newest) await setMeta(cursorKey, newest);
  return rows.length;
}

/**
 * Re-queues the last row this device created (and already synced) to exercise
 * the 23505 recovery path — simulates a push whose response was lost.
 */
export async function requeueLastSpikeExpense(): Promise<string | null> {
  const id = await getMeta(LAST_SPIKE_ID_KEY);
  if (!id) return null;
  const db = await getDb();
  const res = await db.query("SELECT row_json FROM expenses WHERE id = ? AND sync_status = 'synced'", [id]);
  const rowJson = res.values?.[0]?.row_json as string | undefined;
  if (!rowJson) return null;
  const payload = JSON.parse(rowJson) as Partial<ExpenseRow>;
  delete payload.updated_at;
  await db.run(
    'INSERT INTO outbox (op, entity_id, payload, created_at) VALUES (?, ?, ?, ?)',
    ['insert_expense', id, JSON.stringify(payload), new Date().toISOString()],
  );
  return id;
}

export async function listLocalExpenses(trackerId: string, limit = 25): Promise<LocalExpense[]> {
  const db = await getDb();
  const res = await db.query(
    'SELECT * FROM expenses WHERE tracker_id = ? ORDER BY date DESC, id DESC LIMIT ?',
    [trackerId, limit],
  );
  return (res.values ?? []) as LocalExpense[];
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const db = await getDb();
  return ((await db.query('SELECT * FROM outbox ORDER BY seq', [])).values ?? []) as OutboxEntry[];
}

export async function localCounts(): Promise<{ expenses: number; pending: number; outbox: number }> {
  const db = await getDb();
  const res = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM expenses) AS expenses,
       (SELECT COUNT(*) FROM expenses WHERE sync_status = 'pending') AS pending,
       (SELECT COUNT(*) FROM outbox) AS outbox`,
    [],
  );
  const row = res.values?.[0] ?? {};
  return { expenses: Number(row.expenses ?? 0), pending: Number(row.pending ?? 0), outbox: Number(row.outbox ?? 0) };
}
