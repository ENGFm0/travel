import { normalizeIban } from '@/features/profile/profileModel';

/** A bank recognised from an IBAN. For Saudi IBANs the two digits right after
 *  the check digits (positions 5–6, "SAkk BB…") are SAMA's bank code. */
export interface BankInfo {
  /** Two-digit SAMA code ("80"), or the ISO country code for a non-Saudi IBAN. */
  code: string;
  ar: string;
  en: string;
  /** Visual tag — brand-coloured chip with this emoji (no logo assets needed). */
  emoji: string;
  /** Brand colour used for the chip background. */
  color: string;
  /** true when the code was matched to a known bank; false → generic fallback. */
  known: boolean;
}

interface Row { ar: string; en: string; emoji: string; color: string }

/** SAMA bank codes as they appear in Saudi IBANs (positions 5–6).
 *  Legacy codes of merged banks are kept because old IBANs still carry them. */
export const SAUDI_BANKS: Record<string, Row> = {
  '05': { ar: 'مصرف الإنماء',            en: 'Alinma Bank',                 emoji: '🟤', color: '#6b4a2b' },
  '10': { ar: 'البنك الأهلي السعودي',     en: 'Saudi National Bank (SNB)',   emoji: '🟩', color: '#0b6b4d' },
  '15': { ar: 'بنك البلاد',               en: 'Bank Albilad',                emoji: '🟧', color: '#d1511f' },
  '20': { ar: 'بنك الرياض',               en: 'Riyad Bank',                  emoji: '🩵', color: '#0092a8' },
  '30': { ar: 'البنك العربي الوطني',      en: 'Arab National Bank (ANB)',    emoji: '🔷', color: '#0d7ea1' },
  '36': { ar: 'بنك D360',                 en: 'D360 Bank',                   emoji: '🟢', color: '#12a37f' },
  '40': { ar: 'الأهلي (سامبا سابقاً)',    en: 'SNB (ex-Samba)',              emoji: '🟩', color: '#0b6b4d' },
  '45': { ar: 'البنك السعودي الأول (ساب)', en: 'Saudi Awwal Bank (SAB)',     emoji: '🔴', color: '#c8102e' },
  '50': { ar: 'ساب (الأول سابقاً)',        en: 'SAB (ex-Alawwal)',           emoji: '🔴', color: '#c8102e' },
  '55': { ar: 'البنك السعودي الفرنسي',    en: 'Banque Saudi Fransi (BSF)',   emoji: '🔵', color: '#1b4f9c' },
  '60': { ar: 'بنك الجزيرة',              en: 'Bank AlJazira',               emoji: '🟢', color: '#2e8b57' },
  '65': { ar: 'البنك السعودي للاستثمار',  en: 'Saudi Investment Bank (SAIB)', emoji: '🟣', color: '#5b2c6f' },
  '71': { ar: 'بنك البحرين الوطني',       en: 'National Bank of Bahrain',    emoji: '🏦', color: '#9b1b30' },
  '75': { ar: 'بنك الكويت الوطني',        en: 'National Bank of Kuwait',     emoji: '🏦', color: '#005aa7' },
  '76': { ar: 'بنك مسقط',                 en: 'Bank Muscat',                 emoji: '🏦', color: '#d4a017' },
  '78': { ar: 'stc bank',                 en: 'stc bank',                    emoji: '💜', color: '#4f008c' },
  '80': { ar: 'مصرف الراجحي',             en: 'Al Rajhi Bank',               emoji: '🟦', color: '#1b3f8b' },
  '81': { ar: 'دويتشه بنك',               en: 'Deutsche Bank',               emoji: '🏦', color: '#0018a8' },
  '82': { ar: 'البنك الوطني الباكستاني',  en: 'National Bank of Pakistan',   emoji: '🏦', color: '#0f6e3a' },
  '84': { ar: 'بنك زراعات',               en: 'T.C. Ziraat Bankasi',         emoji: '🏦', color: '#c8102e' },
  '85': { ar: 'بي إن بي باريبا',          en: 'BNP Paribas',                 emoji: '🏦', color: '#00915a' },
  '86': { ar: 'جي بي مورغان تشيس',        en: 'JPMorgan Chase',              emoji: '🏦', color: '#5c4033' },
  '90': { ar: 'بنك الخليج الدولي',        en: 'Gulf International Bank (GIB)', emoji: '🟦', color: '#1a5a9a' },
  '95': { ar: 'بنك الإمارات دبي الوطني',  en: 'Emirates NBD',                emoji: '🔷', color: '#1b2a6b' },
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
    return { code: cc, ar: `بنك خارج السعودية (${cc})`, en: `Bank outside Saudi Arabia (${cc})`, emoji: countryFlag(cc), color: '#5a6472', known: false };
  }
  const code = v.slice(4, 6);
  const row = SAUDI_BANKS[code];
  if (!row) {
    return { code, ar: `بنك سعودي (رمز ${code})`, en: `Saudi bank (code ${code})`, emoji: '🏦', color: '#5a6472', known: false };
  }
  return { code, known: true, ...row };
}

/** Localised bank label ("🟦 مصرف الراجحي"). */
export function bankLabel(iban: string, locale: string): string {
  const b = bankFromIban(iban);
  if (!b) return '';
  return `${b.emoji} ${locale.startsWith('ar') ? b.ar : b.en}`;
}
