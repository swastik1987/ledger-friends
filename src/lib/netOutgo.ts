import { Expense } from '@/types';

/**
 * Minimal expense shape the flow/net-outgo math needs. Accepting a structural
 * subset (rather than the full Expense) lets callers pass lightweight rows —
 * e.g. the Home page's per-tracker aggregation query selects only these fields.
 */
export type FlowExpense = Pick<Expense, 'category_id' | 'amount' | 'is_debit' | 'is_transfer'>;
export type DatedFlowExpense = FlowExpense & Pick<Expense, 'date'>;

/** Per-category debit (outgo) and credit (inflow) totals. */
export interface CategoryFlow {
  outgo: number;
  inflow: number;
}

/**
 * Aggregate non-transfer expenses into per-category {outgo, inflow} totals.
 * Transfers are excluded — they net to zero and aren't real spend/income.
 */
export function categoryFlows(expenses: FlowExpense[]): Map<string, CategoryFlow> {
  const map = new Map<string, CategoryFlow>();
  for (const e of expenses) {
    if (e.is_transfer) continue;
    const flow = map.get(e.category_id) || { outgo: 0, inflow: 0 };
    if (e.is_debit) flow.outgo += e.amount;
    else flow.inflow += e.amount;
    map.set(e.category_id, flow);
  }
  return map;
}

/** Net outgo for a single category: outgo − inflow, or 0 when inflow ≥ outgo. */
export function categoryNetOutgo(flow: CategoryFlow): number {
  return flow.outgo > flow.inflow ? flow.outgo - flow.inflow : 0;
}

/**
 * Total net outgo across all categories: the sum of (outgo − inflow) for every
 * category where outgo exceeds inflow. Categories whose inflow ≥ outgo are
 * excluded entirely. Always ≤ total debits.
 */
export function netOutgoTotal(expenses: FlowExpense[]): number {
  let total = 0;
  for (const flow of categoryFlows(expenses).values()) {
    total += categoryNetOutgo(flow);
  }
  return total;
}

/** Total debits (Total Out) across non-transfer expenses. */
export function totalOut(expenses: FlowExpense[]): number {
  return expenses
    .filter(e => !e.is_transfer && e.is_debit)
    .reduce((s, e) => s + e.amount, 0);
}

/** Total credits (Total In) across non-transfer expenses. */
export function totalIn(expenses: FlowExpense[]): number {
  return expenses
    .filter(e => !e.is_transfer && !e.is_debit)
    .reduce((s, e) => s + e.amount, 0);
}

/**
 * Daily net outgo series (ascending by date): for each date, the day's debits
 * minus its credits.
 */
export function dailyNetOutgo(expenses: DatedFlowExpense[]): { date: string; value: number }[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (e.is_transfer) continue;
    const delta = e.is_debit ? e.amount : -e.amount;
    map.set(e.date, (map.get(e.date) || 0) + delta);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

/**
 * Daily outgo series (ascending by date): for each date with at least one
 * debit, the day's total debit amount. Used by the Dashboard sparkline +
 * hover indicator.
 */
export function dailyOutgo(expenses: DatedFlowExpense[]): { date: string; value: number }[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (e.is_transfer || !e.is_debit) continue;
    map.set(e.date, (map.get(e.date) || 0) + e.amount);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

/**
 * Monthly net-expense series (ascending by month): for each calendar month
 * (YYYY-MM), the category-based net outgo within that month. Drives the small
 * per-tracker trend sparkline on the Home page.
 */
export function monthlyNetExpense(expenses: DatedFlowExpense[]): { date: string; value: number }[] {
  const byMonth = new Map<string, DatedFlowExpense[]>();
  for (const e of expenses) {
    const m = e.date.slice(0, 7);
    const arr = byMonth.get(m);
    if (arr) arr.push(e);
    else byMonth.set(m, [e]);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({ date, value: netOutgoTotal(rows) }));
}
