import type { Bank, Category, Expense, Profile, Tracker, TrackerMember, TrackerWithStats } from '@/types';
import type { TrackerHomeStat } from '@/hooks/useTrackers';
import { monthlyNetExpense, netExpenseSummedByMonth, type DatedFlowExpense } from '@/lib/netOutgo';
import { query } from './db';
import { ensureExpenses, ensureMeta } from './sync';

// Local equivalents of the Supabase reads behind the React Query hooks, for the
// Android app. Each one refreshes what it shows when it can (sync.ts), then
// reads SQLite and returns the same shape the hook returns on the web.

type JsonRow = { row_json: string };

const parseRows = <T>(rows: JsonRow[]): T[] => rows.map(r => JSON.parse(r.row_json) as T);

async function categoriesById(): Promise<Map<string, Category>> {
  const cats = parseRows<Category>(await query<JsonRow>('SELECT row_json FROM categories'));
  return new Map(cats.map(c => [c.id, c]));
}

async function profilesById(): Promise<Map<string, Profile>> {
  const profiles = parseRows<Profile>(await query<JsonRow>('SELECT row_json FROM profiles'));
  return new Map(profiles.map(p => [p.id, p]));
}

function monthBounds(month: string): [string, string] {
  const [year, mon] = month.split('-').map(Number);
  const mm = String(mon).padStart(2, '0');
  const lastDay = new Date(year, mon, 0).getDate();
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(lastDay).padStart(2, '0')}`];
}

const byNewest = (a: Expense, b: Expense) =>
  b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);

// ─── Trackers ──────────────────────────────────────────────────────────────

export async function readTrackers(): Promise<TrackerWithStats[]> {
  await Promise.all([ensureMeta(), ensureExpenses('all')]);
  const trackers = parseRows<Tracker>(await query<JsonRow>('SELECT row_json FROM trackers'));
  const members = await query<{ tracker_id: string; n: number }>(
    'SELECT tracker_id, COUNT(*) AS n FROM tracker_members GROUP BY tracker_id',
  );
  // Mirrors get_tracker_stats: total debits (transfers excluded) and the date
  // span of the tracker's transactions.
  const stats = await query<{ tracker_id: string; total_debit: number | null; min_date: string | null; max_date: string | null }>(
    `SELECT tracker_id,
            SUM(CASE WHEN is_debit = 1 AND is_transfer = 0 THEN amount ELSE 0 END) AS total_debit,
            MIN(date) AS min_date, MAX(date) AS max_date
       FROM expenses WHERE local_deleted = 0 GROUP BY tracker_id`,
  );
  const memberCount = new Map(members.map(m => [m.tracker_id, Number(m.n)]));
  const statsById = new Map(stats.map(s => [s.tracker_id, s]));

  return trackers
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(t => {
      const s = statsById.get(t.id);
      return {
        ...t,
        member_count: memberCount.get(t.id) ?? 0,
        monthly_total: Number(s?.total_debit ?? 0),
        date_range: s?.min_date && s?.max_date ? { min: s.min_date, max: s.max_date } : undefined,
      };
    });
}

/** Same figures as get_tracker_home_stats (per-month, per-category net outgo), computed from local rows. */
export async function readTrackerHomeStats(): Promise<Record<string, TrackerHomeStat>> {
  await Promise.all([ensureMeta(), ensureExpenses('all')]);
  const trackers = await query<{ id: string }>('SELECT id FROM trackers');
  const profiles = await profilesById();
  const members = await query<{ tracker_id: string; user_id: string }>('SELECT tracker_id, user_id FROM tracker_members');
  const rows = await query<{ tracker_id: string; category_id: string; amount: number; is_debit: number; is_transfer: number; date: string }>(
    'SELECT tracker_id, category_id, amount, is_debit, is_transfer, date FROM expenses WHERE local_deleted = 0',
  );

  const flowsByTracker = new Map<string, DatedFlowExpense[]>();
  for (const r of rows) {
    const flow: DatedFlowExpense = {
      category_id: r.category_id,
      amount: Number(r.amount),
      is_debit: !!r.is_debit,
      is_transfer: !!r.is_transfer,
      date: r.date,
    };
    const list = flowsByTracker.get(r.tracker_id);
    if (list) list.push(flow);
    else flowsByTracker.set(r.tracker_id, [flow]);
  }

  const out: Record<string, TrackerHomeStat> = {};
  for (const { id } of trackers) {
    const flows = flowsByTracker.get(id) ?? [];
    out[id] = {
      netExpense: netExpenseSummedByMonth(flows),
      txnCount: flows.length,
      trend: monthlyNetExpense(flows),
      memberNames: members
        .filter(m => m.tracker_id === id)
        .map(m => profiles.get(m.user_id)?.full_name?.trim())
        .filter((name): name is string => !!name),
    };
  }
  return out;
}

export async function readTracker(trackerId: string): Promise<Tracker> {
  await ensureMeta();
  const [row] = await query<JsonRow>('SELECT row_json FROM trackers WHERE id = ?', [trackerId]);
  if (!row) {
    // Same code PostgREST returns, so TrackerDetail treats it as "Tracker not found".
    throw Object.assign(new Error('Tracker not found'), { code: 'PGRST116' });
  }
  return JSON.parse(row.row_json) as Tracker;
}

export async function readTrackerMembers(trackerId: string): Promise<TrackerMember[]> {
  await ensureMeta();
  const profiles = await profilesById();
  const members = parseRows<TrackerMember>(
    await query<JsonRow>('SELECT row_json FROM tracker_members WHERE tracker_id = ?', [trackerId]),
  );
  return members.map(m => ({ ...m, profile: profiles.get(m.user_id) }));
}

export async function readCategories(trackerId?: string): Promise<Category[]> {
  await ensureMeta();
  const rows = trackerId
    ? await query<JsonRow>('SELECT row_json FROM categories WHERE is_system = 1 OR tracker_id = ?', [trackerId])
    : await query<JsonRow>('SELECT row_json FROM categories WHERE is_system = 1');
  return parseRows<Category>(rows).sort((a, b) => a.name.localeCompare(b.name));
}

export async function readBanks(): Promise<Bank[]> {
  await ensureMeta();
  return parseRows<Bank>(await query<JsonRow>('SELECT row_json FROM banks'))
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
}

// ─── Expenses ──────────────────────────────────────────────────────────────

/** Distinct 'yyyy-MM' months that have transactions, newest first. */
export async function readExpenseMonthKeys(trackerId: string): Promise<string[]> {
  await ensureExpenses(trackerId);
  const rows = await query<{ m: string }>(
    'SELECT DISTINCT substr(date, 1, 7) AS m FROM expenses WHERE tracker_id = ? AND local_deleted = 0 ORDER BY m DESC',
    [trackerId],
  );
  return rows.map(r => r.m);
}

export async function readExpenses(trackerId: string, month: string): Promise<Expense[]> {
  await Promise.all([ensureMeta(), ensureExpenses(trackerId)]);
  type Stored = JsonRow & { sync_state: string };
  const rows = month && month !== 'all'
    ? await query<Stored>(
        'SELECT row_json, sync_state FROM expenses WHERE tracker_id = ? AND local_deleted = 0 AND date >= ? AND date <= ?',
        [trackerId, ...monthBounds(month)],
      )
    : await query<Stored>('SELECT row_json, sync_state FROM expenses WHERE tracker_id = ? AND local_deleted = 0', [trackerId]);
  const [categories, profiles] = await Promise.all([categoriesById(), profilesById()]);

  return rows
    .map(r => {
      const e = JSON.parse(r.row_json) as Expense;
      return {
        ...e,
        amount: Number(e.amount),
        category: categories.get(e.category_id),
        created_by_profile: e.created_by_id ? profiles.get(e.created_by_id) : undefined,
        sync_status: syncStatus(r.sync_state),
      };
    })
    .sort(byNewest);
}

function syncStatus(state: string): Expense['sync_status'] {
  if (state === 'synced') return undefined;
  return state === 'failed' ? 'failed' : 'pending';
}

/** Same-day, same-amount transactions, for the duplicate warning on manual entry. */
export async function readDuplicateCandidates(trackerId: string, date: string, amount: number): Promise<Expense[]> {
  const rows = await query<JsonRow>(
    'SELECT row_json FROM expenses WHERE tracker_id = ? AND date = ? AND amount = ? AND local_deleted = 0 LIMIT 5',
    [trackerId, date, amount],
  );
  const categories = await categoriesById();
  return parseRows<Expense>(rows).map(e => ({ ...e, amount: Number(e.amount), category: categories.get(e.category_id) }));
}

/**
 * Every non-transfer row of a tracker, for the suspected-transfer review.
 * Slim rows, like the web query: the pair heuristic needs the whole history,
 * and full rows for a big tracker are megabytes over the plugin bridge.
 */
export async function readNonTransferExpenses(trackerId: string): Promise<Expense[]> {
  await Promise.all([ensureMeta(), ensureExpenses(trackerId)]);
  const rows = await query<{
    id: string; tracker_id: string; amount: number; date: string; is_debit: number; category_id: string;
    merchant_name: string | null; description: string | null; bank_name: string | null; currency: string | null;
    suspected_transfer: number | null; rejected_as_transfer: number | null;
  }>(
    `SELECT id, tracker_id, amount, date, is_debit, category_id,
            json_extract(row_json, '$.merchant_name') AS merchant_name,
            json_extract(row_json, '$.description') AS description,
            json_extract(row_json, '$.bank_name') AS bank_name,
            json_extract(row_json, '$.currency') AS currency,
            json_extract(row_json, '$.suspected_transfer') AS suspected_transfer,
            json_extract(row_json, '$.rejected_as_transfer') AS rejected_as_transfer
       FROM expenses WHERE tracker_id = ? AND is_transfer = 0 AND local_deleted = 0
      ORDER BY date DESC, id DESC`,
    [trackerId],
  );
  const categories = await categoriesById();
  return rows.map(r => ({
    ...r,
    amount: Number(r.amount),
    is_debit: !!r.is_debit,
    is_transfer: false,
    suspected_transfer: !!r.suspected_transfer,
    rejected_as_transfer: !!r.rejected_as_transfer,
    category: categories.get(r.category_id),
  })) as unknown as Expense[];
}
