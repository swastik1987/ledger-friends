-- Migration: bank registry table + expenses.bank_id
--
-- Problem: expenses.bank_name is free text typed by the AI or the user, so the
-- same bank ends up stored under multiple spellings ("HDFC Bank", "HDFC Bank
-- Private Limited", "hdfc bank"), which fragments filters, autocomplete, and
-- the bank logo/color lookup in src/lib/bankBrand.ts.
--
-- Fix: a canonical `banks` table (name + aliases + logo domain + brand color)
-- that every write path resolves through (see src/lib/bankResolver.ts and
-- src/hooks/useBanks.ts). `expenses.bank_name` is kept as a denormalised
-- display cache — going forward the app always writes the canonical_name
-- into it alongside bank_id, so every existing read site (TxnRow, FilterSheet,
-- exports, …) keeps working unchanged.

-- ────────────────────────────────────────────────────────────────────
-- banks table
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL UNIQUE,
  aliases text[] NOT NULL DEFAULT '{}',
  domain text,
  brand_color text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;

-- Global reference data, same access pattern as category_learning: every
-- authenticated user can read/insert/update, nobody deletes from app code.
CREATE POLICY "Authenticated can read banks" ON public.banks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert banks" ON public.banks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update banks" ON public.banks
  FOR UPDATE TO authenticated USING (true);

COMMENT ON TABLE public.banks IS
  'Canonical bank/issuer registry. One row per real-world bank; aliases[] holds every free-text spelling that should resolve to it. domain feeds the Google favicon logo lookup; brand_color is the monogram fallback color.';

-- ────────────────────────────────────────────────────────────────────
-- Normalisation helper — mirrors src/lib/bankResolver.ts normalizeBankKey().
-- Strips legal-entity suffixes then a trailing "bank", so "HDFC Bank",
-- "HDFC Bank Private Limited" and "hdfc bank ltd" all collapse to "hdfc".
-- Keep the two implementations in sync if either changes.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_bank_name(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      trim(regexp_replace(lower(trim(name)), '\s*(private\s+limited|pvt\.?\s*ltd\.?|limited|ltd\.?)\s*$', '', 'i')),
      '\s*bank\s*$', '', 'i'
    )
  );
$$;

-- ────────────────────────────────────────────────────────────────────
-- Seed: curated Indian banks + card-first fintechs, promoted from the
-- hardcoded DOMAIN_MAP/BRAND_COLOR maps in src/lib/bankBrand.ts so the
-- registry starts pre-populated with the same coverage the app already had.
-- ────────────────────────────────────────────────────────────────────
INSERT INTO public.banks (canonical_name, aliases, domain, brand_color) VALUES
  ('HDFC Bank', ARRAY['HDFC', 'HDFC Bank Private Limited', 'HDFC Bank Ltd', 'HDFC Bank Limited'], 'hdfcbank.com', '#004C8F'),
  ('ICICI Bank', ARRAY['ICICI', 'ICICI Bank Limited', 'ICICI Bank Ltd'], 'icicibank.com', '#F38B23'),
  ('Axis Bank', ARRAY['Axis', 'Axis Bank Limited', 'Axis Bank Ltd'], 'axisbank.com', '#97144D'),
  ('RBL Bank', ARRAY['RBL', 'RBL Bank Limited'], 'rblbank.com', '#CE1126'),
  ('State Bank of India', ARRAY['SBI', 'State Bank Of India'], 'sbi.co.in', '#22409A'),
  ('Kotak Mahindra Bank', ARRAY['Kotak', 'Kotak Bank', 'Kotak Mahindra Bank Limited'], 'kotak.com', '#ED1C24'),
  ('Yes Bank', ARRAY['YES', 'Yes Bank Limited'], 'yesbank.in', '#00518F'),
  ('IDFC FIRST Bank', ARRAY['IDFC', 'IDFC First', 'IDFC First Bank', 'IDFC FIRST Bank Limited'], 'idfcfirstbank.com', '#882F3D'),
  ('IndusInd Bank', ARRAY['IndusInd', 'IndusInd Bank Limited'], 'indusind.com', '#722B2E'),
  ('Federal Bank', ARRAY['The Federal Bank', 'Federal Bank Limited'], 'federalbank.co.in', '#D4A017'),
  ('Punjab National Bank', ARRAY['PNB'], 'pnbindia.in', '#B40000'),
  ('Bank of Baroda', ARRAY['BoB', 'BOB'], 'bankofbaroda.in', '#F58220'),
  ('Canara Bank', ARRAY['Canara'], 'canarabank.com', '#00529B'),
  ('Union Bank of India', ARRAY['Union Bank'], 'unionbankofindia.co.in', '#FF8200'),
  ('AU Small Finance Bank', ARRAY['AU Bank', 'AU Small Finance Bank Limited'], 'aubank.in', '#732D7F'),
  ('Bandhan Bank', ARRAY['Bandhan Bank Limited'], 'bandhanbank.com', '#F5821F'),
  ('Standard Chartered', ARRAY['Standard Chartered Bank'], 'sc.com', '#0473EA'),
  ('HSBC', ARRAY['HSBC Bank'], 'hsbc.co.in', '#DB0011'),
  ('Citibank', ARRAY['Citi', 'Citi Bank'], 'citibank.com', '#056DAE'),
  ('Deutsche Bank', ARRAY['Deutsche'], 'db.com', '#0018A8'),
  ('DBS Bank', ARRAY['DBS'], 'dbs.com', '#DC0000'),
  ('Scapia', ARRAY[]::text[], 'scapia.cards', '#0E1814'),
  ('Jupiter', ARRAY[]::text[], 'jupiter.money', '#FF7A1A'),
  ('Fi Money', ARRAY['Fi'], 'fi.money', '#00C277'),
  ('CRED', ARRAY['Cred'], 'cred.club', '#181818'),
  ('OneCard', ARRAY['One Card'], 'getonecard.app', '#1A1A1A'),
  ('Slice', ARRAY[]::text[], 'sliceit.com', '#7B61FF'),
  ('Uni', ARRAY['Uni Cards'], 'uni.cards', '#FA4D5C'),
  ('Niyo', ARRAY[]::text[], 'goniyo.com', '#0093D0'),
  ('American Express', ARRAY['Amex'], 'americanexpress.com', '#006FCF')
ON CONFLICT (canonical_name) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- expenses.bank_id
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS bank_id uuid REFERENCES public.banks(id);

CREATE INDEX IF NOT EXISTS idx_expenses_bank_id ON public.expenses(bank_id);

-- ────────────────────────────────────────────────────────────────────
-- Backfill existing rows.
--
-- Step 1: match each distinct existing bank_name against the seed registry
-- (canonical_name or any alias, compared via normalize_bank_name so legal
-- suffixes/casing don't matter) and adopt the canonical spelling.
-- ────────────────────────────────────────────────────────────────────
WITH distinct_names AS (
  SELECT DISTINCT bank_name AS raw_name
  FROM public.expenses
  WHERE bank_name IS NOT NULL AND trim(bank_name) <> ''
),
matched AS (
  SELECT DISTINCT ON (dn.raw_name)
    dn.raw_name, b.id AS bank_id, b.canonical_name
  FROM distinct_names dn
  JOIN public.banks b
    ON public.normalize_bank_name(dn.raw_name) = public.normalize_bank_name(b.canonical_name)
    OR EXISTS (
         SELECT 1 FROM unnest(b.aliases) AS alias_elem(alias_val)
         WHERE public.normalize_bank_name(alias_val) = public.normalize_bank_name(dn.raw_name)
       )
  ORDER BY dn.raw_name, b.id
)
UPDATE public.expenses e
SET bank_id = m.bank_id,
    bank_name = m.canonical_name
FROM matched m
WHERE e.bank_name = m.raw_name;

-- Step 2: anything left over is a bank not in the seed list (obscure bank,
-- or a wallet/fintech we haven't curated). Register each distinct remaining
-- spelling as its own canonical bank so no existing data is lost or nulled —
-- these can be merged into a richer canonical entry later via the banks
-- table directly if near-duplicates turn out to exist among them.
INSERT INTO public.banks (canonical_name)
SELECT DISTINCT trim(bank_name)
FROM public.expenses
WHERE bank_name IS NOT NULL AND trim(bank_name) <> '' AND bank_id IS NULL
ON CONFLICT (canonical_name) DO NOTHING;

UPDATE public.expenses e
SET bank_id = b.id
FROM public.banks b
WHERE e.bank_id IS NULL
  AND e.bank_name IS NOT NULL AND trim(e.bank_name) <> ''
  AND trim(e.bank_name) = b.canonical_name;
