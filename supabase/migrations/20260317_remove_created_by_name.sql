-- Remove created_by_name from expenses table.
-- The name is now always fetched from the profiles table via created_by_id join.
ALTER TABLE public.expenses DROP COLUMN IF EXISTS created_by_name;
