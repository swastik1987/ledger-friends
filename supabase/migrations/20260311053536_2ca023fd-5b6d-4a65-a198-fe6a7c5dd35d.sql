
-- Drop ALL existing policies and recreate as PERMISSIVE

-- TRACKERS
DROP POLICY IF EXISTS "Authenticated users can create trackers" ON public.trackers;
DROP POLICY IF EXISTS "Members can read their trackers" ON public.trackers;
DROP POLICY IF EXISTS "Admin can update tracker" ON public.trackers;
DROP POLICY IF EXISTS "Admin can delete tracker" ON public.trackers;

CREATE POLICY "Authenticated users can create trackers" ON public.trackers FOR INSERT TO authenticated WITH CHECK (admin_id = auth.uid());
CREATE POLICY "Members can read their trackers" ON public.trackers FOR SELECT TO authenticated USING (is_tracker_member(auth.uid(), id));
CREATE POLICY "Admin can update tracker" ON public.trackers FOR UPDATE TO authenticated USING (admin_id = auth.uid());
CREATE POLICY "Admin can delete tracker" ON public.trackers FOR DELETE TO authenticated USING (admin_id = auth.uid());

-- TRACKER_MEMBERS
DROP POLICY IF EXISTS "Admin can insert members" ON public.tracker_members;
DROP POLICY IF EXISTS "Members can view tracker members" ON public.tracker_members;
DROP POLICY IF EXISTS "Admin can update member roles" ON public.tracker_members;
DROP POLICY IF EXISTS "Members can delete own membership or admin can remove" ON public.tracker_members;

CREATE POLICY "Admin can insert members" ON public.tracker_members FOR INSERT TO authenticated WITH CHECK (is_tracker_admin(auth.uid(), tracker_id) OR (user_id = auth.uid()));
CREATE POLICY "Members can view tracker members" ON public.tracker_members FOR SELECT TO authenticated USING (is_tracker_member(auth.uid(), tracker_id));
CREATE POLICY "Admin can update member roles" ON public.tracker_members FOR UPDATE TO authenticated USING (is_tracker_admin(auth.uid(), tracker_id));
CREATE POLICY "Members can delete own membership or admin can remove" ON public.tracker_members FOR DELETE TO authenticated USING ((user_id = auth.uid()) OR is_tracker_admin(auth.uid(), tracker_id));

-- EXPENSES
DROP POLICY IF EXISTS "Members can read tracker expenses" ON public.expenses;
DROP POLICY IF EXISTS "Members can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Creator or admin can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Creator or admin can delete expenses" ON public.expenses;

CREATE POLICY "Members can read tracker expenses" ON public.expenses FOR SELECT TO authenticated USING (is_tracker_member(auth.uid(), tracker_id));
CREATE POLICY "Members can insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (is_tracker_member(auth.uid(), tracker_id) AND (created_by_id = auth.uid()));
CREATE POLICY "Creator or admin can update expenses" ON public.expenses FOR UPDATE TO authenticated USING ((created_by_id = auth.uid()) OR is_tracker_admin(auth.uid(), tracker_id));
CREATE POLICY "Creator or admin can delete expenses" ON public.expenses FOR DELETE TO authenticated USING ((created_by_id = auth.uid()) OR is_tracker_admin(auth.uid(), tracker_id));

-- CATEGORIES
DROP POLICY IF EXISTS "Read system or tracker categories" ON public.categories;
DROP POLICY IF EXISTS "Members can insert custom categories" ON public.categories;
DROP POLICY IF EXISTS "Members can update custom categories" ON public.categories;
DROP POLICY IF EXISTS "Creator or admin can delete custom categories" ON public.categories;

CREATE POLICY "Read system or tracker categories" ON public.categories FOR SELECT TO authenticated USING ((is_system = true) OR is_tracker_member(auth.uid(), tracker_id));
CREATE POLICY "Members can insert custom categories" ON public.categories FOR INSERT TO authenticated WITH CHECK ((tracker_id IS NOT NULL) AND is_tracker_member(auth.uid(), tracker_id));
CREATE POLICY "Members can update custom categories" ON public.categories FOR UPDATE TO authenticated USING ((tracker_id IS NOT NULL) AND is_tracker_member(auth.uid(), tracker_id));
CREATE POLICY "Creator or admin can delete custom categories" ON public.categories FOR DELETE TO authenticated USING ((tracker_id IS NOT NULL) AND ((created_by = auth.uid()) OR is_tracker_admin(auth.uid(), tracker_id)));

-- CATEGORY_LEARNING
DROP POLICY IF EXISTS "Authenticated can read category_learning" ON public.category_learning;
DROP POLICY IF EXISTS "Authenticated can insert category_learning" ON public.category_learning;
DROP POLICY IF EXISTS "Authenticated can update category_learning" ON public.category_learning;

CREATE POLICY "Authenticated can read category_learning" ON public.category_learning FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert category_learning" ON public.category_learning FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update category_learning" ON public.category_learning FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- PROFILES
DROP POLICY IF EXISTS "Anyone authenticated can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Anyone authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
