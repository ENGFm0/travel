import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, defaultLocale, supportedLocales } from '@boardingpass/i18n';

/** Web i18next instance, wired from the shared @boardingpass/i18n bundles. */
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: defaultLocale,
    fallbackLng: defaultLocale,
    supportedLngs: [...supportedLocales],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
