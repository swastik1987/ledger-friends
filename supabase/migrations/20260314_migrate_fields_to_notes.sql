-- Migration: Consolidate merchant_name, payment_method, tags, reference_number into notes field
-- This is a one-time data migration. The removed form fields still exist in the DB schema
-- (they are populated by statement uploads), but manual entry will only use notes going forward.

UPDATE public.expenses
SET notes = TRIM(BOTH E'\n' FROM
  COALESCE(notes, '') ||
  CASE WHEN merchant_name IS NOT NULL AND merchant_name != ''
    THEN E'\nMerchant: ' || merchant_name ELSE '' END ||
  CASE WHEN payment_method IS NOT NULL AND payment_method != ''
    THEN E'\nPayment: ' || payment_method ELSE '' END ||
  CASE WHEN reference_number IS NOT NULL AND reference_number != ''
    THEN E'\nRef: ' || reference_number ELSE '' END ||
  CASE WHEN tags IS NOT NULL AND array_length(tags, 1) > 0
    THEN E'\nTags: ' || array_to_string(tags, ', ') ELSE '' END
)
WHERE
  (merchant_name IS NOT NULL AND merchant_name != '') OR
  (payment_method IS NOT NULL AND payment_method != '') OR
  (reference_number IS NOT NULL AND reference_number != '') OR
  (tags IS NOT NULL AND array_length(tags, 1) > 0);
