import { onlineManager } from '@tanstack/react-query';
import type { capSQLiteSet } from '@capacitor-community/sqlite';
import { supabase } from '@/integrations/supabase/client';
import { readStoredUser } from '@/lib/storedSession';
import { fetchAllPages } from '@/lib/fetchAllPages';
import type { Profile } from '@/types';
import { currentEpoch, getMeta, query, runInTransaction, setMetaStatement, wipe } from './db';
import { currentStaleGen, LocalNotSyncedError, refreshQueries, writeCachedProfile } from './state';

// Pull engine for the Android app's local store (docs/android-app-plan.md §3–4).
//
// Local reads are stale-while-revalidate: a read returns what SQLite has right
// away and starts a pull, and when the pull brings changes every active query
// re-reads. A read waits for the pull only when:
// - the device has never synced, so there's nothing to show; or
// - something is known to have changed since this data was last pulled (a
//   successful write, or a realtime event: markStale()), so that a row the
//   user just deleted doesn't flash back.
// Offline, reads return local data without trying the network.
//
// Two kinds of pull:
// - meta: profiles, trackers, members, categories, banks. Small tables,
//   replaced wholesale on each pull.
// - expenses: incremental by the server-stamped `updated_at` (plan §4 rule 2),
//   across every tracker the user can see, re-reading a 5-minute overlap
//   (rule 3). One cursor for all trackers, so a row moved between trackers
//   arrives with its new tracker_id. A pull by `updated_at` can't see hard
//   deletes, so each refresh also compares the tracker's row count with the
//   server's, and on a mismatch fetches the tracker's ids and drops local rows
//   the server no longer has.

const FRESH_MS = 2_000; // a pull this recent, with nothing marked stale since, is reused
const OVERLAP_MS = 5 * 60_000;
const PAGE = 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const WAIT_AFTER_CHANGE_MS = 4_000; // then show local data; the pull finishes in the background
const WAIT_FIRST_SYNC_MS = 60_000; // nothing local to show yet, so wait for the network

const sig = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

type Row = Record<string, unknown>;

/** A pull resolves true when it changed the local store. */
type Pull = () => Promise<boolean>;

// ─── Single-flight per staleness generation ────────────────────────────────
// Concurrent callers share one pull. A caller that arrives after markStale()
// doesn't join a pull that started before the change: it queues a new one.

class GenFlight {
  private entry: { gen: number; promise: Promise<boolean> } | null = null;
  constructor(private readonly fn: Pull) {}

  run(): Promise<boolean> {
    const gen = currentStaleGen();
    if (this.entry && this.entry.gen === gen) return this.entry.promise;
    const prev = this.entry?.promise.catch(() => false) ?? Promise.resolve(false);
    const entry = { gen, promise: prev.then(() => this.fn()) };
    this.entry = entry;
    void entry.promise.catch(() => false).then(() => {
      if (this.entry === entry) this.entry = null;
    });
    return entry.promise;
  }
}

interface Scope {
  flight: GenFlight;
  lastOkAt: number;
  /** Staleness generation the last successful pull started at; -1 before the first. */
  lastOkGen: number;
}

const scopes = new Map<string, Scope>();

function scope(key: string, pull: Pull): Scope {
  let s = scopes.get(key);
  if (!s) {
    s = { flight: new GenFlight(pull), lastOkAt: 0, lastOkGen: -1 };
    scopes.set(key, s);
  }
  return s;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// A failed pull while the device says it's online is retried with backoff:
// right after a reconnect Android reports "online" a moment before requests
// actually get through (plan §4, rule 6).
const RETRY_DELAYS_MS = [3_000, 10_000, 30_000, 60_000];
let retryAttempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(): void {
  if (retryTimer || !navigator.onLine) return;
  const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
  retryAttempt++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    refreshQueries();
  }, delay);
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string };
    return `${e.code ?? ''} ${e.message ?? JSON.stringify(err)}`.trim();
  }
  return String(err);
}

/**
 * Starts (or joins) a pull for `s` and decides how long the read waits for it.
 * Resolves true if local data is known to be current.
 */
async function refresh(s: Scope, synced: boolean): Promise<boolean> {
  // onlineManager assumes online until it sees an `offline` event, so an
  // offline cold start needs navigator.onLine too.
  if (!onlineManager.isOnline() || !navigator.onLine) return false;
  const gen = currentStaleGen();
  if (s.lastOkGen === gen && Date.now() - s.lastOkAt < FRESH_MS) return true;

  const settled = s.flight.run().then(
    changed => {
      s.lastOkAt = Date.now();
      s.lastOkGen = gen;
      retryAttempt = 0;
      return { ok: true, changed };
    },
    (err: unknown) => {
      console.warn('[local] pull failed:', describe(err));
      scheduleRetry();
      return { ok: false, changed: false };
    },
  );

  const knownChange = s.lastOkGen !== -1 && s.lastOkGen !== gen;
  const waitMs = !synced ? WAIT_FIRST_SYNC_MS : knownChange ? WAIT_AFTER_CHANGE_MS : 0;
  const result = waitMs > 0
    ? await Promise.race([settled, sleep(waitMs).then(() => null)])
    : null;
  if (result) return result.ok;

  // The caller reads local data now; re-run the reads if this pull changes anything.
  void settled.then(r => {
    if (r.ok && r.changed) refreshQueries();
  });
  return false;
}

// ─── Meta pull ─────────────────────────────────────────────────────────────

/** Wipes the store if it holds another account's data. */
async function bindUser(userId: string): Promise<void> {
  const owner = await getMeta('user_id');
  if (owner && owner !== userId) await wipe();
  if (owner !== userId) await runInTransaction([setMetaStatement('user_id', userId)]);
}

function insertJson(table: string, id: string, row: Row): capSQLiteSet {
  return { statement: `INSERT OR REPLACE INTO ${table} (id, row_json) VALUES (?, ?)`, values: [id, JSON.stringify(row)] };
}

/** Cheap fingerprint of the pulled meta tables, to tell whether a pull changed anything. */
function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${h >>> 0}`;
}

async function pullMeta(): Promise<boolean> {
  const user = readStoredUser();
  if (!user) throw new Error('Not signed in');
  await bindUser(user.id);
  const epoch = currentEpoch();

  const [profileRes, membersRes, trackersRes, categoriesRes, banksRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).abortSignal(sig()).maybeSingle(),
    supabase.from('tracker_members').select('*, profile:profiles(*)').order('id').abortSignal(sig()),
    supabase.from('trackers').select('*').order('id').abortSignal(sig()),
    supabase.from('categories').select('*').order('id').abortSignal(sig()),
    supabase.from('banks').select('*').order('id').abortSignal(sig()),
  ]);
  for (const res of [profileRes, membersRes, trackersRes, categoriesRes]) {
    if (res.error) throw res.error;
  }
  // The banks registry may not be migrated on every project (useBanks degrades the same way).
  const banksMissing = banksRes.error && (banksRes.error.code === '42P01' || banksRes.error.code === 'PGRST205');
  if (banksRes.error && !banksMissing) throw banksRes.error;
  const banks = (banksMissing ? [] : banksRes.data ?? []) as Row[];

  const ownProfile = profileRes.data as Row | null;
  if (ownProfile) writeCachedProfile(ownProfile as unknown as Profile);

  const sig2 = fingerprint(JSON.stringify([ownProfile, membersRes.data, trackersRes.data, categoriesRes.data, banks]));
  if (sig2 === (await getMeta('meta_fingerprint'))) {
    await runInTransaction([setMetaStatement('meta_synced_at', new Date().toISOString())], epoch);
    return false;
  }

  const profiles = new Map<string, Row>();
  const statements: capSQLiteSet[] = [
    { statement: 'DELETE FROM tracker_members', values: [] },
    { statement: 'DELETE FROM profiles', values: [] },
    { statement: 'DELETE FROM trackers', values: [] },
    { statement: 'DELETE FROM categories', values: [] },
    { statement: 'DELETE FROM banks', values: [] },
  ];

  for (const m of (membersRes.data ?? []) as Row[]) {
    const { profile, ...member } = m;
    if (profile && typeof profile === 'object') profiles.set((profile as Row).id as string, profile as Row);
    statements.push({
      statement: 'INSERT OR REPLACE INTO tracker_members (id, tracker_id, user_id, row_json) VALUES (?, ?, ?, ?)',
      values: [member.id, member.tracker_id, member.user_id, JSON.stringify(member)],
    });
  }
  if (ownProfile) profiles.set(ownProfile.id as string, ownProfile);
  for (const [id, p] of profiles) statements.push(insertJson('profiles', id, p));

  const trackerIds: string[] = [];
  for (const t of (trackersRes.data ?? []) as Row[]) {
    trackerIds.push(t.id as string);
    statements.push(insertJson('trackers', t.id as string, t));
  }
  for (const c of (categoriesRes.data ?? []) as Row[]) {
    statements.push({
      statement: 'INSERT OR REPLACE INTO categories (id, tracker_id, is_system, row_json) VALUES (?, ?, ?, ?)',
      values: [c.id, c.tracker_id ?? null, c.is_system ? 1 : 0, JSON.stringify(c)],
    });
  }
  for (const b of banks) statements.push(insertJson('banks', b.id as string, b));
  // Transactions of trackers the user no longer belongs to (left, removed, deleted).
  statements.push(
    trackerIds.length
      ? { statement: `DELETE FROM expenses WHERE tracker_id NOT IN (${trackerIds.map(() => '?').join(',')})`, values: trackerIds }
      : { statement: 'DELETE FROM expenses', values: [] },
  );
  statements.push(setMetaStatement('meta_fingerprint', sig2));
  statements.push(setMetaStatement('meta_synced_at', new Date().toISOString()));
  await runInTransaction(statements, epoch);
  return true;
}

// ─── Expenses pull ─────────────────────────────────────────────────────────

function upsertExpense(e: Row): capSQLiteSet {
  return {
    statement: `INSERT OR REPLACE INTO expenses
      (id, tracker_id, date, updated_at, category_id, amount, is_debit, is_transfer, row_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
      e.id, e.tracker_id, e.date, e.updated_at, e.category_id ?? null,
      Number(e.amount), e.is_debit ? 1 : 0, e.is_transfer ? 1 : 0, JSON.stringify(e),
    ],
  };
}

/** Downloads every expense changed since the cursor (all of them on the first run). */
async function pullExpenseChanges(): Promise<boolean> {
  const epoch = currentEpoch();
  const cursor = await getMeta('expenses_cursor');
  const cursorMs = cursor ? Date.parse(cursor) : -Infinity;
  const since = cursor ? new Date(cursorMs - OVERLAP_MS).toISOString() : null;
  let changed = false;

  // Keyset pagination on (updated_at, id): unlike offsets, it can't skip a row
  // when another row's edit reorders the result between pages.
  const fetchPage = async (after: { updated_at: string; id: string } | null): Promise<Row[]> => {
    let q = supabase.from('expenses').select('*');
    if (since) q = q.gte('updated_at', since);
    if (after) {
      q = q.or(`updated_at.gt."${after.updated_at}",and(updated_at.eq."${after.updated_at}",id.gt.${after.id})`);
    }
    const { data, error } = await q
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE)
      .abortSignal(sig());
    if (error) throw error;
    return (data ?? []) as unknown as Row[];
  };

  let pending = fetchPage(null);
  for (;;) {
    const rows = await pending;
    let last: { updated_at: string; id: string } | null = null;
    if (rows.length) {
      const tail = rows[rows.length - 1];
      last = { updated_at: tail.updated_at as string, id: tail.id as string };
    }
    // Download the next page while this one is written to SQLite.
    if (rows.length === PAGE) {
      pending = fetchPage(last);
      pending.catch(() => undefined); // surfaced by the await above on the next turn
    }
    if (last) {
      // Most rows in the overlap window are already here unchanged; anything
      // else (new, edited, or committed late with an earlier stamp) is news.
      const known = new Map<string, string>();
      for (let i = 0; i < rows.length; i += 500) { // older SQLite caps a statement at 999 parameters
        const ids = rows.slice(i, i + 500).map(r => r.id);
        const found = await query<{ id: string; updated_at: string }>(
          `SELECT id, updated_at FROM expenses WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
        for (const r of found) known.set(r.id, r.updated_at);
      }
      const news = rows.filter(r => known.get(r.id as string) !== r.updated_at);
      const statements = news.map(upsertExpense);
      // Advance the cursor with the rows it covers, so an interrupted pull resumes from here.
      if (Date.parse(last.updated_at) > cursorMs) statements.push(setMetaStatement('expenses_cursor', last.updated_at));
      if (news.length) changed = true;
      await runInTransaction(statements, epoch);
    }
    if (rows.length < PAGE) break;
  }
  return changed;
}

/** Drops local rows deleted on the server; fetches any the cursor missed. */
async function reconcileTracker(trackerId: string): Promise<boolean> {
  const epoch = currentEpoch();
  const { count, error } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('tracker_id', trackerId)
    .abortSignal(sig());
  if (error) throw error;
  const [{ n }] = await query<{ n: number }>('SELECT COUNT(*) AS n FROM expenses WHERE tracker_id = ?', [trackerId]);
  if (count === null || count === Number(n)) return false;

  const serverIds = new Set(
    (await fetchAllPages<{ id: string }>((from, to) =>
      supabase.from('expenses').select('id').eq('tracker_id', trackerId).order('id').range(from, to).abortSignal(sig()),
    )).map(r => r.id),
  );
  const localIds = (await query<{ id: string }>('SELECT id FROM expenses WHERE tracker_id = ?', [trackerId])).map(r => r.id);
  const localSet = new Set(localIds);
  const gone = localIds.filter(id => !serverIds.has(id));
  await runInTransaction(gone.map(id => ({ statement: 'DELETE FROM expenses WHERE id = ?', values: [id] })), epoch);

  const missing = [...serverIds].filter(id => !localSet.has(id));
  for (let i = 0; i < missing.length; i += 100) {
    const { data, error: fetchErr } = await supabase
      .from('expenses').select('*').in('id', missing.slice(i, i + 100)).abortSignal(sig());
    if (fetchErr) throw fetchErr;
    await runInTransaction(((data ?? []) as unknown as Row[]).map(upsertExpense), epoch);
  }
  return gone.length > 0 || missing.length > 0;
}

const metaScope = () => scope('meta', pullMeta);
const changes = new GenFlight(pullExpenseChanges);

function expensesScope(trackerId: string | 'all'): Scope {
  return scope(`expenses:${trackerId}`, async () => {
    const epoch = currentEpoch();
    const metaChanged = !(await getMeta('meta_synced_at')) ? await metaScope().flight.run() : false;
    const rowsChanged = await changes.run();
    const ids = trackerId === 'all'
      ? (await query<{ id: string }>('SELECT id FROM trackers')).map(r => r.id)
      : [trackerId];
    const reconciled = await Promise.all(ids.map(reconcileTracker));
    await runInTransaction([setMetaStatement('expenses_synced_at', new Date().toISOString())], epoch);
    return metaChanged || rowsChanged || reconciled.some(Boolean);
  });
}

// ─── Entry points for reads ────────────────────────────────────────────────

async function bindCurrentUser(): Promise<void> {
  const user = readStoredUser();
  if (user) await bindUser(user.id);
}

/** Brings trackers, members, profiles, categories and banks up to date if possible. */
export async function ensureMeta(): Promise<void> {
  await bindCurrentUser();
  const synced = !!(await getMeta('meta_synced_at'));
  const ok = await refresh(metaScope(), synced);
  if (!ok && !synced) throw new LocalNotSyncedError();
}

/** Brings one tracker's transactions (or every tracker's, with 'all') up to date if possible. */
export async function ensureExpenses(trackerId: string | 'all'): Promise<void> {
  await bindCurrentUser();
  const synced = !!(await getMeta('expenses_synced_at')) && !!(await getMeta('meta_synced_at'));
  const ok = await refresh(expensesScope(trackerId), synced);
  if (!ok && !synced) throw new LocalNotSyncedError();
}

/** Sign-out: nothing from this account stays on the device. */
export async function clearLocalData(): Promise<void> {
  scopes.clear();
  await wipe();
}
