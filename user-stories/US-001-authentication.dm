# US-001 — Authentication & Account Access
Status: IN-PROGRESS · Size: M · Tenant-scoped: No (global) · Owner role introduced: `USER`

> **Implementation status**
> - `US-001-FE-001/002` (web) — ✅ **DONE & VERIFIED** in `apps/web/src/features/auth/`:
>   swappable `AuthProvider` (mock for dev/tests, **Firebase** for prod behind
>   env config — dynamically imported, excluded from bundle when unconfigured),
>   auth store + hooks, `AuthModal` (email→login/register/forgot, Google, guest,
>   show/hide password, Zod validation, a11y dialog), `RequireAuth` route guard,
>   `?auth=1` controller, header profile→auth wiring. 8 auth tests (email routing,
>   invalid email, wrong→right password, register, guest, route guard) — **25/25
>   web tests green**, typecheck + build green.
> - `US-001-BE-001` — 🟡 **scaffolded** in `apps/api/Endpoints/AuthEndpoints.cs`
>   (`/api/v1/auth/session|guest|logout`, contract shape). Firebase Admin token
>   validation + Firestore user upsert + rate-limit + audit are the remaining BE
>   work. *Not compiled in sandbox (no .NET SDK).*
> - `US-001-SEC-001` — partial: no client secrets, provider abstraction, Zod
>   client validation; server-side token validation + throttling pending BE.
> - Remaining to DONE: real Firebase project config, BE token validation + audit
>   + rate limiting, e2e against live Firebase.

## 1. Story ID & Title
**US-001 — Authentication & Account Access** (login gate, register, Google, guest, session, logout).

## 2. User Story
**As a** visitor,
**I want** to sign in, register, continue with Google, or browse as a guest,
**so that** I can access my trips and group features under a secure identity.

## 3. Business Goal
Establish a secure, low-friction identity layer (G7) that gates all owned data and enables every authenticated journey (G1–G6). Fixes the prototype's mock, client-only auth.

## 4. Scope
**In Scope:** Email/password register + login; Continue-with-Google (OIDC via Firebase); Guest/anonymous session; email-exists routing (login vs register step); password show/hide; forgot-password (reset email); logout; session persistence & refresh; auth-gated route guard; auth modal (from profile icon / `?auth=1`).
**Out of Scope:** Phone/OTP auth, 2FA/MFA (future — Open Questions), SSO with non-Google IdPs, account merging, admin user CRUD (US-016).

## 5. Functional Requirements
- **FR-001-001** System offers three entry methods: email, Google, guest.
- **FR-001-002** Step-1 email entry: if email is registered → password (login) step; else → registration step (mirrors prototype).
- **FR-001-003** Registration collects first/middle/last name, phone, email, password + confirm.
- **FR-001-004** Successful auth persists session and returns global role claim (`USER` default).
- **FR-001-005** Guest mode grants a scoped anonymous session (browse public surfaces; cannot own trips).
- **FR-001-006** Forgot-password sends a reset email via Firebase.
- **FR-001-007** Logout clears session on client and invalidates refresh locally.
- **FR-001-008** Protected routes redirect unauthenticated users to the auth modal/screen, preserving intended destination.
- **FR-001-009** `?auth=1` (or profile icon) opens the auth modal on any page.
- **FR-001-010** Backend validates every Firebase ID token before serving protected APIs.

## 6. Business Rules
- **BR-001-001** An email maps to exactly one account. *Trigger:* register. *Condition:* email already exists. *Behavior:* route to login; message "هذا البريد مسجّل مسبقًا".
- **BR-001-002** Guest sessions cannot perform any `*.create/update/delete` on owned entities; attempting prompts upgrade-to-account.
- **BR-001-003** Password policy: ≥8 chars, ≥1 letter & ≥1 number (server-enforced).
- **BR-001-004** Global role on new account = `USER`; elevation only by `SUPER_ADMIN` (US-016).
- **BR-001-005** After 5 failed logins / 15 min per account+IP, throttle with backoff (anti-abuse).
- **BR-001-006** Reset-password links expire per Firebase default; single-use.

## 7. Operation Rules
- **Create (account):** on register success create `users/{uid}` (profile, prefs defaults locale=ar/theme=system, role=USER, createdAt). Idempotent on provider re-link.
- **Update:** credential changes via provider flows (US-002 handles profile fields).
- **Delete & Blockers:** self-delete deferred to US-002; **Blocker:** cannot delete while sole `TRIP_OWNER` of an active trip with other members (must transfer/settle — cross-ref US-009).
- **Activate/Deactivate:** account can be `SUSPENDED` by admin (US-016) → login denied with reason.
- **Import/Export:** N/A.

## 8. Validation Rules
- **VR-001-001** Email format RFC-5322; normalized lowercase.
- **VR-001-002** Password meets BR-001-003; confirm == password.
- **VR-001-003** Phone: E.164 (client hint + server validation).
- **VR-001-004** Names: non-empty first & last; length ≤ 50; strip control chars.
- **VR-001-005** All validations enforced **server-side**; client mirrors for UX (§24).

## 9. Permissions & Access Control
| Action | GUEST | USER | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| register/login/google/guest | ✔ | ✔ | ✔ | ✔ |
| logout | ✔ | ✔ | ✔ | ✔ |
| access protected data | — | ✔ | ✔ | ✔ |
Server-side enforced; Firebase Rules deny unauthenticated writes.

## 10. Audit Requirements
Log: `LOGIN_SUCCESS`, `LOGIN_FAILURE(reason)`, `REGISTER`, `LOGOUT`, `PASSWORD_RESET_REQUEST`, `GUEST_START`, `TOKEN_VALIDATION_FAILURE`. Fields: actor(uid/email-hash), action, ts, ip, device, result, failureReason. No passwords/tokens stored. Retention per policy.

## 11. Acceptance Criteria (Given/When/Then)
- **AC1** Given a registered email, When user enters it at step-1, Then the app shows the password/login step.
- **AC2** Given an unregistered email, When entered, Then the app shows the registration step prefilled with that email.
- **AC3** Given valid credentials, When user logs in, Then a session is created and the user lands on the intended page with `USER` role.
- **AC4** Given invalid password 5×, When retried, Then the system throttles and shows a localized rate-limit message.
- **AC5** Given a guest session, When guest attempts to create a trip, Then the app blocks and offers account creation.
- **AC6** Given an expired/invalid ID token, When calling a protected API, Then backend returns `401` with unified error contract (no internals).
- **AC7** Works on Desktop/Laptop/Tablet/Mobile, in AR(RTL) & EN(LTR), keyboard-navigable.

## 12. Dependencies
- Depends on: **US-014** (shell/i18n/routing/modal host). Enables: US-002, US-003, US-005, US-010, US-011, US-013, US-015.

## 13. Product Subtasks

### UX — `US-001-UX-*`
- **US-001-UX-001** Auth modal & flow (email step → login step → register step; Google button; guest link; forgot-password).
  - Objective: frictionless, accessible auth. Screens: Auth modal (3 sub-steps), Forgot-password, Guest confirm. Flow: F1. Layout: centered modal (bottom-sheet on mobile). Components: email input, password+toggle, primary/secondary buttons, provider button, stepper. States: Empty(idle), Loading(spinner on submit), Error(field + form banner), Success(redirect). Modals: this is a modal; ESC/scrim close. System messages: localized (exists/invalid/throttled/reset-sent). Responsive: dialog ≥sm, full-height sheet <sm. RTL/LTR: mirrored, `dir` aware, LTR email field. A11y: focus-trap, labeled inputs, `aria-live` errors, 44px targets. UX AC: matches AC1–AC7 visually. Handoff: tokens + states in Figma. DoD: all states + both locales reviewed.
  - AC: covers AC1,AC2,AC5; DoR: tokens ready; DoD: a11y + RTL pass.

### FE — `US-001-FE-*`
- **US-001-FE-001** Auth feature module (Firebase Auth SDK, TanStack Query mutations, RHF+Zod).
  - Objective: implement flows. Pages/Components: `AuthModal`, `EmailStep`, `LoginStep`, `RegisterStep`, `ForgotPassword`, `GuestButton`. API Integration: Firebase Auth (client) + `POST /api/v1/auth/session` (exchange ID token → app session/role). State: auth store + Query. Client Validation: Zod schemas (shared). Error Handling: map error codes → i18n. Loading: button/spinner states. Responsive+RTL+Localization: yes. Browser: last 2 versions evergreen + iOS/Android Safari/Chrome. Perf: lazy-load modal. DoD: unit tests + a11y.
- **US-001-FE-002** Route guard + redirect-to-intended + `?auth=1` handler (web) and native equivalent (mobile).

### BE — `US-001-BE-*`
- **US-001-BE-001** Auth/session endpoints & token validation middleware.
  - Objective: server identity. DB: create/read `users/{uid}`. Endpoints: `POST /api/v1/auth/session` (validate ID token, upsert user, return profile+role), `POST /api/v1/auth/logout`, `POST /api/v1/auth/guest`. Business Logic: in Application services (not controllers). Validation: FluentValidation. Transactions: user upsert idempotent. Audit: §10 events. Tenant Isolation: N/A(global). Permissions: public endpoints + authenticated logout. Exceptions: unified contract. Perf: token cache. Unit Tests: valid/invalid/expired token, new vs existing user, throttle. DoD: tests green + Swagger.
- **US-001-BE-002** Rate-limiting & lockout policy (auth endpoints).

### SEC — `US-001-SEC-*`
- **US-001-SEC-001** Security review.
  - Permission Matrix: §9. Authorization: protected APIs require valid token. Authentication: Firebase ID-token validation (Admin SDK); short-lived tokens; refresh via SDK. Tenant Isolation: N/A. Input Validation: server VR-*. OWASP: A07 (auth failures) throttling, A01 (access control) guard, A02 (crypto) rely on Firebase, A09 logging. Audit Verification: login events present. Sensitive Data: never store password/token; email hashed in audit. Security Acceptance: no secrets in client; tokens not in `localStorage`. DoD: threat items closed.

### QA — `US-001-QA-*`
- **US-001-QA-001** Test suite.
  - Functional: AC1–AC7. Business Rules: BR-001-001..006. Validation: VR-001-001..005 (client+server). Permission: guest blocked from owned writes; unauth API → 401. Security: throttle, token tampering, no info leak. Audit: events emitted with correct fields. RTL: modal mirrored, email LTR. Responsive: sheet<sm, dialog≥sm. Regression: navigation/route-guard unaffected. Evidence: screenshots (AR/EN, 4 breakpoints), API logs, audit samples. DoD: all pass, evidence attached.

## 14. Definition of Ready
Scope/goal/FR/BR/VR clear; UX flow approved; dependency US-014 available; API contract (`/auth/session`) agreed; error codes defined; security requirements listed. ✅

## 15. Definition of Done
Global DoD + : all AC pass; auth works web+mobile in AR/EN & 4 breakpoints; server token validation live; audit events emitted; rate-limit verified; no client secrets; unit/integration/e2e green; Swagger + i18n keys committed.
