import { createApiClient } from '@boardingpass/core';
import type { Partner } from './partnersModel';

export interface PartnersService {
  list(): Promise<Partner[]>;
}

/** In-memory partners directory for dev/tests. Real listings are served by the
 *  backend (curated + approved in moderation); no client key or write path. */
export function createMockPartnersService(seed?: Partner[]): PartnersService {
  const items: Partner[] = (seed ?? demoPartners()).map((p) => ({ ...p }));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  return {
    async list() { await tick(); return items.map((p) => ({ ...p })); },
  };
}

export function createApiPartnersService(getToken?: () => string | undefined): PartnersService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  return {
    list: () => client.apiFetch<Partner[]>('/partners'),
  };
}

/** Real success-partner directory. Curated, verified companies only — no demo
 *  data. Listings link out to the partner's own site.
 *
 *  Rich Experience (التجربة الثرية للسفر والسياحة): a licensed Saudi travel
 *  agency & tour operator based in Taif — CR 4032243561, tourism licence
 *  73101887. One card per service line so it surfaces under each filter. */
const RICH_WA = '966551557800';
export function demoPartners(): Partner[] {
  return [
    {
      id: 'rich-experience',
      name: 'التجربة الثرية للسفر والسياحة',
      category: 'AGENCY',
      coverage: 'ALL',
      tagline: 'وكالة سفر ومنظِّم رحلات مرخّصة — باقات سياحية داخلية ودولية مصمّمة حسب الطلب.',
      url: 'https://richexperience.sa/',
      whatsapp: RICH_WA,
      featured: true,
    },
    {
      id: 'rich-experience-trips',
      name: 'التجربة الثرية — الرحلات والتجارب',
      category: 'ACTIVITIES',
      coverage: 'ALL',
      tagline: 'رحلات وتجارب داخل السعودية: العلا، الطائف، أبها، جدة التاريخية، حافة العالم ورحلات الكروز.',
      url: 'https://richexperience.sa/ar/-/c1569557178',
      whatsapp: RICH_WA,
      featured: true,
    },
    {
      id: 'rich-experience-intl',
      name: 'التجربة الثرية — الرحلات الدولية',
      category: 'AGENCY',
      coverage: 'ALL',
      tagline: 'باقات سفر دولية: أوروبا، آسيا، الجزر، والسياحة العلاجية.',
      url: 'https://richexperience.sa/ar/-/c1010381718',
      whatsapp: RICH_WA,
    },
    {
      id: 'rich-experience-hotels',
      name: 'التجربة الثرية — حجوزات الفنادق',
      category: 'HOTELS',
      coverage: 'ALL',
      tagline: 'حجز الفنادق والإقامات داخل المملكة وخارجها.',
      url: 'https://rihexp.com/hotel',
      whatsapp: RICH_WA,
    },
    {
      id: 'rich-experience-flights',
      name: 'التجربة الثرية — حجوزات الطيران',
      category: 'FLIGHTS',
      coverage: 'ALL',
      tagline: 'حجوزات الطيران الداخلي والدولي ضمن الباقات السياحية.',
      url: 'https://rihexp.com/hotel',
      whatsapp: RICH_WA,
    },
    {
      id: 'rich-experience-transfers',
      name: 'التجربة الثرية — الاستقبال والتوصيل',
      category: 'CARS',
      coverage: 'ALL',
      tagline: 'استقبال بالمطار (VIP) وتوصيل بين المدن بسيارة خاصة مع سائق.',
      url: 'https://richexperience.sa/ar/category/rOrwn',
      whatsapp: RICH_WA,
    },
  ];
}

export function createPartnersService(): PartnersService {
  return import.meta.env.VITE_API_BASE_URL ? createApiPartnersService() : createMockPartnersService();
}
