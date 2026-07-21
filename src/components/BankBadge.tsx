import { useState } from 'react';
import { Bank as BankIcon } from '@phosphor-icons/react';
import { bankDomain, bankLogoUrlForDomain, bankBrandColor, bankMonogram } from '@/lib/bankBrand';
import { useBanks } from '@/hooks/useBanks';
import { findBankMatch } from '@/lib/bankResolver';

interface Props {
  /** Raw bank name as stored on the expense (e.g. "HDFC Bank", "Scapia"). */
  name: string | undefined | null;
  /** Diameter in px (default 22). */
  size?: number;
  /** Treat this as the "Unspecified" sentinel chip — neutral grey disc. */
  unspecified?: boolean;
}

/**
 * Small square-rounded badge representing a bank.
 *
 * Render strategy:
 *  1. Look up the bank in the `banks` registry (DB-maintained domain +
 *     brand color take precedence — lets logos/colors be corrected or added
 *     for new banks without a code deploy) and try to load the real logo via
 *     Google's favicon service.
 *  2. On 404 / network error, or when the bank isn't registered yet, fall
 *     back to the hardcoded curated map, then a colored disc with a
 *     2-letter monogram derived from a stable hash of the name.
 *
 * The component is deliberately tiny + dumb: no preloading, no Suspense.
 * The browser caches the image after the first hit; `useBanks()` is a
 * shared React Query cache, so rendering this in a long list costs one
 * fetch total, not one per row.
 */
export default function BankBadge({ name, size = 22, unspecified = false }: Props) {
  const [logoFailed, setLogoFailed] = useState(false);
  const { data: banks } = useBanks();
  const matchedBank = !unspecified && name ? findBankMatch(name, banks || []) : null;
  const domain = matchedBank?.domain || bankDomain(name);
  const logo = unspecified || !name ? undefined : bankLogoUrlForDomain(domain, size * 2);
  const showLogo = !!logo && !logoFailed;

  if (unspecified) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-md shrink-0"
        style={{
          width: size, height: size,
          background: 'hsl(var(--chip-bg))',
          color: 'hsl(var(--ink-faint))',
        }}
        aria-hidden="true"
      >
        <BankIcon size={Math.round(size * 0.6)} weight="regular" />
      </span>
    );
  }

  if (showLogo) {
    return (
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        loading="lazy"
        onError={() => setLogoFailed(true)}
        className="rounded-md shrink-0 object-contain"
        style={{
          width: size,
          height: size,
          background: '#FFFFFF',
          // 1px hairline keeps logos like ICICI's red-on-white from
          // bleeding into the cream surface.
          boxShadow: '0 0 0 1px hsl(var(--line))',
        }}
      />
    );
  }

  // Fallback: monogram disc tinted with the bank's primary brand color
  // (DB registry, then curated map, then a stable hashed palette pick).
  const color = matchedBank?.brand_color || bankBrandColor(name);
  return (
    <span
      className="inline-flex items-center justify-center rounded-md font-bold shrink-0"
      style={{
        width: size, height: size,
        background: color,
        color: '#FFFFFF',
        fontSize: Math.round(size * 0.42),
        letterSpacing: '-0.02em',
      }}
      aria-hidden="true"
    >
      {bankMonogram(name)}
    </span>
  );
}
