-- Migration: add raw_description column to expenses
-- Preserves the bank statement's original narration for every uploaded transaction.
-- Useful for debugging miscategorisations, future re-parsing, and surfacing the
-- full original text on the edit modal when the user wants more context than
-- the cleaned description provides.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS raw_description TEXT;

COMMENT ON COLUMN public.expenses.raw_description IS
  'Original narration from the source statement, preserved verbatim. NULL for manually-entered transactions.';
