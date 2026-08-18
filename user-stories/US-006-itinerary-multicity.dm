# US-006 — Itinerary & Multi-City Timeline
Status: IN-PROGRESS · Size: M · Tenant-scoped: Yes

> **Implementation status**
> - `US-006-FE-001` (web) — ✅ **DONE & VERIFIED**: `TripDetailPage` is now the
>   **dashboard shell** — trip header (badge, destinations, dates, members count) +
>   accessible **tablist** (Itinerary, Expenses, Tasks & Packing, Members, Memories)
>   with `aria-selected`, roving `tabIndex`, arrow-key nav, and `#hash` deep-links.
>   New `apps/web/src/features/itinerary/`: swappable `ItineraryService` (mock ↔ API)
>   + reactive store + `ItineraryTab` — horizontal **multi-city timeline** (seeded
>   from the trip's cities, RTL/scrollable) that drives the active city's itinerary:
>   flight + accommodation inline fields, weather placeholder (US-004), day list with
>   activities, add/delete for cities/days/activities, city reorder (route order),
>   cascade city delete (confirm), and empty states. **Role-gated**: VIEWER is
>   read-only (edit controls hidden; server enforces per BR-006-003). Members tab
>   hosts the US-009 panel; Expenses/Tasks/Memories show story placeholders. 5 tests
>   (timeline switch, `#members` deep-link, add day+activity, viewer read-only, city
>   cascade delete) — **48/48 web tests green**, typecheck + build green.
> - `US-006-BE-001` — 🟡 **scaffolded** in `apps/api/.../Endpoints/ItineraryEndpoints.cs`:
>   `GET /itinerary`, cities/days/activities `POST`/`PATCH`/`DELETE` + `cities/{id}/move`
>   contracts. Validation (VR-006-*), transactional reorder & cascade delete, order
>   assignment, audit, indexes, and Firestore realtime rules are the remaining BE
>   work. *Not compiled (no .NET SDK).*
> - `US-006-SEC-001` — partial: viewer read-only enforced in UX, all routes
>   tenant-scoped to `tripId`; server-side role enforcement + realtime rules pending BE.
> - Remaining to DONE: BE CRUD + reorder/cascade + audit, Firestore realtime
>   subscription (multi-user live updates), add-from-Explore hook (US-012), drag-drop
>   reorder, flight fields sourced from US-004 lookup.

## 1. Story ID & Title
**US-006 — Itinerary & Multi-City Timeline**: trip dashboard shell (tabbed) + interactive horizontal city timeline + per-city itinerary (flight, accommodation, weather, day-by-day activities).

## 2. User Story
**As a** trip member, **I want** to switch between the trip's cities on a timeline and see/edit each city's daily plan (flights, hotel, activities), **so that** the whole group follows one clear schedule.

## 3. Business Goal
Turns a trip into an actionable day-by-day plan (G1); multi-city clarity without clutter (G3).

## 4. Scope
**In:** Trip dashboard shell with 5 sub-tabs (Itinerary, Expenses, Tasks&Packing, Members, Memories — this story owns the shell + Itinerary tab); horizontal multi-city timeline (switch active city → updates itinerary); per-city flight leg, accommodation, weather, days with activities; add/edit/reorder cities, days, activities; add-from-Explore hook (US-012).
**Out:** Expenses/Tasks/Members/Memories tab content (US-007/008/009/013); flight lookup fetch (US-004); place discovery (US-012).

## 5. Functional Requirements
- **FR-006-001** Dashboard shell renders trip header (title, type badge, dates, countdown, members count) + timeline + tab nav; tabs deep-linkable (`#itinerary`…).
- **FR-006-002** Timeline shows cities in route order (flag, name, dates); selecting a city sets it active.
- **FR-006-003** Itinerary tab (active city): flight leg (airline/route/times), accommodation, weather, day list with activities.
- **FR-006-004** Members can add/edit/delete cities, days, activities; reorder cities (route) and days.
- **FR-006-005** Add activity manually or from Explore (US-012) "add to trip".
- **FR-006-006** Realtime: changes by one member reflect for others (Firestore snapshot).
- **FR-006-007** Empty states: no cities yet / no days yet / no activities.

## 6. Business Rules
- **BR-006-001** City order defines the route; reordering updates `order` and re-derives timeline.
- **BR-006-002** Day belongs to exactly one city; day dates within that city's date range (BR-003-002 consistency).
- **BR-006-003** Only trip members (OWNER/MEMBER) may edit; VIEWER read-only.
- **BR-006-004** Deleting a city cascades its days/activities (confirm) and warns if linked expenses/memories exist (soft link note).
- **BR-006-005** Activity time (if set) should fall within its day (soft validation).

## 7. Operation Rules
- **Create:** add city/day/activity → `POST /trips/{id}/cities|days|activities`.
- **Update:** edit/reorder → `PATCH` (+ order arrays).
- **Delete & Blockers:** delete city/day/activity (confirm); city delete cascades; blocker: none hard, warnings only.
- **Activate/Deactivate:** N/A.
- **Import/Export:** import activity from Explore; export via report (US-013).

## 8. Validation Rules
- **VR-006-001** City name 2–60; dates within trip range & ordered. **VR-006-002** Day title ≤80; date within city. **VR-006-003** Activity title 1–120; optional time HH:mm. **VR-006-004** Order integers unique per parent. Server-authoritative; realtime writes also guarded by Firestore Rules.

## 9. Permissions & Access Control
| Action | VIEWER | TRIP_MEMBER | TRIP_OWNER | ADMIN |
|---|---|---|---|---|
| read itinerary | ✔ | ✔ | ✔ | support(audit) |
| add/edit/reorder/delete | — | ✔ | ✔ | — |
Membership+role resolved server-side per `tripId`.

## 10. Audit Requirements
`ITINERARY_CITY_ADD/UPDATE/DELETE`, `DAY_*`, `ACTIVITY_*` with tripId, entity, old→new (for updates), actor, ts. High-volume edits may be summarized.

## 11. Acceptance Criteria
- **AC1** Given a 3-city trip, When I tap a city on the timeline, Then the itinerary tab shows that city's flight/hotel/weather/days.
- **AC2** Given I add an activity to Day 1, When saved, Then it appears for me and (realtime) for other members.
- **AC3** Given I reorder cities, When saved, Then the timeline route order updates and persists.
- **AC4** Given I am a VIEWER, When I open itinerary, Then edit controls are hidden and blocked server-side.
- **AC5** Given a city has no days, When I open it, Then an empty state with "add day" shows.
- **AC6** Given I delete a city, When confirmed, Then its days/activities are removed and a warning noted if links exist.
- **AC7** AR/EN (timeline scrolls RTL) + 4 breakpoints (timeline horizontally scrollable on mobile) + accessible tabs (arrow-key nav, `aria-selected`).

## 12. Dependencies
Depends on: US-003 (trip+cities), US-009 (membership/roles), US-014. Integrates US-012 (add-to-trip), US-004 (flight fields source). Shell hosts US-007/008/013 tabs.

## 13. Product Subtasks
- **US-006-UX-001** Dashboard shell + timeline + itinerary UX: tab nav (smooth transitions), horizontal city timeline (active state, scroll), flight/hotel/weather cards, day/activity list + editors; states; RTL (horizontal scroll dir); responsive (timeline scroll, cards stack); a11y (tablist, focus); UX AC=AC1–AC7; DoD.
- **US-006-FE-001** Itinerary module: shell + tab router, timeline component, itinerary CRUD components; Firestore realtime subscription (read) + API writes; optimistic; reorder (dnd); i18n; DoD tests.
- **US-006-BE-001** Endpoints for cities/days/activities CRUD + reorder under `/trips/{id}`; rules BR-006-*; validation; transactions for reorder & cascade delete; audit; indexes (`cities by order`, `days by cityId+order`); unit tests; DoD.
- **US-006-SEC-001** AuthZ (member write, viewer read), tenant isolation (all under tripId), Firestore Rules for realtime read, input validation, OWASP A01/A04, audit; DoD.
- **US-006-QA-001** Functional AC1–AC7; BR-006-*; validation; permission (viewer read-only enforced); realtime multi-user; security (cross-trip access blocked); RTL/responsive; regression (create-trip cities appear here); evidence; DoD.

## 14. Definition of Ready
US-003 cities model ready; membership/roles (US-009) contract; realtime read pattern (Firestore Rules) agreed; add-to-trip contract (US-012). ✅

## 15. Definition of Done
Global DoD + AC1–AC7; multi-city timeline drives itinerary; realtime updates; role-gated edits server-side; cascade delete + warnings; audit; AR/EN + breakpoints + a11y; tests green.
