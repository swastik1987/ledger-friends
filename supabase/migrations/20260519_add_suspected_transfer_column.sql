-- Add suspected_transfer flag to expenses.
-- Internal transfers are no longer auto-confirmed during statement parsing or manual entry.
-- Instead, suspected transfers are flagged for user review via the tracker page popup.
-- The user must explicitly confirm each suspected transfer as IS / IS NOT a transfer.

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS suspected_transfer boolean NOT NULL DEFAULT false;

-- Re-prompt existing auto-tagged transfers for user review:
-- Move them from is_transfer=true → suspected_transfer=true so the user can confirm.
UPDATE public.expenses
   SET suspected_transfer = true,
       is_transfer = false
 WHERE is_transfer = true;

-- Partial index for fast popup count lookup on each tracker load.
CREATE INDEX IF NOT EXISTS idx_expenses_suspected_transfer
  ON public.expenses (tracker_id)
  WHERE suspected_transfer = true AND is_transfer = false;
