-- Add is_transfer flag to expenses for internal transfer detection.
-- Transfers are preserved in the database but excluded from dashboard totals.

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_transfer boolean NOT NULL DEFAULT false;

-- Index for fast filtering of non-transfer transactions in summaries
CREATE INDEX IF NOT EXISTS idx_expenses_is_transfer ON public.expenses (tracker_id, is_transfer) WHERE is_transfer = false;
