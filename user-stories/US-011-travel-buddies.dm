# US-011 — Travel Buddies Discovery
Status: DRAFT · Size: L · Tenant-scoped: Partly (a buddy request is a mini-tenant)

## 1. Story ID & Title
**US-011 — Travel Buddies Discovery**: find/join full-trip groups or single activities/meetups; filter by city/date/category/budget; create a buddy request.

## 2. User Story
**As a** user, **I want** to discover and join travel companions for a full trip or a specific activity, or post my own request, **so that** I can travel with compatible people.

## 3. Business Goal
Grow community & liquidity (G6); connect travelers beyond existing friends.

## 4. Scope
**In:** Two modes — Full Trips (share a whole trip & costs) and Activities/Meetups (hiking, restaurant, event); card grid; filters (city, date, category type e.g., youth/women/families, budget); create buddy request; join/leave; request detail; participant list; report/flag (moderation → US-016).
**Out:** In-app chat (Assumption/future), payments, identity KYC (future), converting a buddy request into a real Trip tenant (link/handoff noted, not auto).

## 5. Functional Requirements
- **FR-011-001** Browse buddy requests as cards (title, city, dates, category, budget, spots).
- **FR-011-002** Toggle Full-Trips vs Activities/Meetups.
- **FR-011-003** Filter by city, date range, category, budget; combine filters.
- **FR-011-004** Create a request (kind, city, dates, category, budget, capacity, description).
- **FR-011-005** Join a request (if spots available) / leave; owner can close/fill.
- **FR-011-006** View request detail + participants; contact/next-step (delegated).
- **FR-011-007** Report/flag inappropriate request (→ moderation US-016).
- **FR-011-008** Empty/loading/error/success states; pagination/infinite scroll.

## 6. Business Rules
- **BR-011-001** Only the creator (owner of the request) may edit/close/delete it.
- **BR-011-002** Join blocked when capacity reached (status FULL); leaving frees a spot.
- **BR-011-003** A request creator is a participant by default.
- **BR-011-004** Requests are public to authenticated users (guests may browse limited previews — Assumption); joining requires auth.
- **BR-011-005** Flagged requests enter moderation; repeated violations can suspend the creator (US-016).
- **BR-011-006** Budget & category are filter facets; must come from controlled vocab.

## 7. Operation Rules
- **Create:** `POST /buddies`. **Update:** edit/close `PATCH` (owner). **Delete & Blockers:** delete (owner); blocker: none hard; closing preferred over delete if participants joined. **Activate/Deactivate:** open↔closed/full. **Import/Export:** N/A.

## 8. Validation Rules
- **VR-011-001** kind∈{FULL_TRIP,MEETUP}; city required; dateFrom≤dateTo. **VR-011-002** category∈enum; budget∈range/enum; capacity≥1. **VR-011-003** description ≤1000, sanitized (XSS). Server-authoritative.

## 9. Permissions & Access Control
| Action | GUEST | USER | OWNER(request) | ADMIN |
|---|---|---|---|---|
| browse/filter | ✔(preview) | ✔ | ✔ | ✔ |
| create request | — | ✔ | ✔ | — |
| join/leave | — | ✔ | ✔ | — |
| edit/close/delete | — | — | ✔ⓞ | ✔(moderation,audit) |
| flag | — | ✔ | ✔ | ✔ |
Owner = request creator; server-enforced.

## 10. Audit Requirements
`BUDDY_CREATE/UPDATE/CLOSE/DELETE`, `BUDDY_JOIN/LEAVE`, `BUDDY_FLAG(reason)`, `BUDDY_MODERATE(action)`. Actor, requestId(tenant), ts, result.

## 11. Acceptance Criteria
- **AC1** Given filters city=Riyadh & category=families, When applied, Then only matching requests show.
- **AC2** Given a request with 1 spot left, When two users join concurrently, Then only one succeeds; the other sees FULL (no over-join).
- **AC3** Given I created a request, When I close it, Then it no longer accepts joins and shows closed.
- **AC4** Given I am not the creator, When I try to edit it, Then it's blocked server-side.
- **AC5** Given I flag a request, When submitted, Then it enters moderation (US-016) and I get confirmation.
- **AC6** Given many requests, When scrolling, Then results paginate/infinite-scroll smoothly.
- **AC7** AR/EN + 4 breakpoints + accessible cards/filters.

## 12. Dependencies
Depends on: US-001, US-010 (social context), US-014. Feeds: US-015 (join notifications), US-016 (moderation). Optional handoff to US-003 (start a real trip).

## 13. Product Subtasks
- **US-011-UX-001** Buddies UX: mode toggle, filter bar (city/date/category/budget), card grid, create-request form, detail + participants, join/leave, flag; states + pagination; RTL; responsive (filters → bottom-sheet on mobile); a11y; UX AC=AC1–AC7; DoD.
- **US-011-FE-001** Buddies module: list + filters (server-driven query), create form (RHF+Zod), join/leave mutations w/ concurrency handling, detail, flag; infinite scroll; i18n; DoD tests.
- **US-011-BE-001** Endpoints `/buddies` (GET filtered+paged, POST), `/buddies/{id}` (GET/PATCH/DELETE), `/buddies/{id}/join|leave`, `/buddies/{id}/flag`; capacity concurrency (transaction/atomic) BR-011-002; owner checks; composite indexes (city+date+category+budget); audit; validation; unit tests (filters, capacity race, owner-only); DoD.
- **US-011-SEC-001** AuthZ (owner-only manage, auth join), input validation & XSS sanitize (description), rate limit create/flag (anti-abuse), tenant isolation (request scope), OWASP A01/A03/A04, moderation hooks, audit; DoD.
- **US-011-QA-001** Functional AC1–AC7; BR-011-*; validation; permission (non-owner blocked, guest can't join); security (capacity race, XSS in description, flag spam); RTL/responsive; regression; evidence; DoD.

## 14. Definition of Ready
US-001/US-010 ready; controlled vocab (category/budget) defined; capacity concurrency strategy agreed; moderation contract (US-016); indexes planned. ✅

## 15. Definition of Done
Global DoD + AC1–AC7; filters + pagination; no over-join (atomic capacity); owner-only management; sanitized inputs; moderation + audit; AR/EN + breakpoints + a11y; tests green.
