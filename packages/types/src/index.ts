/** @boardingpass/types — cross-platform shared types (web + mobile + api client).
 *  Business-independent; safe to import anywhere. */

// ── UI ──────────────────────────────────────────────────────────────────────
export type Locale = 'ar' | 'en';
export type ThemeChoice = 'light' | 'dark' | 'system';
export type Direction = 'rtl' | 'ltr';

// ── Error contract (architecture §8) ─────────────────────────────────────────
export interface ApiErrorDetail {
  field?: string;
  issue: string;
}
export interface ApiErrorShape {
  code: string;
  message: string; // Arabic (default)
  messageEn?: string;
  traceId?: string;
  details?: ApiErrorDetail[];
}

// ── Identity / roles ─────────────────────────────────────────────────────────
export type GlobalRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';
export type AuthStatus = 'loading' | 'authenticated' | 'guest' | 'unauthenticated';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  role: GlobalRole;
}

// ── Domain enums referenced across stories ───────────────────────────────────
export type TripType = 'DOMESTIC' | 'INTERNATIONAL';
export type TripStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED';
export type MemberRole = 'OWNER' | 'MEMBER' | 'VIEWER';
export type ExpenseKind = 'GROUP' | 'SIDE' | 'PERSONAL';
export type BuddyKind = 'FULL_TRIP' | 'MEETUP';

export const LOCALES: readonly Locale[] = ['ar', 'en'];
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];

export function dirForLocale(locale: Locale): Direction {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
