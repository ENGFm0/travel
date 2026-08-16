# US-005 — Trips Overview & Lifecycle (My Trips)
Status: DRAFT · Size: M · Tenant-scoped: Yes (lists tenants the user belongs to)

## 1. Story ID & Title
**US-005 — Trips Overview & Lifecycle**: My Trips list with Upcoming/Past filter, domestic/international badges, planning-progress, open/archive/restore/delete.

## 2. User Story
**As a** user, **I want** to see my upcoming and past trips with type badges and planning progress and manage their lifecycle, **so that** I can find and act on the right trip quickly.

## 3. Business Goal
Central hub to access & manage trips (G1); surfaces status/progress to drive planning completion.

## 4. Scope
**In:** List trips the user owns/joined; filter Upcoming vs Past; type badge (داخلية/خارجية); countdown + planning-progress %; cards link to trip dashboard; open, archive, restore, delete (owner); "create trip" entry (US-003). Also hosts the **Friends tab** shell (content = US-010).
**Out:** Trip content editing (US-006/007/008/009/013), friend management logic (US-010).

## 5. Functional Requirements
- **FR-005-001** List trips where user is OWNER or MEMBER, newest/soonest first.
- **FR-005-002** Filter tabs: Upcoming (dateFrom ≥ today or ongoing) / Past (ended).
- **FR-005-003** Card shows title, destination(s), date range, type badge, countdown, planning-progress %.
- **FR-005-004** Card actions: open dashboard; quick links (schedule/tasks).
- **FR-005-005** Owner can archive/restore/delete a trip.
- **FR-005-006** Past cards expose album/report links (US-013).
- **FR-005-007** Empty states for no upcoming / no past / no trips at all.
- **FR-005-008** "Create new trip" card/button → US-003.
- **FR-005-009** Sub-tabs [My Trips | Friends & Group]; Friends content from US-010; deep-link `#friends`.

## 6. Business Rules
- **BR-005-001** Planning-progress % = weighted completion of (itinerary set, members joined, tasks done, kitty collected). Formula documented; recomputed server-side.
- **BR-005-002** Upcoming/Past derived from trip dates (+ ongoing = upcoming). Timezone = trip's or user's (Assumption: user locale tz).
- **BR-005-003** Delete allowed only for OWNER and only soft-delete; members lose access immediately.
- **BR-005-004** Archived trips hidden from default lists; visible under an "archived" view; restorable by owner.
- **BR-005-005** A member (non-owner) can leave (US-009) which removes it from their list.

## 7. Operation Rules
- **Create:** via US-003.
- **Update:** archive/restore = status change (`PATCH /trips/{id}/status`).
- **Delete & Blockers:** owner soft-delete; **Blocker:** none beyond ownership (settlement warning surfaced from US-007 if unsettled balances — soft warning).
- **Activate/Deactivate:** archive=deactivate, restore=activate.
- **Import/Export:** export trip report (US-013).

## 8. Validation Rules
- **VR-005-001** Filter∈{upcoming,past}. **VR-005-002** status transitions valid (ACTIVE↔ARCHIVED, →DELETED). **VR-005-003** Only owner may change status/delete (server).

## 9. Permissions & Access Control
| Action | USER(member) | TRIP_OWNER | ADMIN |
|---|---|---|---|
| list own trips | ✔ⓜ | ✔ | support(audit) |
| open trip | ✔ | ✔ | audit |
| archive/restore/delete | — | ✔ⓞ | ✔(w/ audit) |
Server filters by membership; no cross-user listing.

## 10. Audit Requirements
`TRIP_ARCHIVE/RESTORE/DELETE(tripId, old→new status)`, `TRIP_OPEN` (optional analytics not audit). Actor, tenant, ts, result.

## 11. Acceptance Criteria
- **AC1** Given I have 2 upcoming & 1 past trip, When I open My Trips, Then Upcoming shows 2 with correct badges/progress; switching to Past shows 1.
- **AC2** Given I am owner, When I archive a trip, Then it leaves the default list and appears under archived; restore returns it.
- **AC3** Given I am a non-owner member, When viewing a trip card, Then archive/delete controls are hidden and blocked server-side if forced.
- **AC4** Given no trips, When I open My Trips, Then a friendly empty state with "create trip" CTA shows.
- **AC5** Given a domestic trip, Then a "داخلية" badge (green) shows; international → "خارجية" (blue).
- **AC6** Deep-link `#friends` opens the Friends sub-tab.
- **AC7** AR/EN + 4 breakpoints + accessible cards (keyboard-focusable, labeled).

## 12. Dependencies
Depends on: US-001, US-003, US-014. Hosts: US-010 (friends tab). Reads progress from US-006/007/008/009. Links to US-013.

## 13. Product Subtasks
- **US-005-UX-001** My Trips UX: sub-tabs + filter tabs; trip card (badge, countdown, progress, actions); past card (album/report); empty/loading/error/success; responsive grid (1→3 cols); RTL; a11y; UX AC=AC1–AC7; DoD.
- **US-005-FE-001** Trips list module: `GET /trips?scope=upcoming|past`; card components; archive/restore/delete mutations w/ optimistic + confirm modal; friends-tab mount (US-010); deep-link handling; DoD tests.
- **US-005-BE-001** `GET /api/v1/trips` (membership-filtered, upcoming/past, pagination), `PATCH /api/v1/trips/{id}/status`, `DELETE /api/v1/trips/{id}` (soft); progress computation service (BR-005-001); indexes; audit; unit tests (filter, ownership, soft-delete, progress); DoD.
- **US-005-SEC-001** AuthZ (membership list, owner-only lifecycle), tenant isolation (no cross-user leakage), input validation, OWASP A01, audit verification; DoD.
- **US-005-QA-001** Functional AC1–AC7; BR-005-*; validation; permission (member cannot archive/delete; cannot list others'); RTL/responsive; regression (create→appears; delete→removed for members); evidence; DoD.

## 14. Definition of Ready
US-003 ready (trips exist); progress formula agreed with US-006/007/008/009; status model locked; friends-tab contract with US-010. ✅

## 15. Definition of Done
Global DoD + AC1–AC7; membership-filtered lists; owner-only lifecycle enforced server-side; progress accurate; audit; AR/EN + breakpoints + a11y; tests green.
