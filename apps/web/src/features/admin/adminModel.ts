// Pure model + helpers for US-016 (admin & moderation console).
import type { GlobalRole } from '@boardingpass/types';

export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type FlagDomain = 'REVIEW' | 'BUDDY' | 'MEMORY';
export type FlagStatus = 'PENDING' | 'REMOVED' | 'APPROVED';

export interface AdminUser {
  uid: string;
  name: string;
  email: string;
  role: GlobalRole;
  status: UserStatus;
}

export interface Flag {
  id: string;
  domain: FlagDomain;
  summary: string;
  reason: string;
  status: FlagStatus;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  ts: string;
  reason?: string;
}

export function isAdmin(role: GlobalRole): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/** Only SUPER_ADMIN may manage roles/other admins (BR-016-002). */
export function canManageRoles(role: GlobalRole): boolean {
  return role === 'SUPER_ADMIN';
}

export function filterUsers(users: AdminUser[], query: string): AdminUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
}

export function filterAudit(entries: AuditEntry[], query: string): AuditEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.actor.toLowerCase().includes(q) || e.action.toLowerCase().includes(q) || e.target.toLowerCase().includes(q));
}
