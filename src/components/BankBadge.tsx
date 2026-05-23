import { useState } from 'react';
import { Bank } from '@phosphor-icons/react';
import { bankLogoUrl, bankHashColor, bankMonogram } from '@/lib/bankBrand';

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
 *  1. Try to load the real logo from Clearbit (hosted, free, no key).
 *  2. On 404 / network error, swap to a colored disc with a 2-letter
 *     monogram. The color is derived from a stable hash of the name so
 *     the same bank always looks the same.
 *
 * The component is deliberately tiny + dumb: no caching, no preloading,
 * no Suspense. The browser caches the image after the first hit.
 */
export default function BankBadge({ name, size = 22, unspecified = false }: Props) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = unspecified || !name ? undefined : bankLogoUrl(name, size * 2);
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
        <Bank size={Math.round(size * 0.6)} weight="regular" />
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

  // Fallback: monogram disc.
  const color = bankHashColor(name);
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
