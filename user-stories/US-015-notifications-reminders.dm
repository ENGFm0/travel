# US-015 — Notifications & Reminders (FCM)
Status: IN-PROGRESS · Size: S · Tenant-scoped: Mixed

> **Implementation status**
> - `US-015-FE-001` (web) — ✅ **DONE & VERIFIED** in `apps/web/src/features/notifications/`:
>   an in-app **notification center** in the header (authenticated only) — a bell with
>   an **unread badge**, a dropdown panel listing notifications (type icon, localized
>   message with actor, time), **mark-read on open** + **mark-all-read**, and
>   **deep-link** routing to the source (invite→members, reminder→expenses,
>   friend→friends tab, buddy→buddies). Closes on outside-click / Escape; accessible
>   dialog + count-announcing bell label. Pure model (`notificationsModel.ts`):
>   `unreadCount`, `deepLinkFor`, `iconFor`. Per-category **preferences** already ship
>   in US-002. Swappable `NotificationsService` (mock ↔ API) + reactive store. 6 tests
>   (2 model; 4 UI: badge+list, mark-all-read clears badge, single-read on open, hidden
>   for signed-out) — **121/121 web tests green**, typecheck + build green.
> - `US-015-BE-001` — 🟡 **scaffolded** in `apps/api/.../Endpoints/NotificationsEndpoints.cs`:
>   `GET /notifications`, `PATCH /notifications/{id}`, `PATCH /notifications/read-all`,
>   device-token `POST/DELETE /notifications/devices`, and owner reminder
>   `POST /trips/{id}/reminders` contracts. The event handlers → FCM send, recipient
>   authorization, per-category preference gating, reminder rate limiting, device-token
>   lifecycle, and audit are the remaining BE work. *Not compiled (no .NET SDK).*
> - `US-015-SEC-001` — partial: recipient-scoped list + minimal client payloads in UX;
>   server-side recipient authorization, token security, reminder anti-spam, and
>   no-leakage payloads pending BE.
> - Remaining to DONE: BE notification service + FCM + device tokens + reminders +
>   audit, owner "برق" reminder action wired into the US-007 members/dues list, token
>   removal on logout, live push registration (web + RN).

## 1. Story ID & Title
**US-015 — Notifications & Reminders**: in-app + push notifications for invitations, friend requests, payment/settlement reminders ("برق"), buddy join updates; notification center & preferences.

## 2. User Story
**As a** user, **I want** timely notifications for invites, requests, payments and buddy activity, **so that** I don't miss group coordination.

## 3. Business Goal
Close coordination loops & drive engagement/retention (G3, G6); make async collaboration reliable.

## 4. Scope
**In:** Event-driven notifications (trip invite US-009, friend request US-010, payment reminder US-007, buddy join US-011); channels: in-app center + push (FCM) + optional email; read/unread; per-category preferences (US-002); deep-link to source.
**Out:** SMS/WhatsApp delivery (the prototype's wa.me is a manual share, not system notifications — Assumption/future), real-time chat.

## 5. Functional Requirements
- **FR-015-001** Emit notification on domain events (invite, friend request, payment due/reminder, buddy join).
- **FR-015-002** In-app notification center: list, unread badge, mark read/all-read, deep-link.
- **FR-015-003** Push via FCM to registered devices (web + mobile); respects prefs.
- **FR-015-004** Per-category preferences honored (US-002).
- **FR-015-005** Payment reminder ("برق") can be triggered by owner for pending members (US-007).
- **FR-015-006** Empty/loading/error states.

## 6. Business Rules
- **BR-015-001** Notifications respect user preferences & quiet categories; disabled category = no push (still may show in-app depending on setting).
- **BR-015-002** Recipient authorization: only relevant parties receive (e.g., invitee gets invite; owner gets accept). No cross-tenant leakage in payload.
- **BR-015-003** Payloads contain minimal, non-sensitive data + a deep-link; details fetched authenticated.
- **BR-015-004** Reminder rate-limited per member per trip (anti-spam).
- **BR-015-005** Device tokens managed (register/refresh/remove on logout).

## 7. Operation Rules
- **Create:** system-emitted on events; owner-triggered reminders `POST /trips/{id}/reminders`. **Update:** mark read. **Delete & Blockers:** clear/dismiss. **Activate/Deactivate:** per-category prefs; device token lifecycle. **Import/Export:** N/A.

## 8. Validation Rules
- **VR-015-001** Event type∈enum; recipient authorized. **VR-015-002** Reminder target = pending member of that trip. **VR-015-003** Device token valid; deduped. Server-authoritative.

## 9. Permissions & Access Control
| Action | USER | TRIP_OWNER | ADMIN |
|---|---|---|---|
| read own notifications | ✔ⓜ | ✔ⓜ | support(audit) |
| trigger payment reminder | — | ✔ⓞ | — |
| manage device tokens | ✔ⓜ | ✔ⓜ | — |
Recipient-scoped; owner-only reminders.

## 10. Audit Requirements
`NOTIFY_SENT(type, recipient)`, `REMINDER_TRIGGERED(tripId, member)`, `NOTIFY_PREF_CHANGE`, `DEVICE_TOKEN_REGISTER/REMOVE`. Actor/recipient (hashed), ts, result. No sensitive payload stored.

## 11. Acceptance Criteria
- **AC1** Given I'm invited to a trip, When invited, Then I receive an in-app + push (if enabled) notification deep-linking to the invite.
- **AC2** Given I disabled "buddy updates", When a buddy event occurs, Then I get no push for it.
- **AC3** Given the owner triggers a payment reminder, When a member is pending, Then that member is reminded (rate-limited), others are not.
- **AC4** Given unread notifications, When I open the center, Then the badge count is correct and mark-all-read clears it.
- **AC5** Given I log out, When done, Then my device token is removed (no further push).
- **AC6** Payloads contain no sensitive cross-tenant data (verified).
- **AC7** AR/EN + 4 breakpoints + accessible (announced, focusable list).

## 12. Dependencies
Depends on: US-001, US-002 (prefs), US-014; consumes events from US-007/009/010/011. FCM (architecture).

## 13. Product Subtasks
- **US-015-UX-001** Notifications UX: center (list, unread badge, mark-read, deep-link), reminder action (in US-007 members), preference toggles (in US-002); states; RTL; responsive; a11y (live region, focus); UX AC=AC1–AC7; DoD.
- **US-015-FE-001** Notifications module: center + badge, FCM registration (web + RN), deep-link routing, prefs wiring; token lifecycle; i18n; DoD tests.
- **US-015-BE-001** Notification service (event handlers → create `notifications/{uid}`, send FCM), endpoints `/notifications` (GET/PATCH read), `/trips/{id}/reminders` (POST, owner, rate-limited), device-token register/remove; authorization of recipients; audit; validation; unit tests; DoD.
- **US-015-SEC-001** Recipient authorization (no leakage), minimal payloads, token security, rate limiting (reminders/anti-spam), OWASP A01/A04, audit; DoD.
- **US-015-QA-001** Functional AC1–AC7; BR-015-*; validation; permission (only recipients; owner-only reminders); security (payload leakage, token handling, spam); RTL/responsive; regression (prefs from US-002 honored); evidence; DoD.

## 14. Definition of Ready
US-001/002/014 ready; event contracts from US-007/009/010/011 defined; FCM project configured; prefs model locked. ✅

## 15. Definition of Done
Global DoD + AC1–AC7; event-driven notifications; prefs honored; owner-only rate-limited reminders; minimal secure payloads; token lifecycle; audit; AR/EN + breakpoints + a11y; tests green.
