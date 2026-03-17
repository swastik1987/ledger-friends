export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  locale: string; // for toLocaleString formatting
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US' },
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE' },
  { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', locale: 'ar-SA' },
];

export function getCurrency(code: string): CurrencyInfo {
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0]; // fallback to INR
}

export function formatAmount(amount: number, currencyCode: string): string {
  const currency = getCurrency(currencyCode);
  return `${currency.symbol}${amount.toLocaleString(currency.locale, { minimumFractionDigits: currencyCode === 'JPY' ? 0 : 2, maximumFractionDigits: currencyCode === 'JPY' ? 0 : 2 })}`;
}

export function formatAmountShort(amount: number, currencyCode: string): string {
  const currency = getCurrency(currencyCode);
  return `${currency.symbol}${amount.toLocaleString(currency.locale)}`;
}
