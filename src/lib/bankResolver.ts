import { Bank } from '@/types';
import { similarity } from './stringSimilarity';

// Legal-entity / corporate suffixes that get typed inconsistently
// ("HDFC Bank" vs "HDFC Bank Private Limited"). Stripped before "bank" so
// "HDFC Bank Private Limited" and "HDFC Bank" both collapse to "hdfc".
const LEGAL_SUFFIX_RE = /\s*(private\s+limited|pvt\.?\s*ltd\.?|limited|ltd\.?)\s*$/i;
const BANK_SUFFIX_RE = /\s*bank\s*$/i;

/**
 * Normalises a bank name for comparison: lowercase, trim, strip a trailing
 * legal suffix, then strip a trailing "bank". Mirrors the SQL
 * `normalize_bank_name` function in the banks-registry migration — keep the
 * two in sync if either changes.
 */
export function normalizeBankKey(name: string): string {
  const noLegal = name.toLowerCase().trim().replace(LEGAL_SUFFIX_RE, '').trim();
  return noLegal.replace(BANK_SUFFIX_RE, '').trim();
}

// Below this fuzzy score, treat the input as a genuinely different bank
// rather than a misspelling of an existing one.
const FUZZY_THRESHOLD = 0.85;

/**
 * Resolves free-text bank input against the known `banks` registry:
 * 1. Exact match on canonical_name or any alias, after suffix-normalisation.
 * 2. Otherwise, the closest fuzzy match (Levenshtein similarity) against
 *    canonical names and aliases, if it clears FUZZY_THRESHOLD.
 * Returns null when nothing is close enough — the caller should treat the
 * input as a brand-new bank.
 */
export function findBankMatch(input: string, banks: Bank[]): Bank | null {
  const key = normalizeBankKey(input);
  if (!key) return null;

  for (const bank of banks) {
    if (normalizeBankKey(bank.canonical_name) === key) return bank;
    if (bank.aliases?.some(a => normalizeBankKey(a) === key)) return bank;
  }

  let best: Bank | null = null;
  let bestScore = 0;
  for (const bank of banks) {
    const candidates = [bank.canonical_name, ...(bank.aliases || [])];
    for (const candidate of candidates) {
      const score = similarity(key, normalizeBankKey(candidate));
      if (score > bestScore) {
        bestScore = score;
        best = bank;
      }
    }
  }
  return bestScore >= FUZZY_THRESHOLD ? best : null;
}
