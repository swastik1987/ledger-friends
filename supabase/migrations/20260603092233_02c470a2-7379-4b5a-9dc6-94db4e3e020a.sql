DROP POLICY IF EXISTS "Creator or admin can update expenses" ON public.expenses;
CREATE POLICY "Creator or admin can update expenses"
ON public.expenses
FOR UPDATE
TO authenticated
USING ((created_by_id = auth.uid()) OR is_tracker_admin(auth.uid(), tracker_id))
WITH CHECK (
  is_tracker_member(auth.uid(), tracker_id)
  AND ((created_by_id = auth.uid()) OR is_tracker_admin(auth.uid(), tracker_id))
);

DROP POLICY IF EXISTS "Members can update custom categories" ON public.categories;
CREATE POLICY "Members can update custom categories"
ON public.categories
FOR UPDATE
TO authenticated
USING ((tracker_id IS NOT NULL) AND is_tracker_member(auth.uid(), tracker_id))
WITH CHECK ((tracker_id IS NOT NULL) AND is_tracker_member(auth.uid(), tracker_id));
