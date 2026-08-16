# Requirement Traceability Matrix · BoardingPass

Requirement → User Story → Subtask(s) → API → UI surface → QA. Sampled at FR granularity (representative per story; full FR lists live in each US file). Lets us locate where any requirement is implemented & verified.

| Req | Story | Subtasks | API | UI (screen/component) | QA |
|-----|-------|----------|-----|-----------------------|----|
| FR-001-002 email-routing login/register | US-001 | UX-001, FE-001, BE-001 | POST /auth/session | AuthModal/EmailStep | QA-001 AC1/AC2 |
| FR-001-005 guest mode | US-001 | FE-001, BE-001, SEC-001 | POST /auth/guest | GuestButton | QA-001 AC5 |
| FR-002-003 language toggle | US-002/014 | 014-UX-001, 014-FE-001 | (client)+/users/me | Header lang, i18n | 014-QA-001 AC3 |
| FR-002-006 delete account (blocker) | US-002 | BE-001, SEC-001 | DELETE /users/me | Settings/delete modal | QA-001 AC4 |
| FR-003-003 multi-city destinations | US-003 | UX-001, FE-001, BE-001 | POST /trips | StepDestinations/CityRow | QA-001 AC2/AC4 |
| FR-003-006 create→owner | US-003 | BE-001, SEC-001 | POST /trips | Wizard submit | QA-001 AC3 |
| FR-004-002 flight lookup | US-004 | FE-001, BE-001, SEC-001 | GET /flights/lookup | FlightLookup panel | QA-001 AC1/AC6 |
| FR-005-002 upcoming/past filter | US-005 | UX-001, FE-001, BE-001 | GET /trips?scope= | MyTrips filter | QA-001 AC1 |
| FR-005-005 archive/delete (owner) | US-005 | BE-001, SEC-001 | PATCH /status, DELETE | Trip card actions | QA-001 AC2/AC3 |
| FR-006-002 city timeline switch | US-006 | UX-001, FE-001 | GET /trips/{id} | CityTimeline | QA-001 AC1 |
| FR-006-004 itinerary CRUD/reorder | US-006 | FE-001, BE-001 | cities/days/activities | Itinerary editors | QA-001 AC2/AC3 |
| FR-007-002 owner confirm payment | US-007 | BE-001, SEC-001 | POST /kitty/mark-paid | PaymentStatus | QA-001 AC2 |
| FR-007-005 side kitty split | US-007 | UX-001, FE-001, BE-001 | POST /expenses(kind=SIDE) | SideKitty cards | QA-001 AC3 |
| FR-007-008 dual currency | US-007 | FE-001, BE-002 | POST /currency/refresh | Currency toggle | QA-001 AC5 |
| FR-008-001 task+assignee | US-008 | UX-001, FE-001, BE-001 | POST /tasks | TaskManager | QA-001 AC1 |
| FR-008-006 packing templates dedupe | US-008 | FE-001, BE-001 | POST /packing/template | Template chips | QA-001 AC3 |
| FR-009-002 invite link (login-gated) | US-009 | BE-001, SEC-001 | POST /invitations, /join | Invite box | QA-001 AC1/AC2 |
| FR-009-005 role change/transfer | US-009 | BE-001, SEC-001 | PATCH /members/{uid} | Members actions | QA-001 AC3/AC5 |
| FR-010-001 friend requests | US-010 | UX-001, FE-001, BE-001 | /friends/requests | Requests list | QA-001 AC1 |
| FR-011-003 buddies filters | US-011 | FE-001, BE-001 | GET /buddies?filters | Filter bar | QA-001 AC1 |
| FR-011-005 join (capacity) | US-011 | BE-001, SEC-001 | POST /buddies/{id}/join | Join button | QA-001 AC2 |
| FR-012-005 add place to trip | US-012 | FE-001, BE-001 | reviews + itinerary | AddToTrip modal | QA-001 AC3 |
| FR-013-001 media upload | US-013 | FE-001, BE-001, SEC-001 | POST /memories (signed) | Uploader | QA-001 AC1/AC6 |
| FR-013-006 export report | US-013 | FE-001, BE-001 | POST /report | Export button | QA-001 AC5 |
| FR-014-003 RTL/LTR live | US-014 | UX-001, FE-001/002 | (client) | dir switch | QA-001 AC3 |
| FR-015-001 event notifications | US-015 | BE-001, FE-001 | /notifications, FCM | Notif center | QA-001 AC1 |
| FR-015-005 payment reminder | US-015/007 | BE-001, SEC-001 | POST /reminders | Remind action | QA-001 AC3 |
| FR-016-002 suspend user | US-016 | BE-001, SEC-001 | POST /admin/.../suspend | Admin users | QA-001 AC2 |
| FR-016-004 audit access | US-016 | BE-001, SEC-001 | GET /admin/audit | Audit viewer | QA-001 AC4 |

## Non-functional traceability
| NFR | Where enforced | Verified |
|-----|----------------|----------|
| Server-side authorization | every BE-* + SEC-* + permission-matrix | each QA-* permission tests |
| Tenant isolation (trip) | 01, 02 §5.2, all trip-scoped BE-* | QA cross-trip access tests |
| Audit | 02 §6, US-016, per-story §10 | QA audit tests |
| Localization AR/EN + RTL | US-014 + every UX-* §RTL | US-014-QA + per-story RTL tests |
| Responsive (4 device classes) | US-014 + every UX-* §Responsive | per-story responsive tests |
| Accessibility WCAG 2.2 AA | US-014 + every UX-* §A11y | US-014-QA axe/keyboard/contrast |
| Secrets server-side (no client keys) | US-004/012, 02 §6/§7 | QA "no key in client" evidence |

Every FR/NFR resolves to a story, a subtask, an API (or client), a UI surface, and a QA check.
