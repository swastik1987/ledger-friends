/**
 * Bank visual identity helpers.
 *
 * Strategy: try to render a real bank logo via Clearbit's free logo CDN
 * (`https://logo.clearbit.com/<domain>`). For well-known Indian banks we
 * carry a curated name→domain map so the right domain is used even when
 * the user's text doesn't match the corporate domain (e.g. "HDFC" vs
 * "hdfcbank.com"). For anything unknown we fall back to a heuristic
 * domain guess, and if Clearbit 404s the consumer renders a colored
 * monogram disc instead (see <BankBadge>).
 *
 * The color palette is a small, muted set chosen to play well with the
 * Sand & Ember background. Hashing is deterministic so the same bank
 * always gets the same color across users and sessions.
 */

// ──────────────────────────────────────────────────────────────────────
// Curated domain map. Lowercased keys. Add aliases liberally — both the
// short form ("HDFC") and the full form ("HDFC Bank") should resolve.
// ──────────────────────────────────────────────────────────────────────
const DOMAIN_MAP: Record<string, string> = {
  // Indian private/public banks
  'hdfc bank': 'hdfcbank.com',
  'hdfc': 'hdfcbank.com',
  'icici bank': 'icicibank.com',
  'icici': 'icicibank.com',
  'axis bank': 'axisbank.com',
  'axis': 'axisbank.com',
  'rbl bank': 'rblbank.com',
  'rbl': 'rblbank.com',
  'sbi': 'sbi.co.in',
  'state bank of india': 'sbi.co.in',
  'kotak mahindra bank': 'kotak.com',
  'kotak': 'kotak.com',
  'yes bank': 'yesbank.in',
  'yes': 'yesbank.in',
  'idfc first bank': 'idfcfirstbank.com',
  'idfc first': 'idfcfirstbank.com',
  'idfc': 'idfcfirstbank.com',
  'indusind bank': 'indusind.com',
  'indusind': 'indusind.com',
  'federal bank': 'federalbank.co.in',
  'punjab national bank': 'pnbindia.in',
  'pnb': 'pnbindia.in',
  'bank of baroda': 'bankofbaroda.in',
  'bob': 'bankofbaroda.in',
  'canara bank': 'canarabank.com',
  'canara': 'canarabank.com',
  'union bank of india': 'unionbankofindia.co.in',
  'au small finance bank': 'aubank.in',
  'au bank': 'aubank.in',
  'bandhan bank': 'bandhanbank.com',

  // Foreign banks operating in India
  'standard chartered': 'sc.com',
  'hsbc': 'hsbc.co.in',
  'citi': 'citibank.com',
  'citibank': 'citibank.com',
  'deutsche bank': 'db.com',
  'dbs': 'dbs.com',
  'dbs bank': 'dbs.com',

  // Card-first fintechs
  'scapia': 'scapia.cards',
  'jupiter': 'jupiter.money',
  'fi money': 'fi.money',
  'fi': 'fi.money',
  'cred': 'cred.club',
  'one card': 'getonecard.app',
  'onecard': 'getonecard.app',
  'slice': 'sliceit.com',
  'uni': 'uni.cards',
  'niyo': 'goniyo.com',

  // Networks (sometimes appear as "bank" in narration)
  'american express': 'americanexpress.com',
  'amex': 'americanexpress.com',
};

/**
 * Best-effort domain heuristic for banks not in DOMAIN_MAP. Strips
 * non-alphanumerics and appends ".com". Often wrong (DBS Bank → dbsbank.com
 * instead of dbs.com), so we always combine this with an onError handler in
 * <BankBadge> that falls back to a monogram disc when the logo doesn't load.
 */
function guessDomain(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  return slug ? `${slug}.com` : '';
}

export function bankDomain(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase().trim();
  if (DOMAIN_MAP[key]) return DOMAIN_MAP[key];
  // Also try stripping "Bank" suffix from the lookup.
  const stripped = key.replace(/\s+bank$/, '').trim();
  if (DOMAIN_MAP[stripped]) return DOMAIN_MAP[stripped];
  const guess = guessDomain(name);
  return guess || undefined;
}

export function bankLogoUrl(name: string | undefined | null, sizePx = 64): string | undefined {
  const domain = bankDomain(name);
  if (!domain) return undefined;
  // Clearbit serves a square PNG. `size` only affects rendered output;
  // we keep it modest to limit bandwidth.
  return `https://logo.clearbit.com/${domain}?size=${sizePx}`;
}

// ──────────────────────────────────────────────────────────────────────
// Monogram + hashed color (fallback when logo unavailable).
// ──────────────────────────────────────────────────────────────────────

// 8-slot muted palette tuned to look intentional on the cream background.
// Order matters — first-fit is by hash modulo length, so don't reshuffle.
const PALETTE = [
  '#5B7DB1', // dusk blue
  '#A3543A', // brick
  '#3F7A5D', // forest
  '#7A5BA8', // amethyst
  '#C7943B', // ochre
  '#B45D9E', // mauve
  '#4C95A8', // teal
  '#8C4F4F', // wine
];

/**
 * Stable string hash → palette index. djb2 variant.
 */
function hashIndex(name: string, mod: number): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

export function bankHashColor(name: string | undefined | null): string {
  if (!name) return '#9B948A'; // ink-faint for blanks
  return PALETTE[hashIndex(name.toLowerCase().trim(), PALETTE.length)]!;
}

/**
 * 2-character monogram. Uses the first letter of the first two whitespace-
 * separated words when present; otherwise the first two characters.
 *
 *  "HDFC Bank"            → "HB"
 *  "Standard Chartered"   → "SC"
 *  "Scapia"               → "SC"
 *  "Bank of Baroda"       → "BB" (collapses 3+ words to first/last)
 */
export function bankMonogram(name: string | undefined | null): string {
  if (!name) return '?';
  const cleaned = name.trim().replace(/[^\p{L}\p{N}\s]/gu, '');
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  // For 3+ words, take first + last to keep the monogram distinctive
  // ("Bank of Baroda" → BB, not BO).
  const first = words[0][0];
  const last = words[words.length - 1][0];
  return (first + last).toUpperCase();
}
