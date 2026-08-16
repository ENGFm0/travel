# US-009 — Trip Members, Roles & Invitations
Status: DRAFT · Size: M · Tenant-scoped: Yes

## 1. Story ID & Title
**US-009 — Trip Members, Roles & Invitations**: manage the trip group — members list, roles (Amir/Member/Viewer), invite link, accept/decline, remove, leave, ownership transfer.

## 2. User Story
**As a** trip owner (Amir), **I want** to invite people, manage members and roles, and share an invite link, **so that** the right people can collaborate on the trip with correct permissions.

## 3. Business Goal
Seed and govern the group that powers every trip feature (G3); enforce the Amir/Member model that underlies expenses, itinerary, tasks.

## 4. Scope
**In:** Members list with roles; invite via link (login-required to join), by friend (US-010), or by phone/username; accept/decline invitation; owner remove member / change role; member leave; ownership transfer; pending vs active membership.
**Out:** Friend graph management (US-010); notification delivery (US-015 delivers invite messages); guest access.

## 5. Functional Requirements
- **FR-009-001** List members with name, avatar, role (Amir/Member/Viewer), status (pending/active).
- **FR-009-002** Generate/copy a **shareable invite link**; opening it requires login, then joins as Member (pending→active on accept).
- **FR-009-003** Invite existing friends (from US-010) or by name+phone/username.
- **FR-009-004** Invitee accepts/declines; on accept → active member.
- **FR-009-005** Owner can remove a member, change a member's role (Member↔Viewer), and transfer ownership to another member.
- **FR-009-006** Member can leave a trip; owner cannot leave without transferring ownership (or archiving if sole member).
- **FR-009-007** Copy-invite feedback ("تم النسخ ✓").
- **FR-009-008** Empty state (only you) + pending invites section.

## 6. Business Rules
- **BR-009-001** Exactly one `TRIP_OWNER` per trip at all times.
- **BR-009-002** Owner cannot leave/delete self while other members exist without transferring ownership (link to US-002 delete blocker & US-005 delete).
- **BR-009-003** Invite link is capability-bearing but **requires authentication**; joining creates membership server-side (link alone never grants access without login+accept).
- **BR-009-004** Removing a member revokes their access immediately (tenant isolation) and unassigns their tasks (BR-008-001), keeps their past expense records (integrity) but flags settlement (US-007).
- **BR-009-005** Role change and removal are owner-only; audited.
- **BR-009-006** Invite links expire/rotatable; revocable by owner.
- **BR-009-007** A user cannot be added twice to the same trip.

## 7. Operation Rules
- **Create:** invite → pending membership `POST /trips/{id}/invitations`; join via link → `POST /trips/{id}/join`.
- **Update:** change role / transfer ownership `PATCH /trips/{id}/members/{uid}`.
- **Delete & Blockers:** remove member (owner) / leave (member); **Blocker:** owner leave without transfer (BR-009-002); last member leaving archives trip.
- **Activate/Deactivate:** invitation accept/decline (pending→active/rejected); link revoke.
- **Import/Export:** N/A.

## 8. Validation Rules
- **VR-009-001** Invitee resolvable (friendId | phone E.164 | username) & not already member. **VR-009-002** Role∈{OWNER,MEMBER,VIEWER}; only one OWNER. **VR-009-003** Transfer target must be an active member. **VR-009-004** Link token opaque, single-trip scoped, expiring. Server-authoritative.

## 9. Permissions & Access Control
| Action | TRIP_MEMBER | TRIP_OWNER | ADMIN |
|---|---|---|---|
| view members | ✔ | ✔ | support(audit) |
| generate/copy invite link | — | ✔ⓞ | — |
| invite user | — | ✔ⓞ | — |
| accept/decline own invite | ✔(invitee) | ✔ | — |
| remove member / change role | — | ✔ⓞ | ✔(audit) |
| transfer ownership | — | ✔ⓞ | ✔(audit) |
| leave trip | ✔ | ✔ⓞ¹ | — |
¹ owner must transfer first. Server-enforced.

## 10. Audit Requirements
`INVITE_CREATE`, `INVITE_ACCEPT/DECLINE`, `MEMBER_JOIN(via link)`, `MEMBER_REMOVE`, `ROLE_CHANGE(old→new)`, `OWNERSHIP_TRANSFER(from→to)`, `INVITE_LINK_REVOKE`, `MEMBER_LEAVE`. Tenant, actor, target, ts, result.

## 11. Acceptance Criteria
- **AC1** Given I am owner, When I copy the invite link and a logged-in user opens & accepts it, Then they become an active Member.
- **AC2** Given an unauthenticated user opens the invite link, When opened, Then they must log in before joining (no access otherwise).
- **AC3** Given I am owner, When I change a member to Viewer, Then their edit permissions are revoked server-side.
- **AC4** Given I am the sole owner with members, When I try to leave, Then I'm blocked and prompted to transfer ownership.
- **AC5** Given I transfer ownership, When completed, Then the other member becomes Amir and I become Member; exactly one owner remains.
- **AC6** Given I remove a member, When done, Then they lose access immediately and their tasks unassign.
- **AC7** AR/EN + 4 breakpoints + accessible list/actions.

## 12. Dependencies
Depends on: US-003 (trip), US-001, US-014. Integrates: US-010 (invite friends), US-015 (deliver invites). Consumed by: US-006/007/008/013 (membership/roles), US-002/US-005 (delete/leave blockers).

## 13. Product Subtasks
- **US-009-UX-001** Members UX: list w/ role chips & status; invite link box (copy feedback); invite-by-friend/manual; role menu; transfer/remove/leave confirms; pending invites; states; RTL; responsive; a11y; UX AC=AC1–AC7; DoD.
- **US-009-FE-001** Members module: list + actions; invite link copy; friend picker (US-010); accept/decline; role change/transfer/remove/leave mutations w/ confirms; realtime membership; i18n; DoD tests.
- **US-009-BE-001** Endpoints: invitations, join(link), members PATCH (role/transfer), DELETE (remove/leave); enforce one-owner, transfer, blockers (BR-009-*); link token issuance/rotation/expiry; audit; validation; transactions (transfer atomic); unit tests; DoD.
- **US-009-SEC-001** AuthZ (owner-only management, invitee-only accept), tenant isolation (removal revokes), capability-link requires auth (BR-009-003), token security (opaque/expiring/revocable), OWASP A01/A08, audit; DoD.
- **US-009-QA-001** Functional AC1–AC7; BR-009-*; validation; permission (member can't manage; unauth link blocked; owner-leave blocked); security (link replay/expiry, removed-member access revoked); audit; RTL/responsive; regression (removal → tasks unassign, expenses integrity); evidence; DoD.

## 14. Definition of Ready
US-003 ready; owner/role model locked (01); invite-link security model agreed; friend-invite contract (US-010); notification contract (US-015). ✅

## 15. Definition of Done
Global DoD + AC1–AC7; one-owner invariant; auth-required invite links; owner-only management enforced server-side; ownership transfer atomic; removal revokes access; audit; AR/EN + breakpoints + a11y; tests green.
