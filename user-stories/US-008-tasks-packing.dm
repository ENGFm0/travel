# US-008 — Tasks & Packing
Status: DRAFT · Size: M · Tenant-scoped: Yes

## 1. Story ID & Title
**US-008 — Tasks & Packing**: custom task manager (create task, assign to member, mark complete) + categorized packing/luggage checklist with one-tap templates.

## 2. User Story
**As a** trip member, **I want** to create and assign trip tasks and manage a categorized packing checklist, **so that** nothing is forgotten before/during the trip.

## 3. Business Goal
Reduce coordination overhead & pre-trip readiness (G3); shared accountability via assignment.

## 4. Scope
**In:** Task manager (add task with title + assignee, checkbox complete, delete, per-member filter); packing list (categorized items: clothes/electronics/meds/docs, add/toggle/delete, one-tap templates beach/cold/essentials); progress indicator. Also relates to standalone "prep" bookings checklist (booking/visa/passport/currency/SIM).
**Out:** Task reminders delivery (US-015), calendar sync (future).

## 5. Functional Requirements
- **FR-008-001** Create task with title + optional assignee (trip member).
- **FR-008-002** Toggle task complete/incomplete; delete.
- **FR-008-003** Show assignee avatar; filter tasks by member (Assumption optional).
- **FR-008-004** Bookings checklist groups (bookings, documents, money&connectivity) with progress %.
- **FR-008-005** Packing list grouped by category; add item to a category; toggle checked; delete.
- **FR-008-006** One-tap templates append category items idempotently (no duplicates).
- **FR-008-007** Progress indicators for tasks and packing.
- **FR-008-008** Empty states (no tasks/empty bag).

## 6. Business Rules
- **BR-008-001** Assignee must be a current trip member; if member removed, task becomes unassigned (not deleted).
- **BR-008-002** Templates never create duplicate items (dedupe by label+category).
- **BR-008-003** Any member may create/complete/delete tasks & packing items (collaborative); creator or owner for destructive is acceptable — default: any member edits, with audit (Assumption).
- **BR-008-004** Completion state is shared (realtime) across the group.

## 7. Operation Rules
- **Create:** `POST /trips/{id}/tasks|packing`. **Update:** toggle/edit `PATCH`. **Delete & Blockers:** delete item (confirm optional); no hard blockers. **Activate/Deactivate:** N/A. **Import/Export:** template apply = import; export in report (US-013).

## 8. Validation Rules
- **VR-008-001** Task title 1–120; assignee∈members|null. **VR-008-002** Packing label 1–60; category∈enum. **VR-008-003** Template key∈enum. Server-authoritative; realtime writes guarded by Rules.

## 9. Permissions & Access Control
| Action | VIEWER | TRIP_MEMBER | TRIP_OWNER |
|---|---|---|---|
| read | ✔ | ✔ | ✔ |
| create/toggle/delete task & packing | — | ✔ | ✔ |
| assign to member | — | ✔ | ✔ |
Server-enforced per membership.

## 10. Audit Requirements
`TASK_CREATE/ASSIGN/COMPLETE/DELETE`, `PACKING_ADD/TOGGLE/DELETE/TEMPLATE_APPLY(key)`; tenant, actor, entity, ts. Volume-summarize toggles if needed.

## 11. Acceptance Criteria
- **AC1** Given I add "حجز سيارة" assigned to Omar, When saved, Then it appears with Omar's avatar for all members (realtime).
- **AC2** Given a task, When I mark it complete, Then it shows done and progress updates for everyone.
- **AC3** Given I apply the "essentials" template twice, When applied, Then no duplicate items are created.
- **AC4** Given an assignee is later removed from the trip, When that happens, Then their tasks become unassigned (not deleted).
- **AC5** Given a VIEWER, When viewing, Then edit controls are hidden/blocked server-side.
- **AC6** AR/EN + 4 breakpoints + accessible checkboxes (label, keyboard, state announced).

## 12. Dependencies
Depends on: US-003, US-009 (members for assignment), US-014. Relates: US-015 (reminders). Lives in US-006 shell (Tasks tab).

## 13. Product Subtasks
- **US-008-UX-001** Tasks & Packing UX: task manager (input+assignee select+add, list w/ checkbox+avatar+delete), packing (category groups, add w/ category, templates chips, progress); states; RTL; responsive; a11y (checkbox semantics, live progress); UX AC=AC1–AC6; DoD.
- **US-008-FE-001** Module: tasks & packing components; member-select from US-009; API CRUD + realtime; template apply (dedupe client+server); optimistic; i18n; DoD tests. (Replaces prototype localStorage with API-backed.)
- **US-008-BE-001** Endpoints `/trips/{id}/tasks` & `/trips/{id}/packing` CRUD + `POST .../packing/template`; dedupe & assignee-integrity (BR-008-001/002) in service; audit; validation; unit tests; DoD.
- **US-008-SEC-001** AuthZ (member write, viewer read), tenant isolation, input validation, OWASP A01, audit; DoD.
- **US-008-QA-001** Functional AC1–AC6; BR-008-*; validation; permission (viewer read-only); realtime; template dedupe; RTL/responsive; regression (member removal → unassign); evidence; DoD.

## 14. Definition of Ready
US-003/US-009 ready; template catalog defined; edit-permission model (any-member) confirmed; realtime pattern agreed. ✅

## 15. Definition of Done
Global DoD + AC1–AC6; assignment integrity; template dedupe; realtime shared state; role-gated; audit; AR/EN + breakpoints + a11y; tests green.
