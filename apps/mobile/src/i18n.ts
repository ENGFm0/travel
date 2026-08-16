import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Minimal bundle for the shell scaffold. In production these bundles come from
 * the shared package `@boardingpass/i18n` (same source as apps/web) rather than
 * being duplicated here (architecture §3).
 */
const ar = {
  app: { name: 'بوردنق باس' },
  nav: { home: 'الرئيسية', explore: 'استكشف', newTrip: 'رحلة جديدة', buddies: 'خوّة سفر', mytrips: 'رحلاتي' },
  pages: {
    home: { title: 'أهلًا بك في بوردنق باس' },
    explore: { title: 'استكشف وتوصيات' },
    planner: { title: 'خطط لرحلتك' },
    buddies: { title: 'خوّة سفر' },
    mytrips: { title: 'رحلاتي والقروب' },
  },
  shellNote: 'سقالة الشِل (US-014): تنقّل ولغتان وثيم واتجاه. المحتوى في الستوريز اللاحقة.',
};

const en = {
  app: { name: 'BoardingPass' },
  nav: { home: 'Home', explore: 'Explore', newTrip: 'New Trip', buddies: 'Buddies', mytrips: 'My Trips' },
  pages: {
    home: { title: 'Welcome to BoardingPass' },
    explore: { title: 'Explore & Recommendations' },
    planner: { title: 'Plan your trip' },
    buddies: { title: 'Travel Buddies' },
    mytrips: { title: 'My Trips & Group' },
  },
  shellNote: 'App shell (US-014): navigation, two languages, theme, direction. Content in later stories.',
};

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { ar: { translation: ar }, en: { translation: en } },
    lng: 'ar',
    fallbackLng: 'ar',
    supportedLngs: ['ar', 'en'],
    interpolation: { escapeValue: false },
  });
}

export default i18n;
