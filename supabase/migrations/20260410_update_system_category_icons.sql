-- Migration: update system category icons from emoji to Phosphor icon names
-- System categories have tracker_id = NULL and cannot be updated via RLS from the client.
-- This migration runs directly in the DB to bypass RLS.

UPDATE public.categories SET icon = 'ForkKnife'       WHERE is_system = true AND name = 'Food & Dining';
UPDATE public.categories SET icon = 'ShoppingCart'    WHERE is_system = true AND name = 'Groceries';
UPDATE public.categories SET icon = 'Car'             WHERE is_system = true AND name = 'Transport';
UPDATE public.categories SET icon = 'Flame'           WHERE is_system = true AND name = 'Fuel';
UPDATE public.categories SET icon = 'ShoppingBag'     WHERE is_system = true AND name = 'Shopping';
UPDATE public.categories SET icon = 'GameController'  WHERE is_system = true AND name = 'Entertainment';
UPDATE public.categories SET icon = 'Suitcase'        WHERE is_system = true AND name = 'Travel';
UPDATE public.categories SET icon = 'FirstAidKit'     WHERE is_system = true AND name = 'Healthcare';
UPDATE public.categories SET icon = 'Lightning'       WHERE is_system = true AND name = 'Utilities';
UPDATE public.categories SET icon = 'House'           WHERE is_system = true AND name = 'Rent';
UPDATE public.categories SET icon = 'GraduationCap'   WHERE is_system = true AND name = 'Education';
UPDATE public.categories SET icon = 'Sparkle'         WHERE is_system = true AND name = 'Personal Care';
UPDATE public.categories SET icon = 'Bell'            WHERE is_system = true AND name = 'Subscriptions';
UPDATE public.categories SET icon = 'Receipt'         WHERE is_system = true AND name = 'EMI / Loan';
UPDATE public.categories SET icon = 'Umbrella'        WHERE is_system = true AND name = 'Insurance';
UPDATE public.categories SET icon = 'ChartLine'       WHERE is_system = true AND name = 'Investments';
UPDATE public.categories SET icon = 'Gift'            WHERE is_system = true AND name = 'Gifts & Donations';
UPDATE public.categories SET icon = 'Briefcase'       WHERE is_system = true AND name = 'Office & Business';
UPDATE public.categories SET icon = 'Tag'             WHERE is_system = true AND name = 'Miscellaneous';
UPDATE public.categories SET icon = 'HandCoins'       WHERE is_system = true AND name = 'Salary / Income';
UPDATE public.categories SET icon = 'ArrowsClockwise' WHERE is_system = true AND name = 'Refund';
UPDATE public.categories SET icon = 'ArrowsClockwise' WHERE is_system = true AND name = 'Reimbursement';
UPDATE public.categories SET icon = 'Coins'           WHERE is_system = true AND name = 'Cashback / Reward';
UPDATE public.categories SET icon = 'TrendUp'         WHERE is_system = true AND name = 'Interest Earned';
UPDATE public.categories SET icon = 'Money'           WHERE is_system = true AND name = 'Other Income';
