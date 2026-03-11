
-- Fix: SELECT policy on trackers must also allow admin_id match for newly created trackers
DROP POLICY IF EXISTS "Members can read their trackers" ON public.trackers;
CREATE POLICY "Members can read their trackers" ON public.trackers FOR SELECT TO authenticated USING (admin_id = auth.uid() OR is_tracker_member(auth.uid(), id));
