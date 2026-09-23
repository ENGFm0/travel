import { describe, it, expect } from 'vitest';
import { estimateWeather, seasonOfMonth } from '@/features/itinerary/weather';

describe('weather estimate', () => {
  it('maps months to northern-hemisphere seasons', () => {
    expect(seasonOfMonth(1)).toBe('WINTER');
    expect(seasonOfMonth(4)).toBe('SPRING');
    expect(seasonOfMonth(7)).toBe('SUMMER');
    expect(seasonOfMonth(10)).toBe('AUTUMN');
  });

  it('gives a hot summer + sun-protection clothing for Riyadh in July', () => {
    const w = estimateWeather('الرياض', '2026-07-10');
    expect(w.known).toBe(true);
    expect(w.season).toBe('SUMMER');
    expect(w.condition).toBe('HOT');
    expect(w.clothing).toContain('SUNSCREEN');
    expect(w.clothing).toContain('COMFY_SHOES');
  });

  it('gives cool weather + a coat for a temperate city in winter', () => {
    const w = estimateWeather('Istanbul', '2026-01-15');
    expect(w.season).toBe('WINTER');
    expect(['COOL', 'COLD']).toContain(w.condition);
    expect(w.clothing.some((c) => c === 'COAT' || c === 'JACKET')).toBe(true);
    expect(w.wet).toBe(true); // temperate winters are wet -> umbrella
    expect(w.clothing).toContain('UMBRELLA');
  });

  it('falls back to a generic estimate for an unknown city', () => {
    const w = estimateWeather('Xyzville', '2026-06-01');
    expect(w.known).toBe(false);
    expect(w.tempMax).toBeGreaterThan(0);
  });
});
