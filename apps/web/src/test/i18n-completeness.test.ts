import { describe, it, expect } from 'vitest';
import { ar, en } from '@boardingpass/i18n';

/** FR-014-007 / AC7: i18n bundle completeness — AR and EN must have identical
 *  key sets (no missing/extra keys). This is the CI missing-key guard. */
function flatKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}
/** i18next plural forms differ per language (Arabic has six, English two), so
 *  `key_one` … `key_other` all count as the one logical key. */
const PLURAL = /_(zero|one|two|few|many|other)$/;
const logical = (keys: string[]) => new Set(keys.map((k) => k.replace(PLURAL, '')));

describe('i18n completeness', () => {
  it('AR and EN have identical key sets', () => {
    const arKeys = logical(flatKeys(ar));
    const enKeys = logical(flatKeys(en));
    const missingInEn = [...arKeys].filter((k) => !enKeys.has(k));
    const missingInAr = [...enKeys].filter((k) => !arKeys.has(k));
    expect({ missingInEn, missingInAr }).toEqual({ missingInEn: [], missingInAr: [] });
  });
});
