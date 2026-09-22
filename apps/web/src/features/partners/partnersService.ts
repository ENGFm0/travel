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

/** Demo success-partner directory (mock only). */
export function demoPartners(): Partner[] {
  return [
    { id: 'pa1', name: 'طيران أجنحة', category: 'FLIGHTS', coverage: 'ALL', tagline: 'حجوزات طيران داخلي ودولي بأسعار للمجموعات.', featured: true },
    { id: 'pa2', name: 'رحلات المسافر', category: 'AGENCY', coverage: 'ALL', tagline: 'باقات سفر جاهزة ومصمّمة حسب الطلب.', featured: true },
    { id: 'pa3', name: 'فنادق الواحة', category: 'HOTELS', coverage: 'الرياض', tagline: 'إقامة فاخرة في قلب الرياض بأسعار خاصة.', featured: true },
    { id: 'pa4', name: 'تأجير درب', category: 'CARS', coverage: 'ALL', tagline: 'استئجار سيارات بجميع الفئات مع توصيل للمطار.' },
    { id: 'pa5', name: 'منتجعات البحر الأحمر', category: 'HOTELS', coverage: 'جدة', tagline: 'منتجعات على الشاطئ مع عروض عائلية.', featured: true },
    { id: 'pa6', name: 'مغامرات العلا', category: 'ACTIVITIES', coverage: 'العلا', tagline: 'جولات صحراوية ومناطيد وتجارب فلكية.' },
    { id: 'pa7', name: 'دليل عسير', category: 'ACTIVITIES', coverage: 'أبها', tagline: 'رحلات هايكنق وتخييم في مرتفعات السودة.' },
    { id: 'pa8', name: 'وكالة الخليج للسفر', category: 'AGENCY', coverage: 'الدمام', tagline: 'تنظيم رحلات الشركات والمجموعات.' },
    { id: 'pa9', name: 'كابتن كار', category: 'CARS', coverage: 'جدة', tagline: 'سائق خاص وسيارات فخمة بالساعة أو اليوم.' },
    { id: 'pa10', name: 'طيران الصحراء', category: 'FLIGHTS', coverage: 'ALL', tagline: 'رحلات داخلية متكررة وبرنامج نقاط للمجموعات.' },
  ];
}

export function createPartnersService(): PartnersService {
  return import.meta.env.VITE_API_BASE_URL ? createApiPartnersService() : createMockPartnersService();
}
