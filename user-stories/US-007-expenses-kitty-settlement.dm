# US-007 — Expenses, Kitty & Settlement (Dual Currency)
Status: DRAFT · Size: L · Tenant-scoped: Yes

## 1. Story ID & Title
**US-007 — Expenses, Kitty & Settlement**: group kitty (قطة) with collection/payment-status/distribution/log, side kitties (قطّات مشتركة) between 2+ people, personal expenses, "My financial summary", and dual-currency toggle.

## 2. User Story
**As a** trip member, **I want** to manage the shared kitty, split side expenses among any 2+ people, track my personal spending, and see my net balance in either currency, **so that** money is transparent and fairly settled.

## 3. Business Goal
Eliminate money friction — the platform's differentiator (G2). Transparent collection, fair splits, clear "who owes whom", localized currency.

## 4. Scope
**In:** Group kitty (total, collected, per-member dues, paid status owner-confirmed, distribution by category, expense log); side kitties (title, participants≥2, total, per-person share, payer, settle-via-transfer note "برق"); personal expenses (budget, spent, remaining, log); My financial summary (paid vs fair-share, side net, net balance لك/عليك, spend analysis); dual-currency toggle (home ⇄ destination) recomputing all amounts with exchange rate.
**Out:** Real payment processing / PSP (settlement is *record & notify*, not money movement — Assumption); receipts OCR (future).

## 5. Functional Requirements
- **FR-007-001** Owner sets kitty total; system computes per-member due (= total / member count, or custom shares — Assumption default equal).
- **FR-007-002** Members mark intent to pay; **owner confirms** payment (paid/pending) — mirrors "قبول سداد عند الأمير".
- **FR-007-003** Show collected vs remaining + progress; distribution by category (housing/food/transport/other).
- **FR-007-004** Expense log: add group expense (desc, category, amount, payer); list.
- **FR-007-005** Side kitty: create among any ≥2 selected people; equal split; show per-person share, payer, settlement note; add/delete; settle action generates transfer text.
- **FR-007-006** Personal expenses: personal budget, add/delete personal spend, remaining.
- **FR-007-007** My financial summary: computed net position (group + side), spend analysis.
- **FR-007-008** Currency toggle switches display between home & destination currency using rate; total & all rows recompute.
- **FR-007-009** Empty/loading/error states for each sub-tab.

## 6. Business Rules
- **BR-007-001** Only `TRIP_OWNER` may confirm kitty payments (`mark_paid`). Members cannot self-confirm.
- **BR-007-002** Side kitty requires ≥2 participants; share = total / participants (equal). Rounding: last participant absorbs remainder (documented).
- **BR-007-003** Personal expenses are private to the member (only self + not shared in group totals). Owner cannot see others' personal spend.
- **BR-007-004** Currency conversion uses the trip's stored rate (fetched at trip creation / refreshable); display-only, amounts stored in a base currency.
- **BR-007-005** Net balance sign: positive = owed to user (لك), negative = user owes (عليك).
- **BR-007-006** Settlement marks a side kitty settled (record only); no real funds move (Assumption).
- **BR-007-007** Deleting an expense recomputes dependent totals/summary atomically.
- **BR-007-008** Only expense creator or owner may edit/delete a group/side expense; only self may edit personal.

## 7. Operation Rules
- **Create:** add group/side/personal expense → `POST /trips/{id}/expenses` (kind). Kitty init → owner sets total.
- **Update:** edit expense (creator/owner); mark_paid (owner); currency rate refresh (owner).
- **Delete & Blockers:** delete expense (creator/owner); recompute; **Blocker:** cannot delete a settled side kitty without unsettle (owner) — soft.
- **Activate/Deactivate:** N/A. **Import/Export:** export financial summary in report (US-013).

## 8. Validation Rules
- **VR-007-001** Amount > 0, ≤ max, 2-decimals; currency∈trip currencies. **VR-007-002** Side participants: distinct, ≥2, all trip members. **VR-007-003** Category∈enum. **VR-007-004** Personal amount>0. **VR-007-005** Kitty total ≥ 0. All server-authoritative; totals recomputed server-side (never trust client sums).

## 9. Permissions & Access Control
| Action | TRIP_MEMBER | TRIP_OWNER | ADMIN |
|---|---|---|---|
| read kitty/log/summary(own) | ✔ | ✔ | support(audit) |
| add group/side expense | ✔ | ✔ | — |
| edit/delete expense | ✔(own) | ✔(any) | — |
| mark_paid (kitty) | — | ✔ⓞ | — |
| read others' personal | — | — | — |
| currency rate refresh | — | ✔ⓞ | — |
Server-enforced; personal expenses strictly self-scoped.

## 10. Audit Requirements
`KITTY_SET_TOTAL(old→new)`, `KITTY_MARK_PAID(memberUid, paid)`, `EXPENSE_ADD/UPDATE/DELETE(kind, amount)`, `SIDE_CREATE/SETTLE/DELETE`, `RATE_REFRESH(old→new)`. Tenant=tripId, actor, ts, result. Personal expense amounts audited minimally (self-scope) — no exposure to others.

## 11. Acceptance Criteria
- **AC1** Given total 4500 & 3 members, When kitty is set, Then each due = 1500 (equal) and collected/remaining reflect confirmed payments.
- **AC2** Given a member marks intent, When owner confirms, Then status → paid and collected increases; a member cannot confirm themselves.
- **AC3** Given a side kitty of 600 among 3, When created, Then per-person share = 200 and payer/settlement note show; delete recomputes.
- **AC4** Given personal spend entries, When viewed, Then only I see them; another member/owner cannot.
- **AC5** Given currency toggle to destination, When switched, Then total & all amounts recompute using the rate (e.g., 4500 SAR ≈ £955), consistently.
- **AC6** Given my paid vs fair share, When I open summary, Then net balance shows correctly as لك/عليك with spend analysis.
- **AC7** Given I delete an expense, When confirmed, Then totals, distribution and summary update atomically.
- **AC8** AR/EN (numbers localized) + 4 breakpoints + accessible tabs/inputs.

## 12. Dependencies
Depends on: US-003 (trip), US-009 (members = participants/payer), US-014. Exchange-rate service (architecture). Feeds US-013 (report), US-015 (payment reminders "برق").

## 13. Product Subtasks
- **US-007-UX-001** Expenses UX: currency toggle + total header; 4 inner sub-tabs (kitty/side/personal/summary); payment-status list, distribution bars, expense log, side-kitty cards (participants avatars, share, settle), personal budget cards + log, summary (net, analysis); states each sub-tab; RTL (numbers), responsive; a11y; UX AC=AC1–AC8; DoD.
- **US-007-FE-001** Expenses module: sub-tab router; forms (RHF+Zod) for group/side/personal; currency conversion display hook (rate from trip); optimistic + server-recompute reconciliation; realtime kitty status; i18n number/currency formatting; DoD tests.
- **US-007-BE-001** Endpoints: `POST/PATCH/DELETE /trips/{id}/expenses`, `PUT /trips/{id}/kitty` (total), `POST /trips/{id}/kitty/mark-paid`, `POST /trips/{id}/expenses/{eid}/settle`, `GET /trips/{id}/finance/summary`, `POST /trips/{id}/currency/refresh`. Server computes all totals/shares/net (source of truth); transactions on delete/recompute; audit; validation; unit tests (equal split, rounding, mark_paid owner-only, personal isolation, currency); DoD.
- **US-007-BE-002** Exchange-rate service (cache + fallback); stores trip rate.
- **US-007-SEC-001** AuthZ (owner-only mark_paid/rate; creator/owner edit; personal self-only), tenant isolation, no client-trusted sums, input validation, OWASP A01/A04, audit verification, sensitive-data (personal spend privacy); DoD.
- **US-007-QA-001** Functional AC1–AC8; BR-007-*; validation VR-007-*; permission (member can't mark_paid; can't see others' personal; can't edit others' expense); security (tamper amounts server rejects); audit; RTL/number-format; responsive; regression (member changes reflect; delete recompute); evidence; DoD.

## 14. Definition of Ready
US-003/US-009 ready (trip+members); currency model (base + rate) agreed; equal-split default + rounding rule confirmed; settlement = record-only assumption accepted; reminder contract with US-015. ✅

## 15. Definition of Done
Global DoD + AC1–AC8; server-computed totals/shares/net; owner-only confirmations; personal privacy enforced; dual-currency consistent; atomic recompute; audit; AR/EN + breakpoints + a11y; tests green.
