import { Expense } from '@/types';

/** Per-category debit (outgo) and credit (inflow) totals. */
export interface CategoryFlow {
  outgo: number;
  inflow: number;
}

/**
 * Aggregate non-transfer expenses into per-category {outgo, inflow} totals.
 * Transfers are excluded — they net to zero and aren't real spend/income.
 */
export function categoryFlows(expenses: Expense[]): Map<string, CategoryFlow> {
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
export function netOutgoTotal(expenses: Expense[]): number {
  let total = 0;
  for (const flow of categoryFlows(expenses).values()) {
    total += categoryNetOutgo(flow);
  }
  return total;
}

/** Total debits (Total Out) across non-transfer expenses. */
export function totalOut(expenses: Expense[]): number {
  return expenses
    .filter(e => !e.is_transfer && e.is_debit)
    .reduce((s, e) => s + e.amount, 0);
}

/** Total credits (Total In) across non-transfer expenses. */
export function totalIn(expenses: Expense[]): number {
  return expenses
    .filter(e => !e.is_transfer && !e.is_debit)
    .reduce((s, e) => s + e.amount, 0);
}

/**
 * Daily net outgo series (ascending by date): for each date, the day's debits
 * minus its credits. Used by the Dashboard sparkline + hover indicator.
 */
export function dailyNetOutgo(expenses: Expense[]): { date: string; value: number }[] {
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
