/**
 * merchantExtraction — pure helpers to clean up merchant_name / description
 * extracted from uploaded bank statements.
 *
 * Design philosophy: trust Gemini where it helps, but never trust it blindly.
 * Every value the model returns gets normalized (whitespace, casing, suffixes,
 * length). When the model omits merchant_name, we attempt a deterministic
 * backfill from raw_description. When description ends up empty or a verbatim
 * copy of the merchant, we substitute a generic phrase derived from
 * payment_method + direction.
 */

import type { PaymentMethod } from '@/types';

// ── Tokens we strip from raw narration when backfilling merchant_name ──
// These are channel prefixes, reference markers, and corporate-suffix noise
// common in Indian bank statements (and conservatively useful elsewhere).
const NOISE_PREFIXES = new Set([
  // Channel
  'upi', 'pos', 'ach', 'neft', 'imps', 'rtgs', 'ecs', 'nach', 'cms', 'iift',
  'atm', 'wdl', 'inb', 'mob', 'nb', 'inft', 'inet', 'tpt', 'iam',
  // Tags
  'ref', 'refno', 'no', 'ref:', 'txn', 'txnid', 'id', 'rrn', 'utr',
  // Generic actions
  'payment', 'paid', 'received', 'recd', 'transfer', 'purchase', 'pur',
  'debit', 'credit', 'dr', 'cr', 'auto', 'autopay', 'autodbt',
  // Bill
  'bill', 'billpay', 'billdesk', 'epay',
  // Single letters left after stripping
  'a', 'b', 'p', 'm', 's',
]);

const CORP_SUFFIXES = new Set([
  'ltd', 'limited', 'pvt', 'private', 'inc', 'corp', 'co', 'company',
  'llp', 'plc', 'gmbh', 'sa', 'bv', 'srl', 'pte',
]);

/** Title-case a single token (first letter upper, rest lower). */
function titleCase(token: string): string {
  if (!token) return '';
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** Title-case a phrase, leaving connector tokens lowercase. */
function titleCasePhrase(phrase: string): string {
  const minor = new Set(['and', 'or', 'of', 'the', 'for', 'in', 'on', 'at', 'to', 'by']);
  return phrase
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => (i > 0 && minor.has(word.toLowerCase())) ? word.toLowerCase() : titleCase(word))
    .join(' ');
}

/**
 * Normalize a merchant_name string returned by the AI.
 * - Trims whitespace
 * - Strips channel prefixes that snuck through (UPI-, POS-, etc.)
 * - Strips trailing corporate suffixes (Pvt Ltd, Inc, …)
 * - Strips UPI handles (anything containing @)
 * - Strips trailing digit blocks (order IDs)
 * - Caps length at 40 chars
 * - Title-cases the result
 */
export function normalizeMerchant(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.trim();
  if (!s) return '';

  // Drop UPI handles (foo@bank → foo)
  s = s.replace(/([A-Za-z0-9._-]+)@[A-Za-z0-9.]+/g, '$1');

  // Tokenize on non-alphanumeric (keep spaces)
  const tokens = s
    .split(/[^A-Za-z0-9&'.-]+/)
    .filter(Boolean);

  // Drop leading noise prefixes
  let i = 0;
  while (i < tokens.length && NOISE_PREFIXES.has(tokens[i].toLowerCase())) i++;
  // Drop trailing corporate suffixes
  let j = tokens.length;
  while (j > i && CORP_SUFFIXES.has(tokens[j - 1].toLowerCase().replace(/\.$/, ''))) j--;
  // Drop trailing pure-digit reference tokens (≥4 digits)
  while (j > i && /^\d{4,}$/.test(tokens[j - 1])) j--;

  const cleaned = tokens.slice(i, j).join(' ');
  if (!cleaned) return '';

  // Cap length
  const capped = cleaned.length > 40 ? cleaned.slice(0, 40).trim() : cleaned;
  return titleCasePhrase(capped);
}

/**
 * Backfill merchant_name from raw_description when the AI returned nothing useful.
 * Strategy: tokenize, strip noise prefixes / corporate suffixes / digit tokens,
 * keep the first 1-3 meaningful alphanumeric tokens.
 *
 * Returns '' when the narration is pure noise (e.g. "UPI/REF/123456").
 */
export function extractMerchantFromRaw(rawDesc: string | null | undefined): string {
  if (!rawDesc) return '';
  // First reuse the same cleanup that handles the easy case (already mostly merchant).
  const normalized = normalizeMerchant(rawDesc);
  if (!normalized) return '';

  // Truncate to the first 3 tokens for readability
  const firstThree = normalized.split(/\s+/).slice(0, 3).join(' ');
  return firstThree;
}

/**
 * Produce a short generic description when no useful narration exists beyond
 * the merchant. Used as a fallback when description ends up empty or matches
 * merchant_name verbatim.
 */
export function genericDescription(opts: {
  paymentMethod?: PaymentMethod | string | null;
  isDebit: boolean;
  categoryName?: string | null;
  isTransfer?: boolean;
}): string {
  const { paymentMethod, isDebit, categoryName, isTransfer } = opts;

  // Credit-side categories often have a more natural phrase than the generic action.
  if (!isDebit) {
    const cat = (categoryName || '').toLowerCase();
    if (cat.includes('salary')) return 'Salary credit';
    if (cat.includes('refund')) return 'Refund';
    if (cat.includes('cashback')) return 'Cashback';
    if (cat.includes('interest')) return 'Interest credit';
    if (cat.includes('reimbursement')) return 'Reimbursement';
  }

  if (isTransfer) return 'Transfer';

  switch (paymentMethod) {
    case 'UPI': return 'UPI payment';
    case 'Credit Card': return isDebit ? 'Card purchase' : 'Card refund';
    case 'Debit Card': return isDebit ? 'Card purchase' : 'Card refund';
    case 'Online': return isDebit ? 'Online payment' : 'Online credit';
    case 'Cash': return isDebit ? 'Cash withdrawal' : 'Cash deposit';
    default:
      return isDebit ? 'Purchase' : 'Credit';
  }
}

/**
 * Resolve the final description. Cleans raw description, falls back to a
 * generic phrase when no distinct content survives.
 *
 * Rules:
 * - Trim and cap at 80 chars (visual; the card uses CSS truncate).
 * - If empty after trim OR identical to merchant_name (case-insensitive),
 *   return a generic phrase from paymentMethod + direction.
 */
export function resolveDescription(opts: {
  aiDescription: string | null | undefined;
  rawDescription?: string | null;
  merchantName?: string | null;
  paymentMethod?: PaymentMethod | string | null;
  isDebit: boolean;
  categoryName?: string | null;
  isTransfer?: boolean;
}): string {
  const { aiDescription, merchantName, paymentMethod, isDebit, categoryName, isTransfer } = opts;
  const trimmed = (aiDescription || '').trim();
  const merchantTrimmed = (merchantName || '').trim();

  // Same as merchant (case-insensitive) → generic
  if (
    !trimmed ||
    (merchantTrimmed && trimmed.toLowerCase() === merchantTrimmed.toLowerCase())
  ) {
    return genericDescription({ paymentMethod, isDebit, categoryName, isTransfer });
  }

  // Light strip of leading channel prefixes when merchant is set and the
  // description starts with one (e.g. "UPI/SWIGGY" with merchant=Swiggy).
  let candidate = trimmed;
  if (merchantTrimmed) {
    const prefixMatch = candidate.match(/^(upi|pos|neft|imps|rtgs|ach)[-:\s/]+/i);
    if (prefixMatch) candidate = candidate.slice(prefixMatch[0].length);
  }

  return candidate.length > 80 ? candidate.slice(0, 80).trim() : candidate;
}

/**
 * Canonicalize merchant_name across a batch so the same merchant always
 * renders identically. Clusters by lowercased prefix (first 6 chars) and
 * picks the most-common surface form per cluster. Bias toward already-clean
 * variants (shorter, fewer digits).
 *
 * Pure function — returns a new array.
 */
export function canonicalizeMerchants<T extends { merchant_name?: string | null }>(
  rows: T[],
): T[] {
  type Bucket = { keys: Map<string, number>; total: number };
  const buckets = new Map<string, Bucket>();

  const bucketKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);

  for (const row of rows) {
    const name = (row.merchant_name || '').trim();
    if (!name) continue;
    const k = bucketKey(name);
    if (!k) continue;
    let b = buckets.get(k);
    if (!b) { b = { keys: new Map(), total: 0 }; buckets.set(k, b); }
    b.keys.set(name, (b.keys.get(name) || 0) + 1);
    b.total += 1;
  }

  // For each bucket choose the canonical surface form.
  const canonical = new Map<string, string>();
  for (const [k, b] of buckets) {
    let best = '';
    let bestScore = -Infinity;
    for (const [name, count] of b.keys) {
      // Score = frequency × clean-bonus. Clean-bonus penalizes digits and length.
      const digitPenalty = (name.match(/\d/g) || []).length;
      const lengthPenalty = Math.max(0, name.length - 20) / 4;
      const score = count * 10 - digitPenalty - lengthPenalty;
      if (score > bestScore) { bestScore = score; best = name; }
    }
    canonical.set(k, best);
  }

  return rows.map(row => {
    const name = (row.merchant_name || '').trim();
    if (!name) return row;
    const k = bucketKey(name);
    const winner = canonical.get(k);
    if (!winner || winner === name) return row;
    return { ...row, merchant_name: winner };
  });
}
