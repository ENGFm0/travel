# US-004 — Flight Details Auto-Fill (AviationStack)
Status: IN-PROGRESS · Size: S · Tenant-scoped: Yes (used within trip creation/edit)

> **Implementation status**
> - `US-004-FE-001` (web) — ✅ **DONE & VERIFIED** in `apps/web/src/features/flights/`,
>   mounted in the itinerary city panel (US-006): a `FlightLookup` panel — flight-code
>   input (LTR, normalized uppercase) + Auto-fill button with `aria-busy` and a
>   disabled/loading state, mapping the result to airline + departure/arrival airport
>   (name + IATA) + localized scheduled times, with distinct **empty** ("no data,
>   enter manually"), **error**, and **rate-limited** messages. On success it prefills
>   the city's flight field non-destructively via `onFilled`. **The AviationStack key
>   is NOT in the client** — the service calls the backend proxy (this re-platforms the
>   prototype's exposed-key/mixed-content client call, AC6/BR-004-001). Pure model
>   (`flightsModel.ts`): `normalizeCode`, `isValidCode` (`^[A-Z0-9]{2}\d{1,4}$`),
>   `flightSummary`. Swappable `FlightsService` (mock ↔ API proxy). 7 tests (2 model;
>   5 component: success+onFilled, empty, upstream-error+re-enable, rate-limited,
>   invalid-code) — **115/115 web tests green**, typecheck + build green.
> - `US-004-BE-001` — 🟡 **scaffolded** in `apps/api/.../Endpoints/FlightsEndpoints.cs`:
>   `GET /api/v1/flights/lookup?code=` proxy contract with server-side code validation
>   and a `found:false` empty-result shape. The AviationStack client (key from secret
>   store), fixed-upstream SSRF-safe fetch, DTO mapping, short-TTL cache, per-user/IP
>   rate limiting, App Check, and audit are the remaining BE work. *Not compiled
>   (no .NET SDK).*
> - `US-004-SEC-001` — ✅ key absent from client (verified: no key in any FE file/bundle;
>   service hits the proxy only); server-side secret mgmt, SSRF prevention, throttling,
>   and App Check pending BE.
> - Remaining to DONE: BE proxy + cache + throttle + audit, wizard prefill of
>   destination/start when empty (AC4), live provisioning of the AviationStack key.

## 1. Story ID & Title
**US-004 — Flight Details Auto-Fill**: enter a flight number → fetch airline, departure/arrival airports & scheduled times → prefill fields.

## 2. User Story
**As a** user creating/editing a trip, **I want** to type a flight number and auto-fill airline, airports and times, **so that** I don't enter flight details manually.

## 3. Business Goal
Reduce data-entry friction (G4); improve itinerary accuracy. Re-platforms the prototype's client-side AviationStack call into a **secure backend proxy** (fixes exposed key + http/https mixed-content).

## 4. Scope
**In:** Flight-number lookup; backend proxy to AviationStack; map response → airline, dep/arr airport (name+IATA), scheduled dep/arr times; prefill destination city + trip start date when empty; loading/empty/error states; caching + rate limit.
**Out:** Live status tracking/gate changes, multi-leg auto-build, seat/booking data, non-AviationStack providers (future).

## 5. Functional Requirements
- **FR-004-001** Input accepts IATA flight code (e.g., `SV1020`), normalized uppercase.
- **FR-004-002** "Fetch" calls backend `GET /api/v1/flights/lookup?code=`.
- **FR-004-003** On success, fill: airline name, departure airport (name+IATA), arrival airport (name+IATA), scheduled dep/arr (localized).
- **FR-004-004** If trip destination/start empty, prefill from arrival city / departure date.
- **FR-004-005** On no-data → informative empty message; manual entry remains available.
- **FR-004-006** On error/timeout → graceful message; manual entry available.
- **FR-004-007** Loading indicator + disabled button during fetch.

## 6. Business Rules
- **BR-004-001** API key is **server-side only**; never sent to client. *(Fixes prototype.)*
- **BR-004-002** Lookups are rate-limited per user & IP (anti-abuse / quota protection).
- **BR-004-003** Free-tier data may be empty for future/inactive flights → treated as valid "no data", not an error.
- **BR-004-004** Backend caches identical lookups (short TTL) to protect quota.
- **BR-004-005** Auto-fill never overwrites user-entered non-empty fields without confirmation.

## 7. Operation Rules
- **Create/Update:** read-only external fetch; writes only into the in-progress trip form (persisted by US-003/US-006).
- **Delete/Activate/Import-Export:** N/A (import-into-form only).

## 8. Validation Rules
- **VR-004-001** Code matches `^[A-Z0-9]{2}\d{1,4}$` (server-validated). **VR-004-002** Reject empty. **VR-004-003** Sanitize/encode before upstream call (SSRF-safe: fixed upstream host, no user-controlled URL).

## 9. Permissions & Access Control
| Action | GUEST | USER | TRIP_MEMBER/OWNER |
|---|---|---|---|
| flight.lookup | — | ✔(rate-limited) | ✔ |
Authenticated only; enforced server-side + App Check.

## 10. Audit Requirements
`FLIGHT_LOOKUP(code, result=hit|miss|error)` minimal; no PII. Track quota usage metric (not per-user sensitive data).

## 11. Acceptance Criteria
- **AC1** Given a valid active flight code, When I fetch, Then airline/airports/times populate correctly (localized times).
- **AC2** Given an empty result, When fetched, Then a localized "no data, enter manually" message shows; fields stay editable.
- **AC3** Given upstream error/timeout, When fetched, Then a graceful error shows; no app crash; button re-enables.
- **AC4** Given empty destination/start, When lookup succeeds, Then they prefill; non-empty fields are not overwritten silently.
- **AC5** Given rapid repeated lookups, When exceeding limit, Then throttled with a message.
- **AC6** The API key is never present in any client bundle/network call to the client (verified).
- **AC7** Works AR/EN + all breakpoints + accessible (aria-busy, announced result).

## 12. Dependencies
Depends on: US-003 (wizard host) / US-006 (itinerary edit). Backend: US-002-architecture proxy pattern.

## 13. Product Subtasks
- **US-004-UX-001** Flight-lookup panel UX (input+fetch, spinner, result fields, empty/error messages, aria-busy); RTL (LTR code field); responsive; a11y; UX AC=AC1–AC7; DoD.
- **US-004-FE-001** Lookup component + hook: call `/flights/lookup`; map DTO → form; prefill logic (non-destructive); loading/empty/error; i18n; DoD tests. **Removes** any client-side key.
- **US-004-BE-001** Proxy endpoint `GET /api/v1/flights/lookup`: server-side AviationStack client (key from secret store), fixed upstream host, response mapping DTO, cache (TTL), rate limit, unified errors; unit tests (hit/miss/error/throttle/validation); DoD.
- **US-004-SEC-001** Secret management (key in Key Vault/env), SSRF prevention (no user URL), rate limiting, App Check, input validation, OWASP A10(SSRF)/A05(misconfig)/A09; verify no key in client; DoD.
- **US-004-QA-001** Functional AC1–AC7; BR-004-*; validation (code regex, injection); permission (guest blocked, throttle); security (key absent in client, SSRF attempt blocked); RTL/responsive; regression (wizard prefill non-destructive); evidence (network capture showing no key); DoD.

## 14. Definition of Ready
US-003 host ready; AviationStack account/key provisioned server-side; proxy contract + DTO agreed; rate-limit thresholds set. ✅

## 15. Definition of Done
Global DoD + AC1–AC7; backend proxy live with secret-managed key; no client key (verified); cache+rate-limit working; graceful states; audit metric; AR/EN + breakpoints + a11y; tests green.
