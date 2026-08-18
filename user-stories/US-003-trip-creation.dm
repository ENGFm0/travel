# US-003 — Trip Creation Wizard (single & multi-city)
Status: IN-PROGRESS · Size: L · Tenant-scoped: **Creates the tenant (Trip)**

> **Implementation status**
> - `US-003-FE-001` (web) — ✅ **DONE & VERIFIED** in `apps/web/src/features/trips/`:
>   swappable `TripsService` (in-memory mock for dev/tests, **API** service behind
>   `VITE_API_BASE_URL` via shared `createApiClient`), trips store + `initTrips()`,
>   3-step `CreateTripWizard` (Step 1 basics: title, type toggle, date range with
>   end≥start check · Step 2 destinations: single or multi-city with add/remove +
>   per-city dates · Step 3 invitees chips), a11y dialog + stepper + success screen,
>   shared **Zod** `createTripSchema` validation, `?new=1` `TripsController` mounted
>   in `Layout` with **auth-gating** (guests/anonymous → auth modal). 5 trip tests
>   (auth gating ×2, full create, step-1 validation, multi-city dates) — **30/30
>   web tests green**, typecheck + build green.
> - `US-003-BE-001` — 🟡 **scaffolded** in `apps/api/.../Endpoints/TripsEndpoints.cs`
>   (`POST /api/v1/trips`, request/response contract). Auth policy, payload
>   validation, Firestore `trips/{id}` + owner-membership write, and creator →
>   `TRIP_OWNER` assignment are the remaining BE work. *Not compiled in sandbox
>   (no .NET SDK).*
> - `US-003-SEC-001` — partial: server assigns `Id/OwnerUid/Status` authoritatively
>   (client values ignored), shared client validation is UX-only. Server-side
>   authorization + Firestore rules pending BE.
> - Remaining to DONE: BE persistence + ownership + invitations, wire the created
>   trip into My Trips (US-005) and the trip dashboard (US-006), e2e against live
>   Firebase.

## 1. Story ID & Title
**US-003 — Trip Creation Wizard**: 3-step modal → Step 1 basics (title, type domestic/international, date range) · Step 2 destinations (single or multi-city with per-city dates) · Step 3 invite friends (optional).

## 2. User Story
**As a** user, **I want** to create a trip in a guided 3-step flow with single or multi-city destinations and optional invitations, **so that** I have a structured trip to plan and coordinate with my group.

## 3. Business Goal
Core creation flow that instantiates the tenant (G1); makes multi-city planning effortless and seeds the group (G3).

## 4. Scope
**In:** 3-step wizard; trip type (DOMESTIC/INTERNATIONAL) with badge semantics; date range; single-city or multi-city route with per-city dates; add/remove city; optional friend invites; success screen with deep-links (open trip / my trips); make creator `TRIP_OWNER`; optional flight auto-fill hook (US-004).
**Out:** Full itinerary day/activity editing (US-006); expense setup (US-007); actual invitation delivery/notifications (US-015 delivers; US-009 manages membership) — this story emits invites, US-009/US-015 fulfill.

## 5. Functional Requirements
- **FR-003-001** Step-1 requires title + type + start date; end date optional.
- **FR-003-002** Type is DOMESTIC or INTERNATIONAL (drives badge in US-005/UI).
- **FR-003-003** Step-2: single-city (default) or multi-city toggle; multi-city reveals per-city date fields + "add city".
- **FR-003-004** At least one destination required; cities keep order (route).
- **FR-003-005** Step-3: select existing friends (from US-010) and/or add invitee by name/phone/username; all optional.
- **FR-003-006** On submit: create trip (status ACTIVE), creator = `TRIP_OWNER` member, cities persisted in order, invites queued.
- **FR-003-007** Success state shows summary (title, type, #destinations, #invited) + CTAs (open trip, my trips).
- **FR-003-008** Wizard supports back/next with per-step validation and a visible stepper.
- **FR-003-009** Optional: prefill destination + start date from flight lookup (US-004) when used.
- **FR-003-010** Entry points: header/bottom-nav "+", `planner.html?new=1` equivalent route, My Trips "create" card.

## 6. Business Rules
- **BR-003-001** Creator automatically becomes `TRIP_OWNER`. *Trigger:* create success.
- **BR-003-002** Multi-city per-city date ranges must fall within the trip's overall range and not overlap illogically (city N end ≤ city N+1 start unless same-day transfer allowed). Error if violated.
- **BR-003-003** End date (if provided) ≥ start date.
- **BR-003-004** A DOMESTIC trip's destinations should share the home country (soft warning; not blocking) — **Assumption** flagged.
- **BR-003-005** Invites in step-3 create pending memberships/invitations, not confirmed members (confirmation in US-009).
- **BR-003-006** Draft not persisted server-side until final submit (client holds wizard state); closing mid-wizard discards (confirm on close if data entered).

## 7. Operation Rules
- **Create:** `POST /trips` (title,type,dateFrom,dateTo?,cities[]) → creates `trips/{id}` + owner member + `cities/*`; queues invites. Transactional (all-or-nothing).
- **Update:** editing an existing trip's core = US-005/US-006 (not this wizard).
- **Delete & Blockers:** N/A here (delete in US-005).
- **Activate/Deactivate:** created ACTIVE; archive/restore in US-005.
- **Import/Export:** flight import (US-004) may seed fields; no bulk import.

## 8. Validation Rules
- **VR-003-001** Title 2–80 chars. **VR-003-002** Type∈{DOMESTIC,INTERNATIONAL}. **VR-003-003** Dates ISO; end≥start (BR-003-003). **VR-003-004** ≥1 city; city name 2–60. **VR-003-005** Per-city dates within range & ordered (BR-003-002). **VR-003-006** Invitee: valid friend-id OR name+ (phone E.164 | username). Server-authoritative.

## 9. Permissions & Access Control
| Action | GUEST | USER | TRIP_OWNER | ADMIN |
|---|---|---|---|---|
| open wizard | — | ✔ | ✔ | ✔ |
| create trip | — | ✔ (→becomes owner) | ✔ | ✔ |
| invite in step-3 | — | ✔ (creator) | ✔ⓞ | — |
Guests blocked (BR-001-002). Server enforces authenticated user; creator→owner.

## 10. Audit Requirements
`TRIP_CREATE(tripId, type, #cities)`, `TRIP_INVITE_QUEUED(tripId, invitee-ref)`, `TRIP_CREATE_VALIDATION_FAIL`. Fields: actor, tenant=tripId, entity=trip, new=snapshot, ts, ip, result.

## 11. Acceptance Criteria
- **AC1** Given step-1 with empty title, When Next, Then blocked with localized field error; stepper stays on 1.
- **AC2** Given multi-city toggle on, When enabled, Then per-city date fields + "add city" appear and additional city rows can be added/removed.
- **AC3** Given valid basics + ≥1 city, When I finish step-3 (even with no invites), Then a trip is created, I am its owner, and success summary shows correct counts.
- **AC4** Given per-city dates outside the trip range, When Next/submit, Then blocked with a clear message (BR-003-002).
- **AC5** Given I selected 2 friends to invite, When created, Then 2 pending invitations are queued (visible later in US-009).
- **AC6** Given I used flight auto-fill (US-004), When it returns data, Then destination + start date prefill if empty.
- **AC7** Given I close the wizard with entered data, When closing, Then I'm asked to confirm discarding.
- **AC8** All steps work AR/EN, Desktop→Mobile (bottom-sheet on mobile), keyboard + screen-reader.

## 12. Dependencies
Depends on: US-001, US-014; integrates US-004 (flight), US-009 (invites/membership), US-010 (friend list). Enables: US-005, US-006, US-007, US-008, US-013.

## 13. Product Subtasks
- **US-003-UX-001** Wizard UX: 3 steps + stepper; type selector; single/multi-city dynamic rows; friend picker + manual invite; states Empty/Loading(create)/Error(validation+server)/Success(summary); modal→bottom-sheet on mobile; discard-confirm modal; system messages; RTL/LTR; a11y (step focus, error announce, 44px); UX AC=AC1–AC8; handoff; DoD.
- **US-003-FE-001** Wizard module: `TripWizard`, `StepBasics`, `StepDestinations`, `StepInvite`, `Stepper`, dynamic `CityRow`; RHF+Zod (shared); `POST /trips` mutation; friend list query (US-010); flight hook (US-004); success routing; discard guard; DoD tests.
- **US-003-FE-002** Entry points & deep-link (`?new=1`/route) + prefill wiring from flight lookup.
- **US-003-BE-001** `POST /api/v1/trips` (create trip + owner member + cities, transactional), `GET /api/v1/trips/{id}` (read); Application service holds rules BR-003-*; validation; audit; indexes; unit tests (single/multi, date rules, ownership, invites queued); DoD.
- **US-003-BE-002** Invitation queueing service (creates pending memberships; hands to US-009/US-015).
- **US-003-SEC-001** AuthZ (authenticated create; creator→owner), input validation server-side, tenant seeding (isolation from creation), OWASP A01/A04 (business-logic abuse), audit verification, no sensitive data; DoD.
- **US-003-QA-001** Functional AC1–AC8; BR-003-*; validation VR-003-*; permission (guest blocked, only creator invites); security (mass-assignment, injection in city/title); audit; RTL; responsive (sheet<sm); regression (nav, my-trips list refresh); evidence; DoD.

## 14. Definition of Ready
US-001/US-014 ready; trip data model (cities, type) agreed with US-006; invite contract agreed with US-009; flight hook contract with US-004; validation rules locked. ✅

## 15. Definition of Done
Global DoD + AC1–AC8 pass; transactional create verified; owner membership set; invites queued; multi-city date rules enforced server-side; audit emitted; AR/EN + 4 breakpoints + a11y; tests green.
