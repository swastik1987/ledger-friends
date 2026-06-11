-- Pinned trackers for the Home page bento tiles (max 3, enforced client-side;
-- order matters — the first id renders as the large hero tile).
-- Synced to the profile so the selection follows the user across devices.
-- Covered by the existing "Users can update own profile" UPDATE policy.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pinned_tracker_ids uuid[] NOT NULL DEFAULT '{}';
