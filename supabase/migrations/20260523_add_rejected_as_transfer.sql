-- Add rejected_as_transfer flag to expenses.
-- This is the mirror of is_transfer: where is_transfer=true means "user
-- confirmed this IS a transfer", rejected_as_transfer=true means "user
-- confirmed this is NOT a transfer". The client-side pair-match heuristic
-- (debit/credit pairs within ±1 day, amounts within 1%) must honour
-- rejections, otherwise rejected pairs reappear in the review sheet on
-- every refetch.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS rejected_as_transfer boolean NOT NULL DEFAULT false;

-- Partial index so the pair-match query can cheaply skip rejected rows.
CREATE INDEX IF NOT EXISTS idx_expenses_rejected_as_transfer
  ON public.expenses (tracker_id)
  WHERE rejected_as_transfer = true;
