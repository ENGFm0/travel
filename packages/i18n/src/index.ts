import type { Locale } from '@boardingpass/types';
import ar from './ar.json';
import en from './en.json';

/** Shared translation bundles (single source for web + mobile). Each app wires
 *  its own i18next instance (react-i18next) using these resources. */
export const resources = {
  ar: { translation: ar },
  en: { translation: en },
} as const;

export const defaultLocale: Locale = 'ar';
export const supportedLocales: readonly Locale[] = ['ar', 'en'];

export { ar, en };
