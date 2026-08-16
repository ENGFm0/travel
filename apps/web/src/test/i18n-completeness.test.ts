import { describe, it, expect } from 'vitest';
import ar from '@/shared/i18n/ar.json';
import en from '@/shared/i18n/en.json';

/** FR-014-007 / AC7: i18n bundle completeness — AR and EN must have identical
 *  key sets (no missing/extra keys). This is the CI missing-key guard. */
function flatKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('i18n completeness', () => {
  it('AR and EN have identical key sets', () => {
    const arKeys = new Set(flatKeys(ar));
    const enKeys = new Set(flatKeys(en));
    const missingInEn = [...arKeys].filter((k) => !enKeys.has(k));
    const missingInAr = [...enKeys].filter((k) => !arKeys.has(k));
    expect({ missingInEn, missingInAr }).toEqual({ missingInEn: [], missingInAr: [] });
  });
});
