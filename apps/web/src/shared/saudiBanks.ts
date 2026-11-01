import { normalizeIban } from '@/features/profile/profileModel';

/** A bank recognised from an IBAN. For Saudi IBANs the two digits right after
 *  the check digits (positions 5–6, "SAkk BB…") are SAMA's bank code. */
export interface BankInfo {
  /** Two-digit SAMA code ("80"), or the ISO country code for a non-Saudi IBAN. */
  code: string;
  ar: string;
  en: string;
  /** Short wordmark drawn inside the brand-coloured badge ("الراجحي", "stc bank"). */
  short: string;
  /** Brand colour: badge background (white wordmark on top). */
  color: string;
  /** Optional second brand colour for the badge accent stripe. */
  accent?: string;
  /** true when the code was matched to a known bank; false → generic fallback. */
  known: boolean;
}

interface Row { ar: string; en: string; short: string; color: string; accent?: string }

/** SAMA bank codes as they appear in Saudi IBANs (positions 5–6).
 *  Legacy codes of merged banks are kept because old IBANs still carry them.
 *  Colours follow each bank's current brand palette. */
export const SAUDI_BANKS: Record<string, Row> = {
  '05': { ar: 'مصرف الإنماء',             en: 'Alinma Bank',                   short: 'الإنماء',      color: '#6f4a24', accent: '#c9a86a' },
  '10': { ar: 'البنك الأهلي السعودي',      en: 'Saudi National Bank (SNB)',     short: 'الأهلي',       color: '#0a5c43', accent: '#c7a24a' },
  '15': { ar: 'بنك البلاد',                en: 'Bank Albilad',                  short: 'البلاد',       color: '#a8262f', accent: '#f08a24' },
  '20': { ar: 'بنك الرياض',                en: 'Riyad Bank',                    short: 'الرياض',       color: '#0097a7', accent: '#1d2b57' },
  '30': { ar: 'البنك العربي الوطني',       en: 'Arab National Bank (ANB)',      short: 'anb',          color: '#0a66b2', accent: '#3cb371' },
  '36': { ar: 'بنك D360',                  en: 'D360 Bank',                     short: 'D360',         color: '#0f6e5a', accent: '#5ee0b4' },
  '40': { ar: 'الأهلي (سامبا سابقاً)',     en: 'SNB (ex-Samba)',                short: 'الأهلي',       color: '#0a5c43', accent: '#c7a24a' },
  '45': { ar: 'البنك السعودي الأول (ساب)', en: 'Saudi Awwal Bank (SAB)',        short: 'SAB',          color: '#d71920', accent: '#1d2b57' },
  '50': { ar: 'ساب (الأول سابقاً)',         en: 'SAB (ex-Alawwal)',             short: 'SAB',          color: '#d71920', accent: '#1d2b57' },
  '55': { ar: 'البنك السعودي الفرنسي',     en: 'Banque Saudi Fransi (BSF)',     short: 'BSF',          color: '#003da5', accent: '#5fb3ff' },
  '60': { ar: 'بنك الجزيرة',               en: 'Bank AlJazira',                 short: 'الجزيرة',      color: '#0f7a4b', accent: '#b5d334' },
  '65': { ar: 'البنك السعودي للاستثمار',   en: 'Saudi Investment Bank (SAIB)',  short: 'SAIB',         color: '#5a2d81', accent: '#c8b1e0' },
  '71': { ar: 'بنك البحرين الوطني',        en: 'National Bank of Bahrain',      short: 'NBB',          color: '#9b1b30' },
  '75': { ar: 'بنك الكويت الوطني',         en: 'National Bank of Kuwait',       short: 'NBK',          color: '#005aa7' },
  '76': { ar: 'بنك مسقط',                  en: 'Bank Muscat',                   short: 'Muscat',       color: '#b8860b' },
  '78': { ar: 'stc bank',                  en: 'stc bank',                      short: 'stc bank',     color: '#4f008c', accent: '#ff375e' },
  '80': { ar: 'مصرف الراجحي',              en: 'Al Rajhi Bank',                 short: 'الراجحي',      color: '#1b4a9c', accent: '#c9a34e' },
  '81': { ar: 'دويتشه بنك',                en: 'Deutsche Bank',                 short: 'Deutsche',     color: '#0018a8' },
  '82': { ar: 'البنك الوطني الباكستاني',   en: 'National Bank of Pakistan',     short: 'NBP',          color: '#0f6e3a' },
  '84': { ar: 'بنك زراعات',                en: 'T.C. Ziraat Bankasi',           short: 'Ziraat',       color: '#c8102e' },
  '85': { ar: 'بي إن بي باريبا',           en: 'BNP Paribas',                   short: 'BNP',          color: '#00915a' },
  '86': { ar: 'جي بي مورغان تشيس',         en: 'JPMorgan Chase',                short: 'J.P.Morgan',   color: '#5c4033' },
  '90': { ar: 'بنك الخليج الدولي',         en: 'Gulf International Bank (GIB)', short: 'GIB',          color: '#0b4f8a', accent: '#7fd3c9' },
  '95': { ar: 'بنك الإمارات دبي الوطني',   en: 'Emirates NBD',                  short: 'Emirates NBD', color: '#0a2a5c', accent: '#7bb0e8' },
};

/** Regional-indicator flag for a two-letter ISO country code ("GB" → 🇬🇧). */
export function countryFlag(cc: string): string {
  const s = cc.toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) return '🏦';
  return String.fromCodePoint(...[...s].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Detect the bank from an IBAN as the user types. Returns null until at least
 *  the country and bank code have been entered ("SAkkBB" → 6 chars). */
export function bankFromIban(iban: string): BankInfo | null {
  const v = normalizeIban(iban);
  if (v.length < 6 || !/^[A-Z]{2}\d{2}/.test(v)) return null;
  const cc = v.slice(0, 2);
  if (cc !== 'SA') {
    return { code: cc, ar: `بنك خارج السعودية (${cc})`, en: `Bank outside Saudi Arabia (${cc})`, short: `${countryFlag(cc)} ${cc}`, color: '#5a6472', known: false };
  }
  const code = v.slice(4, 6);
  const row = SAUDI_BANKS[code];
  if (!row) {
    return { code, ar: `بنك سعودي (رمز ${code})`, en: `Saudi bank (code ${code})`, short: `🏦 ${code}`, color: '#5a6472', known: false };
  }
  return { code, known: true, ...row };
}

/** Localised bank name ("مصرف الراجحي" / "Al Rajhi Bank"), '' when unknown yet. */
export function bankName(iban: string, locale: string): string {
  const b = bankFromIban(iban);
  if (!b) return '';
  return locale.startsWith('ar') ? b.ar : b.en;
}
