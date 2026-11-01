import { describe, it, expect } from 'vitest';
import { formatIban, normalizeIban, validateIban } from '@/features/profile/profileModel';

describe('IBAN', () => {
  it('normalizes and formats', () => {
    expect(normalizeIban(' sa03 8000 0000 6080 1016 7519 ')).toBe('SA0380000000608010167519');
    expect(formatIban('SA0380000000608010167519')).toBe('SA03 8000 0000 6080 1016 7519');
  });

  it('accepts valid IBANs (mod-97) in any spacing/case', () => {
    expect(validateIban('SA03 8000 0000 6080 1016 7519')).toBeNull(); // Saudi sample
    expect(validateIban('sa0380000000608010167519')).toBeNull();
    expect(validateIban('GB82 WEST 1234 5698 7654 32')).toBeNull();  // UK sample
  });

  it('rejects wrong check digits, wrong Saudi length and garbage', () => {
    expect(validateIban('SA03 8000 0000 6080 1016 7518')).toBe('INVALID'); // last digit changed
    expect(validateIban('SA038000000060801016751')).toBe('INVALID');       // 23 chars
    expect(validateIban('')).toBe('INVALID');
    expect(validateIban('hello')).toBe('INVALID');
    expect(validateIban('1234567890123456789012')).toBe('INVALID');
  });
});
