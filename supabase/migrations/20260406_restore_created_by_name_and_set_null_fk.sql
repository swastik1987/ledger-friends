-- Restore created_by_name column for data preservation when users delete their accounts.
-- When a user deletes their account, created_by_id becomes NULL but the name persists.

-- Step 1: Add created_by_name column back
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS created_by_name text;

-- Step 2: Backfill from profiles
UPDATE public.expenses e
SET created_by_name = p.full_name
FROM public.profiles p
WHERE e.created_by_id = p.id
  AND e.created_by_name IS NULL;

-- Step 3: Drop the existing FK constraint and recreate with ON DELETE SET NULL
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_created_by_id_fkey;

-- Make created_by_id nullable (required for SET NULL to work)
ALTER TABLE public.expenses ALTER COLUMN created_by_id DROP NOT NULL;

-- Recreate FK with SET NULL
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_created_by_id_fkey
  FOREIGN KEY (created_by_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;
