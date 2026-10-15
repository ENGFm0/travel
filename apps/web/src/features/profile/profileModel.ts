// Pure model + helpers for US-002 (profile & preferences).

export interface NotifPrefs {
  invites: boolean;
  friendRequests: boolean;
  paymentReminders: boolean;
  buddyUpdates: boolean;
}

export const NOTIF_KEYS: (keyof NotifPrefs)[] = ['invites', 'friendRequests', 'paymentReminders', 'buddyUpdates'];

export function defaultPrefs(): NotifPrefs {
  return { invites: true, friendRequests: true, paymentReminders: true, buddyUpdates: false };
}

export interface Profile {
  uid: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string; // immutable identity anchor (BR-002-001)
  phone: string;
  username?: string; // optional public handle, used to be discoverable by friends
  country?: string; // ISO 3166-1 alpha-2 home country (drives default currency)
  avatarUrl: string;
  notif: NotifPrefs;
}

/** Normalize a username for storage/lookup: trim, lowercase, drop a leading @. */
export function normalizeUsername(u: string): string {
  return (u ?? '').trim().toLowerCase().replace(/^@+/, '');
}

/** Validate an optional username: 3–20 chars, letters/digits/._ only. */
export function validateUsername(u: string): 'INVALID' | 'TOO_SHORT' | null {
  const n = normalizeUsername(u);
  if (!n) return null; // optional
  if (n.length < 3 || n.length > 20) return 'TOO_SHORT';
  if (!/^[a-z0-9._]+$/.test(n)) return 'INVALID';
  return null;
}

/** Canonical phone key for lookup: last 9 digits (handles 05… and +9665… alike). */
export function phoneKey(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
}

export type AvatarError = 'TYPE' | 'SIZE';
export const AVATAR_MAX = 5 * 1024 * 1024; // 5 MB (VR-002-003)
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Validate an avatar file: jpg/png/webp, ≤ 5 MB (VR-002-003, AC5). */
export function validateAvatar(mime: string, size: number): AvatarError | null {
  if (!AVATAR_TYPES.includes(mime)) return 'TYPE';
  if (size > AVATAR_MAX) return 'SIZE';
  return null;
}

/** First/last are required and ≤ 50 chars (VR-002-001). Returns an error code or null. */
export function validateName(firstName: string, lastName: string): 'REQUIRED' | 'TOO_LONG' | null {
  if (!firstName.trim() || !lastName.trim()) return 'REQUIRED';
  if (firstName.length > 50 || lastName.length > 50) return 'TOO_LONG';
  return null;
}

export function fullName(p: Pick<Profile, 'firstName' | 'middleName' | 'lastName'>): string {
  return [p.firstName, p.middleName, p.lastName].map((s) => s.trim()).filter(Boolean).join(' ');
}
