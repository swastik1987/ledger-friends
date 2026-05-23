import {
  QrCode,
  CreditCard,
  Cardholder,
  Globe,
  Money,
  DotsThree,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';

/**
 * Visual identity per payment method. Mirrors the bank-badge treatment:
 * each method gets a distinct icon + soft-tinted background so the chip
 * is recognisable at a glance without reading the label.
 *
 * Colors are intentionally Sand-&-Ember tokens (via raw hex matching the
 * palette) so they sit alongside CategoryDot without fighting it.
 */

export interface PaymentMeta {
  Icon: PhosphorIcon;
  color: string;       // foreground accent (icon + text when chipped)
  bg: string;          // soft-tinted disc background
}

const META: Record<string, PaymentMeta> = {
  // Indian-first instrument: distinct violet hue separates it from card.
  'UPI':         { Icon: QrCode,     color: '#7A5BA8', bg: '#7A5BA822' },
  'Credit Card': { Icon: CreditCard, color: '#3B7C9A', bg: '#3B7C9A22' },
  'Debit Card':  { Icon: Cardholder, color: '#2F7D5F', bg: '#2F7D5F22' },
  'Online':      { Icon: Globe,      color: '#5E8C5D', bg: '#5E8C5D22' },
  'Cash':        { Icon: Money,      color: '#C7943B', bg: '#C7943B22' },
  'Other':       { Icon: DotsThree,  color: '#9B948A', bg: '#9B948A22' },
};

const FALLBACK: PaymentMeta = {
  Icon: DotsThree, color: '#9B948A', bg: '#9B948A22',
};

export function paymentMeta(method: string | undefined | null): PaymentMeta {
  if (!method) return FALLBACK;
  return META[method] ?? FALLBACK;
}
