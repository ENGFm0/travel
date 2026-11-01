import type { Locale } from '@boardingpass/types';

/** Locale-aware formatters (business-independent, cross-platform).
 *  Arabic uses Latin (0-9) numerals everywhere — `-u-nu-latn` — so dates,
 *  percentages, amounts and IBANs all read with one digit system (ar-SA's
 *  default would print ٢٠٢٦ for dates while amounts stayed 2026). */
const localeTag = (l: Locale): string => (l === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US');

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
