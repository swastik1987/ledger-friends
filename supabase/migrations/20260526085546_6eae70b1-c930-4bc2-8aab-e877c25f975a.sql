
-- 1. Profiles: restrict SELECT to self + shared-tracker members
DROP POLICY IF EXISTS "Anyone authenticated can read profiles" ON public.profiles;

CREATE POLICY "Users can read own and shared-tracker profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tracker_members tm1
      JOIN public.tracker_members tm2 ON tm1.tracker_id = tm2.tracker_id
      WHERE tm1.user_id = auth.uid()
        AND tm2.user_id = profiles.id
    )
  );

-- 2. Tracker members: remove self-insert, add admin-auto-insert trigger
DROP POLICY IF EXISTS "Admin can insert members" ON public.tracker_members;

CREATE POLICY "Admin can insert members"
  ON public.tracker_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tracker_admin(auth.uid(), tracker_id));

-- Auto-add creator as admin member when tracker is created
CREATE OR REPLACE FUNCTION public.add_tracker_admin_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tracker_members (tracker_id, user_id, role)
  VALUES (NEW.id, NEW.admin_id, 'admin')
  ON CONFLICT (tracker_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_tracker_admin_member ON public.trackers;
CREATE TRIGGER trg_add_tracker_admin_member
  AFTER INSERT ON public.trackers
  FOR EACH ROW EXECUTE FUNCTION public.add_tracker_admin_member();

-- 3. Revoke EXECUTE on SECURITY DEFINER helpers from anon
REVOKE EXECUTE ON FUNCTION public.is_tracker_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_tracker_admin(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_tracker_stats(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_tracker_admin_member() FROM anon, public, authenticated;

GRANT EXECUTE ON FUNCTION public.is_tracker_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tracker_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tracker_stats(uuid) TO authenticated;
