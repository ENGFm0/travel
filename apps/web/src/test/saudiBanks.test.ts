import { describe, it, expect } from 'vitest';
import { bankFromIban, bankLabel, countryFlag } from '@/shared/saudiBanks';

describe('bank detection from IBAN', () => {
  it('reads the SAMA bank code at positions 5–6 of a Saudi IBAN', () => {
    expect(bankFromIban('SA03 8000 0000 6080 1016 7519')?.en).toBe('Al Rajhi Bank');  // 80
    expect(bankFromIban('sa4410000000000000000000')?.ar).toBe('البنك الأهلي السعودي'); // 10
    expect(bankFromIban('SA0005')?.en).toBe('Alinma Bank');                         // partial while typing
    expect(bankFromIban('SA0078')?.en).toBe('stc bank');
    expect(bankFromIban('SA0036')?.en).toBe('D360 Bank');
  });

  it('is silent until the bank code has been typed', () => {
    expect(bankFromIban('')).toBeNull();
    expect(bankFromIban('SA00')).toBeNull();
    expect(bankFromIban('hello')).toBeNull();
  });

  it('falls back gracefully for unknown Saudi codes and foreign IBANs', () => {
    const unknown = bankFromIban('SA0099');
    expect(unknown?.known).toBe(false);
    expect(unknown?.ar).toContain('99');
    const gb = bankFromIban('GB82 WEST 1234 5698 7654 32');
    expect(gb?.known).toBe(false);
    expect(gb?.emoji).toBe('🇬🇧');
    expect(countryFlag('AE')).toBe('🇦🇪');
  });

  it('builds a localised label with the emoji', () => {
    expect(bankLabel('SA0380000000608010167519', 'ar')).toBe('🟦 مصرف الراجحي');
    expect(bankLabel('SA0380000000608010167519', 'en')).toBe('🟦 Al Rajhi Bank');
    expect(bankLabel('SA', 'ar')).toBe('');
  });
});
