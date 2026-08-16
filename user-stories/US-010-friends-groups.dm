# US-010 — Friends & Groups (Social Graph)
Status: DRAFT · Size: M · Tenant-scoped: No (user-owned social graph)

## 1. Story ID & Title
**US-010 — Friends & Groups**: friend requests (send/accept/reject), friends list, search, invite friend to a trip; current-group view.

## 2. User Story
**As a** user, **I want** to manage my friends and see my current trip group, **so that** I can quickly invite trusted people to trips.

## 3. Business Goal
Build the trusted social graph that accelerates group formation (G3, G6) and feeds trip invitations (US-009) and buddies (US-011).

## 4. Scope
**In:** Friend requests inbox (accept/reject), friends list with search, send friend request (by username/phone), remove friend, "invite to trip" action, current-group summary (links to US-009). Hosted as the Friends tab in My Trips (US-005).
**Out:** Trip membership management (US-009); public buddy discovery (US-011); blocking/report (partial — see BR).

## 5. Functional Requirements
- **FR-010-001** View incoming friend requests with accept/reject.
- **FR-010-002** Search + list current friends (name, username).
- **FR-010-003** Send friend request by username/phone.
- **FR-010-004** Remove a friend.
- **FR-010-005** "Invite to trip" a friend → creates a trip invitation (US-009) for a selected trip.
- **FR-010-006** Current-group card (avatars, count) with link to manage members (US-009) + copy invite.
- **FR-010-007** Empty states (no requests, no friends).

## 6. Business Rules
- **BR-010-001** Friendship is mutual & unique per pair; accepting a request establishes it; duplicate requests are idempotent.
- **BR-010-002** Cannot friend yourself; cannot re-request a pending/accepted pair.
- **BR-010-003** Optional block prevents further requests (Assumption; minimal block flag).
- **BR-010-004** Removing a friend does not remove them from shared trips (trip membership is separate — US-009).
- **BR-010-005** "Invite to trip" requires the inviter to be OWNER of the selected trip (delegates to US-009 permission).

## 7. Operation Rules
- **Create:** send request `POST /friends/requests`. **Update:** accept/reject `PATCH`. **Delete & Blockers:** remove friend `DELETE`; no hard blockers. **Activate/Deactivate:** block/unblock (optional). **Import/Export:** N/A.

## 8. Validation Rules
- **VR-010-001** Target resolvable (username|phone) & not self. **VR-010-002** No duplicate pending/accepted. **VR-010-003** Trip for "invite to trip" must be owned by inviter. Server-authoritative.

## 9. Permissions & Access Control
| Action | GUEST | USER | ADMIN |
|---|---|---|---|
| view own friends/requests | — | ✔ⓜ | support(audit) |
| send/accept/reject/remove | — | ✔ⓜ | — |
| invite friend to trip | — | ✔(if trip owner) | — |
Self-scoped social graph; no reading others' friend lists.

## 10. Audit Requirements
`FRIEND_REQUEST_SEND/ACCEPT/REJECT`, `FRIEND_REMOVE`, `FRIEND_BLOCK?`, `FRIEND_INVITE_TO_TRIP(tripId)`. Actor, target, ts, result. Minimal PII.

## 11. Acceptance Criteria
- **AC1** Given a pending request, When I accept, Then we become friends and appear in each other's lists.
- **AC2** Given I send a request to an existing friend, When sent, Then it is idempotent/blocked with a clear message.
- **AC3** Given I search my friends, When typing, Then the list filters accordingly.
- **AC4** Given I am a trip owner, When I "invite to trip" a friend, Then a pending trip invitation is created (US-009).
- **AC5** Given I remove a friend, When done, Then they leave my list but remain in any shared trip.
- **AC6** Given no friends, When I open the tab, Then an empty state with "discover buddies" link (US-011) shows.
- **AC7** AR/EN + 4 breakpoints + accessible.

## 12. Dependencies
Depends on: US-001, US-014. Feeds: US-009 (trip invites), US-011 (buddies). Hosted in US-005 (Friends tab).

## 13. Product Subtasks
- **US-010-UX-001** Friends UX: requests list (accept/reject), friends list+search, send-request, invite-to-trip modal (select trip), current-group card; states; RTL; responsive; a11y; UX AC=AC1–AC7; DoD.
- **US-010-FE-001** Friends module: requests/list/search components; mutations (send/accept/reject/remove/invite); trip picker; realtime request badge; i18n; DoD tests.
- **US-010-BE-001** Endpoints `/friends/requests` (POST/PATCH), `/friends` (GET/DELETE), `/friends/invite-to-trip`; idempotency & uniqueness (BR-010-001/002); owner check for invite (BR-010-005 → US-009); audit; validation; unit tests; DoD.
- **US-010-SEC-001** AuthZ self-scoped, no cross-user friend-list reads, input validation, anti-spam on requests (rate limit), OWASP A01, audit; DoD.
- **US-010-QA-001** Functional AC1–AC7; BR-010-*; validation; permission (can't read others' graph; invite requires ownership); security (request spam throttled); RTL/responsive; regression (remove friend keeps trip membership); evidence; DoD.

## 14. Definition of Ready
US-001 ready; friendship model (pair uniqueness) locked; invite-to-trip contract with US-009; anti-spam thresholds. ✅

## 15. Definition of Done
Global DoD + AC1–AC7; mutual/unique friendships; self-scoped access; invite-to-trip integrates US-009; anti-spam; audit; AR/EN + breakpoints + a11y; tests green.
