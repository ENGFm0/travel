import { createApiClient } from '@boardingpass/core';
import type { GlobalRole } from '@boardingpass/types';
import type { AdminUser, AuditEntry, Flag } from './adminModel';

export interface AdminData {
  users: AdminUser[];
  flags: Flag[];
  audit: AuditEntry[];
}

export interface AdminService {
  load(): Promise<AdminData>;
  suspend(uid: string, reason: string): Promise<AdminData>;
  reactivate(uid: string): Promise<AdminData>;
  moderate(flagId: string, action: 'REMOVE' | 'APPROVE', reason: string): Promise<AdminData>;
  assignRole(uid: string, role: GlobalRole): Promise<AdminData>;
}

const uid = (p: string) => `${p}-${crypto.randomUUID()}`;
const ACTOR = 'admin@me';
// Fixed clock for the mock (Date.now is unavailable in some contexts; the real
// server stamps audit entries authoritatively).
let seq = 0;
const stamp = () => `2026-08-18T10:${String(seq++).padStart(2, '0')}:00`;

/** In-memory admin service for dev/tests. Every mutation appends an append-only
 *  audit entry (BR-016-001, AC5). NOT a security boundary — the server enforces
 *  ADMIN/SUPER_ADMIN authorization and owns the tamper-evident audit log. */
export function createMockAdminService(seed?: Partial<AdminData>): AdminService {
  const data: AdminData = {
    users: seed?.users ?? demoUsers(),
    flags: seed?.flags ?? demoFlags(),
    audit: seed?.audit ?? [],
  };
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const snap = (): AdminData => ({
    users: data.users.map((u) => ({ ...u })),
    flags: data.flags.map((f) => ({ ...f })),
    audit: data.audit.map((a) => ({ ...a })),
  });
  const audit = (action: string, target: string, reason?: string) =>
    data.audit.unshift({ id: uid('a'), actor: ACTOR, action, target, ts: stamp(), reason });

  return {
    async load() { await tick(); return snap(); },
    async suspend(u, reason) {
      await tick();
      const user = data.users.find((x) => x.uid === u);
      if (user) { user.status = 'SUSPENDED'; audit('USER_SUSPEND', user.email, reason); }
      return snap();
    },
    async reactivate(u) {
      await tick();
      const user = data.users.find((x) => x.uid === u);
      if (user) { user.status = 'ACTIVE'; audit('USER_REACTIVATE', user.email); }
      return snap();
    },
    async moderate(flagId, action, reason) {
      await tick();
      const flag = data.flags.find((f) => f.id === flagId);
      if (flag) { flag.status = action === 'REMOVE' ? 'REMOVED' : 'APPROVED'; audit('CONTENT_MODERATE', `${flag.domain}:${flag.id}`, `${action} — ${reason}`); }
      return snap();
    },
    async assignRole(u, role) {
      await tick();
      const user = data.users.find((x) => x.uid === u);
      if (user) { const old = user.role; user.role = role; audit('ROLE_ASSIGN', user.email, `${old}→${role}`); }
      return snap();
    },
  };
}

export function createApiAdminService(getToken?: () => string | undefined): AdminService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  const load = () => client.apiFetch<AdminData>('/admin/overview');
  return {
    load,
    suspend: async (u, reason) => { await client.apiFetch<void>(`/admin/users/${u}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }); return load(); },
    reactivate: async (u) => { await client.apiFetch<void>(`/admin/users/${u}/reactivate`, { method: 'POST' }); return load(); },
    moderate: async (id, action, reason) => { await client.apiFetch<void>(`/admin/moderation/${id}`, { method: 'PATCH', body: JSON.stringify({ action, reason }) }); return load(); },
    assignRole: async (u, role) => { await client.apiFetch<void>(`/admin/users/${u}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); return load(); },
  };
}

export function demoUsers(): AdminUser[] {
  return [
    { uid: 'u1', name: 'خالد', email: 'khalid@example.com', role: 'USER', status: 'ACTIVE' },
    { uid: 'u2', name: 'سالم', email: 'salem@example.com', role: 'USER', status: 'ACTIVE' },
    { uid: 'u3', name: 'نورة', email: 'noura@example.com', role: 'ADMIN', status: 'ACTIVE' },
  ];
}
export function demoFlags(): Flag[] {
  return [
    { id: 'f1', domain: 'BUDDY', summary: 'رحلة أوروبا للشباب', reason: 'محتوى غير لائق', status: 'PENDING' },
    { id: 'f2', domain: 'REVIEW', summary: 'مراجعة مطعم نجد', reason: 'إساءة', status: 'PENDING' },
  ];
}

export function createAdminService(): AdminService {
  return import.meta.env.VITE_API_BASE_URL ? createApiAdminService() : createMockAdminService();
}
