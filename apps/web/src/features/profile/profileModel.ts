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
  avatarUrl: string;
  notif: NotifPrefs;
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
