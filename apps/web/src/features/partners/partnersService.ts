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
 *  data. Listings link out to the partner's own site. */
export function demoPartners(): Partner[] {
  return [
    {
      id: 'rich-experience',
      name: 'Rich Experience — ريتش إكسبيرنس',
      category: 'AGENCY',
      coverage: 'ALL',
      tagline: 'شركة سياحة سعودية — تنظيم الرحلات والتجارب والباقات السياحية.',
      url: 'https://richexperience.sa/',
      featured: true,
    },
  ];
}

export function createPartnersService(): PartnersService {
  return import.meta.env.VITE_API_BASE_URL ? createApiPartnersService() : createMockPartnersService();
}
