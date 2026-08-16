# US-002 — User Profile & Preferences
Status: DRAFT · Size: S · Tenant-scoped: No

## 1. Story ID & Title
**US-002 — User Profile & Preferences** (profile view/edit, language, theme, notification prefs, account deletion).

## 2. User Story
**As a** registered user, **I want** to view and edit my profile and app preferences (language, theme, notifications), **so that** the app reflects my identity and settings across web and mobile.

## 3. Business Goal
Persist user identity & preferences (G7) so localization/theming and notifications behave consistently; provide account self-management (privacy/compliance).

## 4. Scope
**In:** Profile read/edit (name, phone, avatar), language (AR/EN), theme (light/dark/system), notification preferences, self account deletion (with blockers). **Out:** Role management (US-016), payment methods (N/A), social profile visibility settings (Assumption/future).

## 5. Functional Requirements
- **FR-002-001** View profile (name, email[read-only], phone, avatar).
- **FR-002-002** Edit name/phone/avatar.
- **FR-002-003** Toggle language AR↔EN → persists + updates `dir` app-wide.
- **FR-002-004** Toggle theme (light/dark/system) → persists.
- **FR-002-005** Manage notification categories (invites, friend requests, payment reminders, buddy updates).
- **FR-002-006** Request account deletion (self).
- **FR-002-007** Avatar upload to Firebase Storage (validated).

## 6. Business Rules
- **BR-002-001** Email is immutable here (identity anchor); change requires re-auth flow (future).
- **BR-002-002** Deletion blocked while sole `TRIP_OWNER` of an active trip with other members → must transfer ownership (US-009) or archive. Message provided.
- **BR-002-003** Preference changes take effect immediately and sync across devices (server is source of truth).
- **BR-002-004** Deleting account soft-deletes `users/{uid}` (retention window) then purges per policy.

## 7. Operation Rules
- **Create:** N/A (created in US-001).
- **Update:** profile/preferences → `PATCH /users/me`; optimistic UI, server authoritative.
- **Delete & Blockers:** see BR-002-002; on allowed delete → soft-delete + revoke sessions + queue purge.
- **Activate/Deactivate:** N/A (admin suspend in US-016).
- **Import/Export:** Optional data export (GDPR-style) — **Assumption/future**, listed in Open Questions.

## 8. Validation Rules
- **VR-002-001** Name ≤50, non-empty first/last. **VR-002-002** Phone E.164. **VR-002-003** Avatar ≤5MB, jpg/png/webp, image sniff. **VR-002-004** Locale∈{ar,en}; theme∈{light,dark,system}. Server-enforced.

## 9. Permissions & Access Control
| Action | USER(self) | ADMIN | SUPER_ADMIN |
|---|---|---|---|
| read/update own profile | ✔ⓜ | read(support+audit) | ✔ |
| delete own account | ✔ⓜ | — | ✔ |
Server enforces `uid == self`. No user reads another's private profile.

## 10. Audit Requirements
`PROFILE_UPDATE(old→new for name/phone)`, `PREF_UPDATE`, `AVATAR_UPLOAD`, `ACCOUNT_DELETE_REQUEST`, `ACCOUNT_DELETE_BLOCKED(reason)`. Exclude avatar binary; store path only.

## 11. Acceptance Criteria
- **AC1** Given I edit my name, When I save, Then it persists and reflects on next load & other devices.
- **AC2** Given I switch language to EN, When applied, Then UI becomes LTR/English without reload and persists.
- **AC3** Given I switch theme to dark, When applied, Then theme persists across sessions/devices.
- **AC4** Given I am the sole owner of an active trip with members, When I request deletion, Then it is blocked with a localized reason and a transfer/archive CTA.
- **AC5** Given a valid avatar, When uploaded, Then it is stored securely and displayed; invalid files are rejected with a message.
- **AC6** All in AR/EN + 4 breakpoints + keyboard/screen-reader accessible.

## 12. Dependencies
Depends on: US-001, US-014. Related: US-009 (ownership transfer), US-015 (notif prefs consumed by push).

## 13. Product Subtasks
- **US-002-UX-001** Profile & Settings screens: layout, avatar picker, language/theme/notif toggles; states Empty/Loading/Error/Success; modals (delete-confirm, transfer-required); responsive (settings list → sections on desktop); RTL/LTR; a11y (labeled controls, live regions); UX AC = AC1–AC6; DoD.
- **US-002-FE-001** Profile module: `ProfilePage`, `SettingsPage`, `AvatarUploader`; API `GET/PATCH /users/me`, avatar upload; RHF+Zod; theme/locale store wiring (from US-014); optimistic update + rollback; DoD tests.
- **US-002-BE-001** Endpoints `GET /api/v1/users/me`, `PATCH /api/v1/users/me`, `POST /api/v1/users/me/avatar`, `DELETE /api/v1/users/me`; deletion blocker logic in Application service; audit; validation; unit tests (blocked/allowed delete, pref update); DoD.
- **US-002-SEC-001** Authorization self-only; Storage rules (avatar path per uid, size/type); input validation; OWASP A01/A08; sensitive-data minimization; deletion revokes tokens; DoD.
- **US-002-QA-001** Functional AC1–AC6; BR-002-*; validation (file/phone/locale); permission (cannot edit others); RTL/responsive; regression (theme/locale from US-014); evidence; DoD.

## 14. Definition of Ready
Depends on US-001/US-014 ready; delete-blocker rule agreed with US-009; storage rules defined; i18n keys planned. ✅

## 15. Definition of Done
Global DoD + AC1–AC6 pass; prefs sync server-side; avatar secure; deletion blocker verified; audit emitted; AR/EN + 4 breakpoints + a11y.
