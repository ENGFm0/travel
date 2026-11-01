import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatNumber } from '@boardingpass/core';
import { avatarInitial } from '@/features/profile/profileModel';
import i18next from 'i18next';
import '@/shared/i18n';

const LATIN_ONLY = /^[^٠-٩]*$/; // no Arabic-Indic digits

describe('numerals are Latin (0-9) in Arabic too', () => {
  it('numbers, currency and dates use 0-9 in ar', () => {
    expect(formatNumber(2026, 'ar')).toMatch(LATIN_ONLY);
    expect(formatNumber(2026, 'ar')).toBe('2,026'); // Latin digits, Latin grouping
    expect(formatCurrency(1234.5, 'SAR', 'ar')).toMatch(LATIN_ONLY);
    const d = formatDate('2026-12-10', 'ar', { year: 'numeric', month: 'short', day: 'numeric' });
    expect(d).toMatch(LATIN_ONLY);
    expect(d).toMatch(/\d/);
  });
  it('percent-style strings in the UI are Latin as well', () => {
    expect(formatNumber(45, 'ar')).toBe('45');
  });
});

describe('Arabic plural forms', () => {
  it('members count reads naturally for 1 / 2 / 3–10 / 11+', async () => {
    await i18next.changeLanguage('ar');
    expect(i18next.t('tripDetail.memberCount', { count: 1 })).toBe('عضو واحد');
    expect(i18next.t('tripDetail.memberCount', { count: 2 })).toBe('عضوان');
    expect(i18next.t('tripDetail.memberCount', { count: 5 })).toBe('5 أعضاء');
    expect(i18next.t('tripDetail.memberCount', { count: 12 })).toBe('12 عضوًا');
    await i18next.changeLanguage('en');
    expect(i18next.t('tripDetail.memberCount', { count: 1 })).toBe('1 member');
    expect(i18next.t('tripDetail.memberCount', { count: 3 })).toBe('3 members');
  });
});

describe('avatar initial', () => {
  it('uses the first letter of the first name, Arabic kept, Latin upper-cased', () => {
    expect(avatarInitial({ firstName: 'سارة', email: 'sara@x.co' })).toBe('س');
    expect(avatarInitial({ firstName: 'sara' })).toBe('S');
    expect(avatarInitial({ firstName: '', displayName: 'مستخدم تجريبي' })).toBe('م');
    expect(avatarInitial({ email: 'omar@x.co' })).toBe('O');
    expect(avatarInitial({})).toBe('?');
  });
});
