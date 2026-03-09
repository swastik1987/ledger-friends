-- Drop all RESTRICTIVE policies and recreate as PERMISSIVE

-- TRACKERS
DROP POLICY IF EXISTS "Authenticated users can create trackers" ON public.trackers;
DROP POLICY IF EXISTS "Members can read their trackers" ON public.trackers;
DROP POLICY IF EXISTS "Admin can update tracker" ON public.trackers;
DROP POLICY IF EXISTS "Admin can delete tracker" ON public.trackers;

CREATE POLICY "Authenticated users can create trackers" ON public.trackers
  FOR INSERT TO authenticated WITH CHECK (admin_id = auth.uid());

CREATE POLICY "Members can read their trackers" ON public.trackers
  FOR SELECT TO authenticated USING (is_tracker_member(auth.uid(), id));

CREATE POLICY "Admin can update tracker" ON public.trackers
  FOR UPDATE TO authenticated USING (admin_id = auth.uid());

CREATE POLICY "Admin can delete tracker" ON public.trackers
  FOR DELETE TO authenticated USING (admin_id = auth.uid());

-- TRACKER_MEMBERS
DROP POLICY IF EXISTS "Admin can insert members" ON public.tracker_members;
DROP POLICY IF EXISTS "Members can view tracker members" ON public.tracker_members;
DROP POLICY IF EXISTS "Admin can update member roles" ON public.tracker_members;
DROP POLICY IF EXISTS "Members can delete own membership or admin can remove" ON public.tracker_members;

CREATE POLICY "Admin can insert members" ON public.tracker_members
  FOR INSERT TO authenticated WITH CHECK (is_tracker_admin(auth.uid(), tracker_id) OR (user_id = auth.uid()));

CREATE POLICY "Members can view tracker members" ON public.tracker_members
  FOR SELECT TO authenticated USING (is_tracker_member(auth.uid(), tracker_id));

CREATE POLICY "Admin can update member roles" ON public.tracker_members
  FOR UPDATE TO authenticated USING (is_tracker_admin(auth.uid(), tracker_id));

CREATE POLICY "Members can delete own membership or admin can remove" ON public.tracker_members
  FOR DELETE TO authenticated USING ((user_id = auth.uid()) OR is_tracker_admin(auth.uid(), tracker_id));