
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trackers table
CREATE TABLE public.trackers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  admin_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.trackers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_trackers_updated_at
  BEFORE UPDATE ON public.trackers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tracker members table
CREATE TABLE public.tracker_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id uuid NOT NULL REFERENCES public.trackers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE (tracker_id, user_id)
);
ALTER TABLE public.tracker_members ENABLE ROW LEVEL SECURITY;

-- Helper function to check tracker membership (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_tracker_member(_user_id uuid, _tracker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tracker_members
    WHERE user_id = _user_id AND tracker_id = _tracker_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tracker_admin(_user_id uuid, _tracker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tracker_members
    WHERE user_id = _user_id AND tracker_id = _tracker_id AND role = 'admin'
  );
$$;

-- Tracker RLS policies
CREATE POLICY "Members can read their trackers" ON public.trackers
  FOR SELECT TO authenticated
  USING (public.is_tracker_member(auth.uid(), id));
CREATE POLICY "Admin can update tracker" ON public.trackers
  FOR UPDATE TO authenticated
  USING (admin_id = auth.uid());
CREATE POLICY "Admin can delete tracker" ON public.trackers
  FOR DELETE TO authenticated
  USING (admin_id = auth.uid());
CREATE POLICY "Authenticated users can create trackers" ON public.trackers
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid());

-- Tracker members RLS policies
CREATE POLICY "Members can view tracker members" ON public.tracker_members
  FOR SELECT TO authenticated
  USING (public.is_tracker_member(auth.uid(), tracker_id));
CREATE POLICY "Admin can insert members" ON public.tracker_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tracker_admin(auth.uid(), tracker_id) OR user_id = auth.uid());
CREATE POLICY "Admin can update member roles" ON public.tracker_members
  FOR UPDATE TO authenticated
  USING (public.is_tracker_admin(auth.uid(), tracker_id));
CREATE POLICY "Members can delete own membership or admin can remove" ON public.tracker_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_tracker_admin(auth.uid(), tracker_id));

-- Categories table
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id uuid REFERENCES public.trackers(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL,
  color text NOT NULL,
  is_system boolean DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read system or tracker categories" ON public.categories
  FOR SELECT TO authenticated
  USING (is_system = true OR public.is_tracker_member(auth.uid(), tracker_id));
CREATE POLICY "Members can insert custom categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (tracker_id IS NOT NULL AND public.is_tracker_member(auth.uid(), tracker_id));
CREATE POLICY "Members can update custom categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (tracker_id IS NOT NULL AND public.is_tracker_member(auth.uid(), tracker_id));
CREATE POLICY "Creator or admin can delete custom categories" ON public.categories
  FOR DELETE TO authenticated
  USING (tracker_id IS NOT NULL AND (created_by = auth.uid() OR public.is_tracker_admin(auth.uid(), tracker_id)));

-- Seed system categories
INSERT INTO public.categories (name, icon, color, is_system) VALUES
  ('Food & Dining', '🍽️', '#FF6B6B', true),
  ('Groceries', '🛒', '#51CF66', true),
  ('Transport', '🚗', '#339AF0', true),
  ('Fuel', '⛽', '#FF922B', true),
  ('Shopping', '🛍️', '#CC5DE8', true),
  ('Entertainment', '🎬', '#F06595', true),
  ('Travel', '✈️', '#20C997', true),
  ('Healthcare', '🏥', '#74C0FC', true),
  ('Utilities', '💡', '#FFD43B', true),
  ('Rent', '🏠', '#A9E34B', true),
  ('Education', '📚', '#4DABF7', true),
  ('Personal Care', '💄', '#F783AC', true),
  ('Subscriptions', '📱', '#748FFC', true),
  ('EMI / Loan', '🏦', '#63E6BE', true),
  ('Insurance', '🛡️', '#69DB7C', true),
  ('Investments', '📈', '#38D9A9', true),
  ('Gifts & Donations', '🎁', '#FFA94D', true),
  ('Office & Business', '💼', '#A9A9A9', true),
  ('Miscellaneous', '📦', '#CED4DA', true);

-- Expenses table
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id uuid NOT NULL REFERENCES public.trackers(id) ON DELETE CASCADE,
  created_by_id uuid NOT NULL REFERENCES public.profiles(id),
  created_by_name text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'INR',
  date date NOT NULL,
  description text NOT NULL,
  merchant_name text,
  payment_method text CHECK (payment_method IN ('UPI','Credit Card','Debit Card','Net Banking','Cash','Other')),
  notes text,
  tags text[] DEFAULT '{}',
  reference_number text,
  is_debit boolean NOT NULL DEFAULT true,
  source text NOT NULL CHECK (source IN ('manual','statement_upload')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members can read tracker expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (public.is_tracker_member(auth.uid(), tracker_id));
CREATE POLICY "Members can insert expenses" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tracker_member(auth.uid(), tracker_id) AND created_by_id = auth.uid());
CREATE POLICY "Creator or admin can update expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (created_by_id = auth.uid() OR public.is_tracker_admin(auth.uid(), tracker_id));
CREATE POLICY "Creator or admin can delete expenses" ON public.expenses
  FOR DELETE TO authenticated
  USING (created_by_id = auth.uid() OR public.is_tracker_admin(auth.uid(), tracker_id));

-- Enable realtime on expenses
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;

-- Category learning table
CREATE TABLE public.category_learning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_description text NOT NULL UNIQUE,
  merchant_name text,
  category_id uuid NOT NULL REFERENCES public.categories(id),
  applied_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.category_learning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read category_learning" ON public.category_learning
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert category_learning" ON public.category_learning
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update category_learning" ON public.category_learning
  FOR UPDATE TO authenticated USING (true);
