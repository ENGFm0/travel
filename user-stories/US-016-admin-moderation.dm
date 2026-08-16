# US-016 — Admin & Moderation Console
Status: DRAFT · Size: M · Tenant-scoped: No (cross-tenant, admin-global) — **Assumption-derived** (not visually in prototype; required to operate a real platform)

## 1. Story ID & Title
**US-016 — Admin & Moderation Console**: user management (suspend/reactivate), content moderation (reviews, buddy requests, memories flags), audit log access, platform config, role management (super-admin).

## 2. User Story
**As an** admin/super-admin, **I want** to moderate users and content and review audit logs, **so that** the platform stays safe, compliant, and operable.

## 3. Business Goal
Operate the platform safely at scale (G7): abuse handling, compliance, support, governance. Enforces server-side authority across tenants with audit.

## 4. Scope
**In:** User list/search; suspend/reactivate user; view/handle flags (reviews US-012, buddy requests US-011, memories US-013); take-down content; read audit logs (filtered); platform config/feature flags; **super-admin** role/permission management.
**Out:** Financial reconciliation/PSP (N/A), CMS for curated places authoring (future), analytics dashboards (future).

## 5. Functional Requirements
- **FR-016-001** Search/list users; view profile summary + status.
- **FR-016-002** Suspend / reactivate a user (with reason); suspended users cannot log in (US-001 BR).
- **FR-016-003** Moderation queue of flagged content across domains; approve/remove.
- **FR-016-004** View audit logs with filters (actor, action, entity, tenant, date).
- **FR-016-005** Manage platform config/feature flags.
- **FR-016-006** Super-admin: manage roles/permissions (assign ADMIN, etc.).
- **FR-016-007** Empty/loading/error states; pagination.

## 6. Business Rules
- **BR-016-001** All admin actions on tenant/user data are **audited** (actor, target, reason, old→new).
- **BR-016-002** `ADMIN` cannot manage roles or other admins; only `SUPER_ADMIN` can (roles.manage).
- **BR-016-003** Admins access tenant data **only** via moderation/support flows, always logged; no silent access.
- **BR-016-004** Suspension takes effect immediately (token revoke + login denial).
- **BR-016-005** Content take-down notifies the owner (US-015) with reason.
- **BR-016-006** Destructive admin actions require confirmation + reason.

## 7. Operation Rules
- **Create:** N/A (acts on existing). **Update:** suspend/reactivate, config, roles. **Delete & Blockers:** content take-down (soft where possible); cannot delete audit logs (append-only). **Activate/Deactivate:** user suspend/reactivate; feature flags. **Import/Export:** audit export (restricted, logged).

## 8. Validation Rules
- **VR-016-001** Reason required for suspend/take-down. **VR-016-002** Role assignment target valid; role∈catalog; super-admin-only. **VR-016-003** Audit queries scoped & paginated. Server-authoritative.

## 9. Permissions & Access Control
| Action | ADMIN | SUPER_ADMIN |
|---|---|---|
| user list/search | ✔ | ✔ |
| suspend/reactivate | ✔ | ✔ |
| moderate content | ✔ | ✔ |
| read audit | ✔(scoped) | ✔ |
| platform config | ✔(limited) | ✔ |
| roles.manage / manage admins | — | ✔ |
Non-admins: fully denied. Server-enforced; Firebase Rules block client admin paths.

## 10. Audit Requirements
Every action: `USER_SUSPEND/REACTIVATE(reason)`, `CONTENT_MODERATE(entity, action, reason)`, `AUDIT_EXPORT`, `CONFIG_CHANGE(old→new)`, `ROLE_ASSIGN(target, old→new)`. Append-only, tamper-evident; actor, target, tenant, ip, ts, result. Audit logs are themselves read-restricted.

## 11. Acceptance Criteria
- **AC1** Given a reported buddy request, When I remove it, Then it's taken down, the owner is notified with reason, and the action is audited.
- **AC2** Given a user violates policy, When I suspend them (with reason), Then they cannot log in and their tokens are revoked immediately.
- **AC3** Given I am ADMIN, When I try to assign a role, Then it's blocked (super-admin only).
- **AC4** Given audit filters, When I query, Then I see paginated matching entries; I cannot delete them.
- **AC5** Given any admin action, When performed, Then a complete audit record (actor/target/reason/old→new) exists.
- **AC6** Given a non-admin, When they hit any admin API, Then 403 with unified error (no info leak).
- **AC7** AR/EN + 4 breakpoints + accessible admin UI.

## 12. Dependencies
Depends on: US-001 (auth/roles), 01-roles-and-permissions, US-014. Consumes flags/audit from all stories; notifies via US-015.

## 13. Product Subtasks
- **US-016-UX-001** Admin UX: users table (search/status/actions), moderation queue, audit viewer (filters), config panel, role management (super); confirm+reason modals; states + pagination; RTL; responsive (tables → cards on mobile); a11y (table semantics, focus); UX AC=AC1–AC7; DoD.
- **US-016-FE-001** Admin module (separate route group, role-guarded): users, moderation, audit, config, roles; server-driven tables; confirm/reason dialogs; i18n; DoD tests.
- **US-016-BE-001** Endpoints under `/api/v1/admin/*` (users, moderation, audit, config, roles); authorization policies (ADMIN/SUPER_ADMIN); suspension (token revoke); append-only audit store + query; take-down + notify (US-015); validation; unit tests; DoD.
- **US-016-SEC-001** Strict authorization (RBAC admin/super), no silent tenant access (all logged), append-only tamper-evident audit, least-privilege, OWASP A01/A09, secrets, audit-of-audit-access; DoD.
- **US-016-QA-001** Functional AC1–AC7; BR-016-*; validation; permission (admin vs super boundaries, non-admin denied); security (privilege escalation attempts, audit immutability); RTL/responsive; regression (suspend blocks login US-001; take-down notifies US-015); evidence; DoD.

## 14. Definition of Ready
Roles/permissions (01) locked; admin scope agreed (Assumption accepted); audit store design; moderation domains enumerated (US-011/012/013). ✅

## 15. Definition of Done
Global DoD + AC1–AC7; role-bounded admin; immediate suspension; append-only audit; take-down + notify; super-admin-only role mgmt; every action audited; AR/EN + breakpoints + a11y; tests green.
