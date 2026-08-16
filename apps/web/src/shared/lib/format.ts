import type { Locale } from '@/app/store/uiStore';

/** Locale-aware formatters (shared, business-independent — extractable to a
 *  cross-platform package later per architecture §3). */

const localeTag = (l: Locale): string => (l === 'ar' ? 'ar-SA' : 'en-US');

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

export function formatCurrency(value: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(
  value: Date | string | number,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(localeTag(locale), opts).format(d);
}

export function dirForLocale(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
