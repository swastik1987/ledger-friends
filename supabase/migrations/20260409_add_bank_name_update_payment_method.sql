-- Add bank_name column for source bank identification
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS bank_name text;

-- Update payment_method CHECK constraint: rename 'Net Banking' → 'Online'
-- First migrate existing data
UPDATE public.expenses SET payment_method = 'Online' WHERE payment_method = 'Net Banking';

-- Drop old constraint and add new one
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_payment_method_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_method_check
  CHECK (payment_method IN ('UPI', 'Credit Card', 'Debit Card', 'Online', 'Cash', 'Other'));
