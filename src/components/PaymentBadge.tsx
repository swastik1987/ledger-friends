import { CreditCard } from '@phosphor-icons/react';
import { paymentMeta } from '@/lib/paymentMethodMeta';

interface Props {
  /** Raw payment method label (e.g. "UPI", "Credit Card"). */
  method: string | undefined | null;
  /** Diameter in px (default 22). */
  size?: number;
  /** Render the neutral "Unspecified" treatment. */
  unspecified?: boolean;
}

/**
 * Small square-rounded badge representing a payment method.
 * Pairs with <BankBadge> visually: same shape and size so they line up
 * cleanly on TxnRow row 3 and inside filter chips.
 */
export default function PaymentBadge({ method, size = 22, unspecified = false }: Props) {
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
        <CreditCard size={Math.round(size * 0.6)} weight="regular" />
      </span>
    );
  }

  const meta = paymentMeta(method);
  const Icon = meta.Icon;
  return (
    <span
      className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{
        width: size, height: size,
        background: meta.bg,
        color: meta.color,
      }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.62)} weight="regular" />
    </span>
  );
}
