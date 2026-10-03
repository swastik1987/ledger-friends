-- Contact form (/contact): messages from visitors and users, including
-- account-deletion requests (Google Play requires a web way to ask for one).
--
-- Anyone, signed in or not, can INSERT; nobody can read, change or delete
-- rows through the API (no SELECT/UPDATE/DELETE policies). The owner reads
-- them in the Supabase / Lovable table editor.

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  topic text NOT NULL CHECK (topic IN ('general', 'privacy', 'account_deletion', 'bug')),
  name text CHECK (name IS NULL OR char_length(name) <= 120),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320 AND position('@' IN email) > 1),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  -- Set automatically for signed-in senders; NULL for visitors.
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- A signed-in sender can only attach their own user id; visitors none.
CREATE POLICY "Anyone can send a contact message"
  ON public.contact_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

GRANT INSERT ON public.contact_messages TO anon, authenticated;
