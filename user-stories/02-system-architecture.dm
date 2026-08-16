# 02 — System Architecture · BoardingPass

Locked stack (per Master Prompt §35). Any deviation is justified inline.

---

## 1. High-Level Topology

```
┌────────────┐     ┌────────────┐        ┌───────────────────────────┐
│  Web (SPA) │     │  Mobile    │        │  ASP.NET Core Web API      │
│ React+Vite │     │ RN 0.86    │  HTTPS │  .NET 10 LTS (Clean Arch)  │
│  TS        │────▶│  TS/Expo   │───────▶│  /api/v1/*                 │
└────────────┘     └────────────┘        │  ── Authorization (RBAC/PBAC)
       │  shared packages (types,        │  ── Validation / DTOs / Services
       │  api-client, i18n, schemas,     │  ── Firebase Admin SDK
       │  design-tokens)                 └───────────┬───────────────┘
       ▼                                              │ (Admin SDK, server-side)
  Firebase App Check ─────────────────────────────────┤
                                                       ▼
         ┌──────────────────────────────────────────────────────────────┐
         │ Firebase: Auth · Cloud Firestore · Storage · FCM · Analytics  │
         │ Security Rules mirror API authorization                        │
         └──────────────────────────────────────────────────────────────┘
                          ▲
        3rd-party (server-side proxy only): AviationStack, Exchange-rate,
        Maps/Places, Push — keys never exposed to clients.
```

**Key decision — API-mediated Firebase:** Clients authenticate with Firebase Auth (ID token) but **write/read business data through the ASP.NET Core API**, which holds business logic, validation, audit, and enforces authorization via the Firebase Admin SDK. Direct client→Firestore is allowed **only** for narrowly-scoped, read-mostly paths guarded by Security Rules (e.g., realtime trip snapshot), never for privileged writes. Rationale: Master Prompt forbids business logic in controllers *and* mandates server-side enforcement + audit + no secrets in client; a thin API in front of Firebase satisfies both while keeping Firestore realtime where it adds UX value.

## 2. Web Architecture (React + TS + Vite 8.1)

- **Routing:** React Router (data routers). No Next.js. Route-based code-splitting (`lazy`).
- **Structure:** feature-sliced — `app/`, `features/<domain>/{components,hooks,api,state,i18n}`, `shared/{ui,lib,types}`.
- **Component model:** reusable presentational components + typed props; design tokens from shared package; TailwindCSS (build-time, not CDN) or CSS-modules with tokens.
- **State management (per §16):**
  - *Server state* → **TanStack Query** (cache, retries, invalidation) for all API data.
  - *Auth state* → dedicated context/store hydrated from Firebase Auth + backend session.
  - *UI state* → local `useState`/`useReducer`; global UI (theme, locale, dir) → lightweight store (Zustand).
  - *Form state* → **React Hook Form** + shared **Zod** schemas.
  - *Cached/persisted* → Query persistence + `localStorage` for theme/locale only.
- **i18n:** `i18next` + `react-i18next`; `dir` toggling; ICU messages; AR/EN bundles; no hard-coded strings.
- **Accessibility:** semantic HTML, focus-trap in modals, skip-links, `aria-live` for async results.
- **Perf:** route/code splitting, image `srcset`/lazy, query pagination, memoization, prefetch on intent.

## 3. Mobile Architecture (React Native 0.86 + TS, Expo where fit)

- **Navigation:** React Navigation (native stack + bottom tabs mirroring the 5-item bar).
- **Shared with web:** `@bp/types`, `@bp/api-client`, `@bp/validation` (Zod), `@bp/i18n`, `@bp/design-tokens`, business-independent utils, state models. **Not shared:** platform UI (RN vs DOM), navigation, storage adapters.
- **RTL:** `I18nManager.forceRTL` on locale switch; direction-aware layouts.
- **Native concerns:** camera/gallery (memories), push (FCM via `@react-native-firebase`), secure token storage (Keychain/Keystore), offline cache.
- **State:** same model as web (TanStack Query + RHF + Zod + Zustand for UI).

## 4. Backend Architecture (ASP.NET Core, .NET 10, Clean Architecture)

- **Layers:** `Domain` (entities, value objects, domain rules) → `Application` (use-cases/services, DTOs, validators, interfaces) → `Infrastructure` (Firebase Admin repositories, external clients, FCM) → `Api` (controllers = thin, versioned).
- **No business logic in controllers.** Controllers: bind → authorize → call Application service → map to `Result` → HTTP.
- **Cross-cutting:** DI, FluentValidation, centralized exception middleware → unified error contract, Serilog structured logging, audit-log service, rate limiting (per-user + per-IP), API versioning (`/api/v1`), OpenAPI/Swagger, secure config (Key Vault / env), CORS allow-list, security headers.
- **Auth:** `Firebase.Auth` ID-token validation middleware → `ClaimsPrincipal` (uid, email, global role custom claim) → per-request trip membership resolution for trip-scoped policies.
- **Authorization:** policy + requirement handlers; `[Authorize(Policy="trip.expense.mark_paid")]`; handlers load membership from Firestore.

## 5. Firebase Architecture (each service justified)

| Service | Used? | Justification |
|--------|-------|---------------|
| **Authentication** | ✔ | Email/password, Google, anonymous(guest); backend validates ID tokens; custom claims for global role. |
| **Cloud Firestore** | ✔ | Primary datastore for trips, members, expenses, tasks, packing, friends, buddies, memories metadata; realtime for live trip collaboration. |
| **Storage** | ✔ | Memories media (photos/videos), exported report PDFs; signed access; per-trip path isolation. |
| **Cloud Messaging (FCM)** | ✔ | Invitations, friend requests, payment/settlement reminders ("برق"), buddy join updates. |
| **Analytics** | ✔ (opt-in) | Product analytics/funnels; consent-gated, no PII in events. |
| **App Check** | ✔ | Attest legitimate app/web instances to protect API + Firestore/Storage from abuse. |
| Remote Config | ✖ (later) | Not required now — feature flags via backend config. Marked future. |

### 5.1 Firestore Collections (top-level) — detail per story

```
users/{uid}                     profile, prefs(locale,theme,notif), role, createdAt, deletedAt?
trips/{tripId}                  title, type(DOMESTIC|INTERNATIONAL), dateFrom/To, ownerUid,
                                status(ACTIVE|ARCHIVED|DELETED-soft), currencyHome/Dest, rate, auditMeta
  trips/{tripId}/members/{uid}  role(OWNER|MEMBER|VIEWER), joinedAt, status
  trips/{tripId}/cities/{id}    name, iata?, order, dateFrom/To, hotel{}, weather?
    .../cities/{id}/days/{id}   title, order, activities[]
  trips/{tripId}/expenses/{id}  kind(GROUP|SIDE|PERSONAL), amount, currency, payerUid,
                                participants[], category, desc, createdAt, createdBy
  trips/{tripId}/kitty/{singleton}  total, collected, dues{uid:amount,paid:bool}
  trips/{tripId}/tasks/{id}     title, assigneeUid, done, createdBy, createdAt
  trips/{tripId}/packing/{id}   label, category, checked
  trips/{tripId}/memories/{id}  storagePath, type(IMAGE|VIDEO), dayId?/placeId?, uploaderUid, createdAt
friendships/{pairId}            userA, userB, status(PENDING|ACCEPTED|BLOCKED), requestedBy
buddyRequests/{id}              kind(FULL_TRIP|MEETUP), city, dateFrom/To, category, budget,
                                ownerUid, participants[], status(OPEN|FULL|CLOSED)
places/{id}                     name, category, rating, photos[], location  (curated/read-mostly)
notifications/{uid}/{id}        type, payload, read, createdAt
audit/{id}                      actor, action, entity, entityId, tenantId, old?, new?, ip?, result, ts
```

### 5.2 Indexes / Rules / Isolation
- **Composite indexes:** `trips` by `ownerUid+status+dateFrom`; `buddyRequests` by `city+dateFrom+category+budget`; `memories` by `tripId+dayId`; `notifications` by `uid+read+createdAt`.
- **Security Rules:** deny-by-default; trip subcollections require `request.auth.uid ∈ trip members`; `users/{uid}` self-only; Storage `memories/{tripId}/...` require membership; admin paths blocked from clients.
- **Tenant isolation:** every trip-scoped doc lives under `trips/{tripId}`; no query may cross `tripId` without membership. Soft-delete via `status=DELETED`/`deletedAt` with retention window.

## 6. Security Architecture (project-wide — §38)

- **AuthN flow:** client → Firebase Auth → ID token → API validates (Admin SDK) → principal.
- **AuthZ flow:** global role (claim) + trip membership (Firestore) → policy handlers; Firestore/Storage Rules mirror.
- **Token handling:** short-lived ID tokens; refresh via Firebase SDK; mobile stores tokens in Keychain/Keystore; web keeps in memory + secure refresh; no tokens in `localStorage`.
- **Rate limiting & anti-abuse:** per-user/IP quotas; App Check; stricter limits on `flight.lookup`, auth, uploads.
- **Input/Output validation:** Zod (client) + FluentValidation (server, source of truth); output DTOs whitelist fields.
- **Secure file upload:** type/size validation, content-type sniffing, virus/EXIF-strip pipeline, signed URLs, per-tenant path.
- **Secrets:** AviationStack/exchange/Maps keys + Firebase Admin credentials server-side only (Key Vault/env). **Never** in Web/Mobile bundles. (Fixes the current prototype's client-side AviationStack key.)
- **Error contract:** unified `{ code, message, traceId, details? }`; no stack traces/DB/secret leakage.
- **CORS:** explicit origin allow-list; credentials mode controlled.
- **Security headers:** HSTS, CSP, X-Content-Type-Options, Referrer-Policy, frame-ancestors.
- **OWASP Top 10:** reviewed per story (injection, broken access control, SSRF via proxy, etc.).
- **Audit:** who/what/when/tenant/entity/old/new/ip/result for sensitive ops; no unnecessary sensitive data stored.

## 7. External Integrations (server-side proxied)

| Integration | Purpose | Placement |
|---|---|---|
| AviationStack | Flight number → airline, airports, times (US-004) | **Backend proxy** endpoint `/api/v1/flights/lookup`; key server-side; caching + rate limit. Fixes prototype's http/mixed-content + exposed key. |
| Exchange rate | Dual-currency conversion (US-007) | Backend service w/ cache + fallback. |
| Maps/Places | Explore ratings/photos (US-012) | Backend proxy or restricted client key + referrer allow-list (documented trade-off). |
| FCM | Push (US-015) | Backend send via Admin SDK. |

## 8. Unified Error Contract (Web + Mobile + Backend)

```json
{ "code": "TRIP_NOT_FOUND", "message": "الرحلة غير موجودة", "messageEn": "Trip not found",
  "traceId": "…", "details": [ { "field":"tripId", "issue":"required" } ] }
```
Clients map `code` → localized message; never render server internals.

## 9. Environments & Delivery
- Envs: `dev`, `staging`, `prod` (separate Firebase projects). CI runs typecheck/lint/tests. Web → static hosting/CDN; API → container; Mobile → EAS/store pipelines. (Delivery detail elaborated when implementation begins — spec phase only.)
