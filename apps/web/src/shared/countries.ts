// Small curated country → currency map + currency list, for the trip budget and
// the user's home country. Arabic + English labels; ISO 4217 currency codes.

export interface Country {
  code: string;   // ISO 3166-1 alpha-2
  ar: string;
  en: string;
  currency: string; // ISO 4217
}

export const COUNTRIES: Country[] = [
  { code: 'SA', ar: 'السعودية', en: 'Saudi Arabia', currency: 'SAR' },
  { code: 'AE', ar: 'الإمارات', en: 'United Arab Emirates', currency: 'AED' },
  { code: 'KW', ar: 'الكويت', en: 'Kuwait', currency: 'KWD' },
  { code: 'QA', ar: 'قطر', en: 'Qatar', currency: 'QAR' },
  { code: 'BH', ar: 'البحرين', en: 'Bahrain', currency: 'BHD' },
  { code: 'OM', ar: 'عُمان', en: 'Oman', currency: 'OMR' },
  { code: 'EG', ar: 'مصر', en: 'Egypt', currency: 'EGP' },
  { code: 'JO', ar: 'الأردن', en: 'Jordan', currency: 'JOD' },
  { code: 'LB', ar: 'لبنان', en: 'Lebanon', currency: 'LBP' },
  { code: 'IQ', ar: 'العراق', en: 'Iraq', currency: 'IQD' },
  { code: 'MA', ar: 'المغرب', en: 'Morocco', currency: 'MAD' },
  { code: 'TN', ar: 'تونس', en: 'Tunisia', currency: 'TND' },
  { code: 'TR', ar: 'تركيا', en: 'Türkiye', currency: 'TRY' },
  { code: 'GB', ar: 'بريطانيا', en: 'United Kingdom', currency: 'GBP' },
  { code: 'FR', ar: 'فرنسا', en: 'France', currency: 'EUR' },
  { code: 'IT', ar: 'إيطاليا', en: 'Italy', currency: 'EUR' },
  { code: 'ES', ar: 'إسبانيا', en: 'Spain', currency: 'EUR' },
  { code: 'DE', ar: 'ألمانيا', en: 'Germany', currency: 'EUR' },
  { code: 'AT', ar: 'النمسا', en: 'Austria', currency: 'EUR' },
  { code: 'CH', ar: 'سويسرا', en: 'Switzerland', currency: 'CHF' },
  { code: 'NL', ar: 'هولندا', en: 'Netherlands', currency: 'EUR' },
  { code: 'GR', ar: 'اليونان', en: 'Greece', currency: 'EUR' },
  { code: 'US', ar: 'أمريكا', en: 'United States', currency: 'USD' },
  { code: 'CA', ar: 'كندا', en: 'Canada', currency: 'CAD' },
  { code: 'MY', ar: 'ماليزيا', en: 'Malaysia', currency: 'MYR' },
  { code: 'ID', ar: 'إندونيسيا', en: 'Indonesia', currency: 'IDR' },
  { code: 'TH', ar: 'تايلاند', en: 'Thailand', currency: 'THB' },
  { code: 'JP', ar: 'اليابان', en: 'Japan', currency: 'JPY' },
  { code: 'IN', ar: 'الهند', en: 'India', currency: 'INR' },
  { code: 'MV', ar: 'المالديف', en: 'Maldives', currency: 'MVR' },
  { code: 'AZ', ar: 'أذربيجان', en: 'Azerbaijan', currency: 'AZN' },
  { code: 'GE', ar: 'جورجيا', en: 'Georgia', currency: 'GEL' },
];

/** Common currencies for the trip budget picker (superset of the map above). */
export const CURRENCIES: string[] = Array.from(
  new Set(['SAR', 'AED', 'USD', 'EUR', 'GBP', 'KWD', 'QAR', 'BHD', 'OMR', 'EGP', 'JOD', 'TRY', 'MYR', 'THB', 'JPY', ...COUNTRIES.map((c) => c.currency)]),
);

export function countryName(code: string | undefined, locale: string): string {
  const c = COUNTRIES.find((x) => x.code === code);
  return c ? (locale.startsWith('ar') ? c.ar : c.en) : '';
}

export function currencyOf(code: string | undefined): string | undefined {
  return COUNTRIES.find((x) => x.code === code)?.currency;
}

/** Best-effort: match a free-text city/country name to a known country. */
export function guessCountry(text: string): Country | undefined {
  const q = text.trim().toLowerCase();
  if (!q) return undefined;
  return COUNTRIES.find((c) => q.includes(c.ar) || q.toLowerCase().includes(c.en.toLowerCase()));
}
