
-- Fix category_learning INSERT policy to require authenticated user
DROP POLICY "Authenticated can insert category_learning" ON public.category_learning;
CREATE POLICY "Authenticated can insert category_learning" ON public.category_learning
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Fix category_learning UPDATE policy to only allow incrementing applied_count
DROP POLICY "Authenticated can update category_learning" ON public.category_learning;
CREATE POLICY "Authenticated can update category_learning" ON public.category_learning
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
