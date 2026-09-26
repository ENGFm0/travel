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
 *  73101887. A single card covering all its service lines. */
const RICH_WA = '966551557800';
const RICH_LOGO = '/partners/rich-experience.png';
export function demoPartners(): Partner[] {
  return [
    {
      id: 'rich-experience',
      name: 'التجربة الثرية',
      category: 'AGENCY',
      coverage: 'ALL',
      tagline: 'وكالة سفر ومنظِّم رحلات مرخّصة — رحلات داخلية ودولية، تجارب، حجز فنادق وطيران، وخدمات استقبال وتوصيل.',
      url: 'https://richexperience.sa/',
      whatsapp: RICH_WA,
      logoUrl: RICH_LOGO,
      featured: true,
    },
  ];
}

export function createPartnersService(): PartnersService {
  return import.meta.env.VITE_API_BASE_URL ? createApiPartnersService() : createMockPartnersService();
}
