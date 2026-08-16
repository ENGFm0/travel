import { describe, it, expect } from 'vitest';
import { brand, light, dark } from '@boardingpass/design-tokens';

/** US-014 · automated WCAG contrast audit for key text/background pairs.
 *  Closes the "visual contrast" gap with a deterministic check (jsdom can't
 *  compute rendered contrast, so we compute from the token constants). */

function srgbToLin(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe('US-014 color contrast (WCAG 2.2)', () => {
  const AA_NORMAL = 4.5;
  const AA_LARGE = 3.0;

  it('light: ink on bg and on surface ≥ AA normal', () => {
    expect(contrast(light.ink, light.bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(light.ink, light.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('dark: ink on bg and on surface ≥ AA normal', () => {
    expect(contrast(dark.ink, dark.bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(dark.ink, dark.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('primary button (white on orange) ≥ AA large (used for bold/large CTAs)', () => {
    expect(contrast('#FFFFFF', brand.orange)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('white on navy (header/footer on dark surfaces) ≥ AA normal', () => {
    expect(contrast('#FFFFFF', brand.navy)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
