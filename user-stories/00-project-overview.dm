# 00 — Project Overview · بوردنق باس / BoardingPass

> Format: `.dm` (structured Markdown). Reference document for the whole Product Backlog.
> Phase: **Analysis / Specification only — NO implementation.**
> Source of truth #1: live UI/UX at https://engfm0.github.io/travel/
> Source of truth #2: `User Story Standard` (attached .docx).

---

## 1. Product Summary

**BoardingPass (بوردنق باس)** is a group‑travel planning platform that follows the *chronological journey of a traveler*: plan → coordinate the group → discover → live the trip → remember it. It targets Gulf/Arabic-first travelers who travel in groups and need to split money fairly and coordinate logistics.

The current site is a **static UI prototype** (HTML + TailwindCDN + vanilla JS, RTL Arabic, localStorage). This backlog re-platforms it into a production system:

- **Web:** React + TypeScript + Vite 8.1 + React Router (no Next.js).
- **Mobile:** React Native 0.86 + TypeScript (+ Expo where architecturally appropriate).
- **Backend:** C# + ASP.NET Core Web API + .NET 10 LTS (Clean Architecture).
- **Data/Platform:** Firebase (Cloud Firestore, Auth, Storage, FCM, Analytics, App Check) — each service justified per story.

## 2. Vision & Business Goals

| # | Goal |
|---|------|
| G1 | Let a group plan one trip together in one place (itinerary, money, tasks, members, memories). |
| G2 | Remove money friction: transparent shared "kitty" (قطة) + side kitties + personal budget + automatic settlement, dual currency. |
| G3 | Reduce coordination overhead: roles, invitations, tasks with assignees, packing checklists. |
| G4 | Inspire & assist: destination discovery, recommendations, flight auto-fill. |
| G5 | Preserve the trip: shared media album + shareable/exportable trip report. |
| G6 | Grow the community: find travel buddies for full trips or single activities. |
| G7 | First-class Arabic (RTL) + English (LTR), mobile-first, accessible, secure by design. |

## 3. Primary Journeys (as observed in the live site)

1. **Onboard:** Guest lands on Home → sign in / register (email, Google, guest) → enters app.
2. **Create trip:** 3-step wizard (basics + type domestic/international + dates → destinations single/multi-city with per-city dates → invite friends). Optional flight-number auto-fill (AviationStack).
3. **Coordinate:** Trip dashboard with multi-city timeline and 5 tabs — Itinerary, Expenses & Split, Tasks & Packing, Members, Memories.
4. **Money:** Group kitty (collection + payment status + distribution + log), side kitties between 2+ people, personal expenses, "My financial summary", dual-currency toggle.
5. **Discover:** Explore destinations/places (restaurants, landmarks, activities) with ratings; add to a trip.
6. **Buddies:** Find/join full trips or activities/meetups with filters (city, date, category, budget); create a buddy request.
7. **My Trips:** Upcoming vs Past filter; domestic/international badges; manage friends & current group.
8. **Remember:** Upload photos/videos grouped by day or place; share link / export PDF report.

## 4. Scope of this Backlog

**In scope:** All functionality visually or functionally represented in the live site, re-specified for production across Web + Mobile + Backend + Firebase + Security + QA, bilingual & responsive.

**Out of scope (this backlog phase):** Actual code, real Firebase project provisioning, live API keys, payment processing/PSP integration (settlement is *record & notify*, not real money movement — see Assumptions), and any provider/merchant marketplace (Not Applicable in current site; noted as future).

## 5. Document Map (deliverables in `user-stories/`)

```
user-stories/
├── 00-project-overview.dm          ← this file
├── 01-roles-and-permissions.dm     ← roles + RBAC/PBAC model
├── 02-system-architecture.dm       ← web / mobile / backend / firebase / security
├── 03-story-map.dm                 ← feature map, user-flow map, story list, implementation order
├── 99-open-questions-assumptions.dm
├── US-0xx-*.dm                      ← one file per User Story (full Standard template + subtasks)
└── matrices/
    ├── permission-matrix.dm
    ├── dependency-matrix.dm
    ├── api-matrix.dm
    ├── feature-coverage-matrix.dm
    └── traceability-matrix.dm
```

## 6. User Story Standard (locked structure — every US file MUST contain)

Core (15): 1 Story ID & Title · 2 User Story · 3 Business Goal · 4 Scope (In/Out) · 5 Functional Requirements (FR) · 6 Business Rules (BR) · 7 Operation Rules (Create/Update/Delete&Blockers/Activate-Deactivate/Import-Export as needed) · 8 Validation Rules · 9 Permissions & Access Control · 10 Audit Requirements · 11 Acceptance Criteria (Given/When/Then) · 12 Dependencies · 13 Product Subtasks (UX/FE/BE/SEC/QA) · 14 Definition of Ready · 15 Definition of Done.

Embedded templates per story (from the Standard):
- **UX/UI** (14): Objective · Screens · User Flow · Screen Layout · Components · States (Empty/Loading/Error/Success) · Modals · System Messages · Responsive · RTL/LTR · Accessibility · UX Acceptance · Design Handoff · DoD.
- **Frontend** (13): Objective · Pages · Components · API Integration · State Management · Client Validation · Error Handling · Loading States · Responsive · RTL · Localization · Browser Compatibility · Performance · DoD.
- **Backend** (12): Objective · DB Changes · API Endpoints · Business Logic · Validation · Transactions · Audit · Tenant Isolation · Permissions Enforcement · Exception Handling · Performance · Unit Tests · DoD.
- **Security** (10): Objective · Permission Matrix · Authorization · Authentication · Tenant Isolation · Input Validation · OWASP Review · Audit Verification · Sensitive Data · Security Acceptance · DoD.
- **QA** (11): Functional · Business Rules · Validation · Permission · Security · Audit · RTL · Responsive · Regression · Evidence · DoD.

## 7. ID Convention (stable, do not renumber)

- Story: `US-001`, `US-002`, …
- Subtasks: `US-001-UX-001`, `US-001-FE-001`, `US-001-BE-001`, `US-001-SEC-001`, `US-001-QA-001`.
- Business Rule: `BR-<US>-nnn` · Functional Req: `FR-<US>-nnn` · Validation: `VR-<US>-nnn`.

## 8. Global Definition of Ready / Done (applies to every story on top of story-specific)

**Global DoR:** Scope, Business Goal, FRs, BRs, UX, Dependencies, Permissions, testable Acceptance Criteria, API & Data requirements (when needed), Security requirements — all present and unambiguous.

**Global DoD:** UX + FE + BE + SEC + QA complete; Responsive (Desktop/Laptop/Tablet/Mobile); RTL/LTR + AR/EN; Empty/Loading/Error/Success states; Audit (where required); server-side permission checks; unit/integration tests green; docs updated; Acceptance Criteria met; no `console` secrets; no hard-coded strings.

## 9. Cross-cutting Non-Functionals (inherited by all stories)

- **Localization:** AR + EN, RTL + LTR, localized dates/numbers/currency, no hard-coded UI text (i18n keys only).
- **Responsive:** breakpoints `sm 640 / md 768 / lg 1024 / xl 1280`; mobile-first; bottom-nav on mobile.
- **Accessibility:** WCAG 2.2 AA target — keyboard nav, focus management, semantic HTML, contrast ≥ 4.5:1, ≥44px touch targets, screen-reader labels, reduced-motion.
- **Security:** server-side enforcement of every permission; Firebase Security Rules mirror API authorization; no admin/secret material in client.
- **Observability:** structured logging + audit for sensitive operations.
