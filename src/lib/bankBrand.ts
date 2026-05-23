/**
 * Bank visual identity helpers.
 *
 * Strategy: try to render the real bank icon via Google's public favicon
 * service (`google.com/s2/favicons`). Clearbit's free logo CDN was retired
 * in late 2024, so Google's faviconV2 endpoint is the most reliable
 * unauthenticated option for arbitrary corporate domains. It returns a
 * PNG at the requested size; quality is modest (favicon resolution) but
 * adequate for the 14–22px badges we render.
 *
 * For well-known Indian banks we carry curated `DOMAIN_MAP` and
 * `BRAND_COLOR` overrides so (a) the right domain is queried even when
 * the user types "HDFC" instead of "hdfcbank.com", and (b) when the
 * logo can't load, the monogram disc still shows the brand's actual
 * primary color rather than a generic palette pick.
 *
 * Unknown banks fall through to a heuristic domain guess + a hashed
 * color from a muted palette so the badge looks intentional anyway.
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
  // Google's faviconV2 endpoint returns a PNG of the site's favicon at
  // the requested size. Free, public, no auth. We pin sz to one of the
  // values Google honours (16, 32, 64, 128, 256) — they round otherwise.
  const sz = sizePx <= 16 ? 16 : sizePx <= 32 ? 32 : sizePx <= 64 ? 64 : sizePx <= 128 ? 128 : 256;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${sz}`;
}

// ──────────────────────────────────────────────────────────────────────
// Brand colors. Hex values match each bank's published primary identity
// (logo color, not the secondary accents). Keys are lowercased and
// duplicate the aliases used in DOMAIN_MAP so both "HDFC" and "HDFC Bank"
// resolve to the same color.
// ──────────────────────────────────────────────────────────────────────
const BRAND_COLOR: Record<string, string> = {
  // Indian private/public banks
  'hdfc bank': '#004C8F',
  'hdfc': '#004C8F',
  'icici bank': '#F38B23',
  'icici': '#F38B23',
  'axis bank': '#97144D',
  'axis': '#97144D',
  'rbl bank': '#CE1126',
  'rbl': '#CE1126',
  'sbi': '#22409A',
  'state bank of india': '#22409A',
  'kotak mahindra bank': '#ED1C24',
  'kotak': '#ED1C24',
  'yes bank': '#00518F',
  'yes': '#00518F',
  'idfc first bank': '#882F3D',
  'idfc first': '#882F3D',
  'idfc': '#882F3D',
  'indusind bank': '#722B2E',
  'indusind': '#722B2E',
  'federal bank': '#D4A017',
  'punjab national bank': '#B40000',
  'pnb': '#B40000',
  'bank of baroda': '#F58220',
  'bob': '#F58220',
  'canara bank': '#00529B',
  'canara': '#00529B',
  'union bank of india': '#FF8200',
  'au small finance bank': '#732D7F',
  'au bank': '#732D7F',
  'bandhan bank': '#F5821F',

  // Foreign banks operating in India
  'standard chartered': '#0473EA',
  'hsbc': '#DB0011',
  'citi': '#056DAE',
  'citibank': '#056DAE',
  'deutsche bank': '#0018A8',
  'dbs': '#DC0000',
  'dbs bank': '#DC0000',

  // Card-first fintechs
  'scapia': '#0E1814',
  'jupiter': '#FF7A1A',
  'fi money': '#00C277',
  'fi': '#00C277',
  'cred': '#181818',
  'one card': '#1A1A1A',
  'onecard': '#1A1A1A',
  'slice': '#7B61FF',
  'uni': '#FA4D5C',
  'niyo': '#0093D0',

  // Networks
  'american express': '#006FCF',
  'amex': '#006FCF',
};

/**
 * Returns the bank's curated primary brand color, falling back to a stable
 * hashed palette pick when the bank is unknown. Use this as the disc color
 * for the monogram fallback in <BankBadge>.
 */
export function bankBrandColor(name: string | undefined | null): string {
  if (!name) return '#9B948A'; // ink-faint for blanks
  const key = name.toLowerCase().trim();
  if (BRAND_COLOR[key]) return BRAND_COLOR[key]!;
  const stripped = key.replace(/\s+bank$/, '').trim();
  if (BRAND_COLOR[stripped]) return BRAND_COLOR[stripped]!;
  return bankHashColor(name);
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
