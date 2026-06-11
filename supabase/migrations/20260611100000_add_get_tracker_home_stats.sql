-- Server-side aggregation for the Home page (useTrackerHomeStats).
--
-- Previously the client downloaded EVERY expense row of every tracker the
-- user belongs to, just to compute net expense, a transaction count, and a
-- per-month trend. This RPC pushes the aggregation into Postgres and returns
-- one row per (tracker, month) — a few dozen rows instead of thousands.
--
-- Net-expense semantics mirror src/lib/netOutgo.ts exactly:
--   * per month, per category: outgo = non-transfer debits, inflow =
--     non-transfer credits
--   * a category contributes GREATEST(outgo - inflow, 0) to the month's net
--   * txn_count counts ALL rows in the month (transfers included), matching
--     the old client-side rows.length
--
-- SECURITY DEFINER bypasses RLS on expenses, so membership is enforced
-- inline against auth.uid() — the function takes no user parameter on
-- purpose (a caller must never be able to read another user's stats).

CREATE OR REPLACE FUNCTION public.get_tracker_home_stats()
RETURNS TABLE (tracker_id uuid, month text, net_expense numeric, txn_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_cat AS (
    SELECT
      e.tracker_id,
      to_char(e.date, 'YYYY-MM') AS month,
      e.category_id,
      COALESCE(SUM(e.amount) FILTER (WHERE e.is_debit AND NOT COALESCE(e.is_transfer, false)), 0) AS outgo,
      COALESCE(SUM(e.amount) FILTER (WHERE NOT e.is_debit AND NOT COALESCE(e.is_transfer, false)), 0) AS inflow,
      COUNT(*) AS cnt
    FROM public.expenses e
    WHERE EXISTS (
      SELECT 1 FROM public.tracker_members tm
      WHERE tm.tracker_id = e.tracker_id AND tm.user_id = auth.uid()
    )
    GROUP BY e.tracker_id, to_char(e.date, 'YYYY-MM'), e.category_id
  )
  SELECT
    per_cat.tracker_id,
    per_cat.month,
    SUM(GREATEST(per_cat.outgo - per_cat.inflow, 0)) AS net_expense,
    SUM(per_cat.cnt) AS txn_count
  FROM per_cat
  GROUP BY per_cat.tracker_id, per_cat.month
  ORDER BY per_cat.tracker_id, per_cat.month;
$$;

-- Same grant posture as the other callable helpers (migration #21):
-- authenticated only.
REVOKE EXECUTE ON FUNCTION public.get_tracker_home_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tracker_home_stats() TO authenticated;
