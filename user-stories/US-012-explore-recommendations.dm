# US-012 — Explore & Recommendations
Status: DRAFT · Size: M · Tenant-scoped: No (curated content) / writes rating self-scoped

## 1. Story ID & Title
**US-012 — Explore & Recommendations**: destination/place discovery (restaurants & cafés, landmarks, activities & events) with ratings/photos, smart suggestions, and add-to-trip.

## 2. User Story
**As a** user, **I want** to explore recommended places by category with ratings and add them to my trip, **so that** I can plan what to do at each destination.

## 3. Business Goal
Inspire & assist planning (G4); increase itinerary richness and engagement.

## 4. Scope
**In:** Browse/search places; category filters (restaurants/cafés, landmarks, activities/events, shopping); place card (name, category, rating, photo, area); place detail (photos, rating, reviews); smart suggestions (by user location or trip type); "add to trip" (→ US-006 activity); user rating/experience on a place.
**Out:** Provider self-service listings (Not Applicable — future marketplace); real booking/reservations (future); full maps SDK embedding beyond place data (documented trade-off).

## 5. Functional Requirements
- **FR-012-001** Browse places in a grid; filter by category; search by text.
- **FR-012-002** Place card shows rating, category tag, photo, area; opens detail.
- **FR-012-003** Detail shows photos, rating, reviews/experiences.
- **FR-012-004** Smart suggestions section (by location/trip type).
- **FR-012-005** "Add to trip" adds the place as an activity to a chosen trip/city/day (US-006).
- **FR-012-006** User can rate/leave an experience on a place (auth).
- **FR-012-007** Empty/loading/error states; pagination.

## 6. Business Rules
- **BR-012-001** Places are curated/read-mostly; ratings aggregate user experiences.
- **BR-012-002** A user may rate a place once (update allowed); rating 1–5.
- **BR-012-003** "Add to trip" requires the user to be a member of the target trip (US-006 permission).
- **BR-012-004** External place data (Maps/Places) fetched via backend proxy (keys server-side) with caching.
- **BR-012-005** Reviews are moderated; abusive content flaggable (US-016).

## 7. Operation Rules
- **Create:** rating/experience `POST /places/{id}/reviews`. **Update:** own review `PATCH`. **Delete & Blockers:** own review delete; admin remove (moderation). **Activate/Deactivate:** N/A. **Import/Export:** add-to-trip = export to itinerary.

## 8. Validation Rules
- **VR-012-001** Rating∈1..5. **VR-012-002** Review text ≤1000, sanitized. **VR-012-003** Category∈enum. **VR-012-004** add-to-trip target valid & user is member. Server-authoritative.

## 9. Permissions & Access Control
| Action | GUEST | USER | TRIP_MEMBER | ADMIN |
|---|---|---|---|---|
| browse/search/detail | ✔ | ✔ | ✔ | ✔ |
| rate/review | — | ✔ⓜ | ✔ⓜ | — |
| add to trip | — | — | ✔(member of target) | — |
| moderate review | — | — | — | ✔(audit) |

## 10. Audit Requirements
`PLACE_REVIEW_ADD/UPDATE/DELETE`, `PLACE_ADD_TO_TRIP(tripId)`, `PLACE_FLAG`, `REVIEW_MODERATE`. Actor, entity, ts, result. Minimal.

## 11. Acceptance Criteria
- **AC1** Given category=restaurants, When filtered, Then only restaurant places show with ratings.
- **AC2** Given a place, When I open detail, Then photos/rating/reviews load (from cached proxy).
- **AC3** Given I add a place to my trip, When confirmed, Then it appears as an activity in the chosen city/day (US-006).
- **AC4** Given I rate a place 4★, When submitted, Then my rating persists and aggregate updates; re-rating updates not duplicates.
- **AC5** Given I am not a member of a trip, When I try add-to-trip, Then it's not offered/blocked.
- **AC6** No Maps/Places key is present in the client (verified).
- **AC7** AR/EN + 4 breakpoints + accessible.

## 12. Dependencies
Depends on: US-001, US-014; Maps/Places proxy (architecture). Feeds: US-006 (add-to-trip). Moderation: US-016.

## 13. Product Subtasks
- **US-012-UX-001** Explore UX: category chips, search, card grid, detail (gallery, reviews), suggestions, add-to-trip modal, rating widget; states + pagination; RTL; responsive; a11y (gallery keyboard, rating semantics); UX AC=AC1–AC7; DoD.
- **US-012-FE-001** Explore module: list/search/filter (server query), detail, rating form, add-to-trip (trip/city/day picker → US-006); i18n; DoD tests. **No client Maps key.**
- **US-012-BE-001** Endpoints `/places` (GET filtered), `/places/{id}` (GET), `/places/{id}/reviews` (POST/PATCH/DELETE), Maps/Places **proxy** w/ cache+key server-side; rating aggregation; validation; audit; indexes; unit tests; DoD.
- **US-012-SEC-001** AuthZ (auth to rate, member to add-to-trip), input sanitize (reviews XSS), secret mgmt (Places key), SSRF-safe proxy, rate limit, OWASP A01/A03/A10, moderation, audit; DoD.
- **US-012-QA-001** Functional AC1–AC7; BR-012-*; validation; permission (guest can't rate; non-member can't add-to-trip); security (no client key, XSS review); RTL/responsive; regression (added activity appears in US-006); evidence; DoD.

## 14. Definition of Ready
US-001 ready; place data source & proxy contract agreed; add-to-trip contract (US-006); category vocab; rating model. ✅

## 15. Definition of Done
Global DoD + AC1–AC7; proxied place data (no client key); one-rating-per-user; add-to-trip integrates US-006; sanitized reviews + moderation; audit; AR/EN + breakpoints + a11y; tests green.
