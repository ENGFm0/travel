# US-014 — Platform Navigation, Localization, Theming & Accessibility (Shell)
Status: IN-PROGRESS · Size: M · Tenant-scoped: No (app shell / cross-cutting)

> **Implementation status**
> - `US-014-FE-001` (web) — ✅ **DONE & VERIFIED** in `apps/web/` (React 19 + Vite 8 + Router 7 + i18next + Zustand). 13 tests green (shell behavior, i18n completeness, axe a11y, routing/404, store + error contract), `typecheck` + `build` green, real-browser no-overflow at 360/768/1280.
> - `US-014-SEC-001` (web portion) — ✅ security headers + CSP (`apps/web/public/_headers`), no client secrets, axe gate.
> - `US-014-QA-001` (web portion) — ✅ automated suite above.
> - `US-014-BE-001` — 🟡 **scaffolded** in `apps/api/` (.NET 10 minimal API: unified error contract, exception + security-headers middleware, versioned `/api/v1`, OpenAPI, health/config). *Not compiled in the spec sandbox (no .NET SDK).*
> - `US-014-FE-002` (mobile) — 🟡 **scaffolded** in `apps/mobile/` (Expo + RN 0.86: 5-tab nav, i18n, theme, RTL). *Not built (no emulator).*
> - Remaining to reach DONE: compile/run BE + mobile on a real toolchain; extract shared `packages/*`; visual contrast audit; CI wiring.

## 1. Story ID & Title
**US-014 — App Shell**: unified header (logo + dark-mode + profile), mobile bottom navigation (5 items), drawer (if used), routing, i18n (AR/EN + RTL/LTR), theming (light/dark/system), responsive framework, accessibility baseline.

## 2. User Story
**As a** user on any device, **I want** consistent navigation, my language & theme, and an accessible responsive layout, **so that** the whole app feels coherent and usable everywhere.

## 3. Business Goal
Foundational shell that every feature inherits (G7); guarantees consistency, localization, responsiveness, accessibility — one place, no per-page drift (fixes the prototype's inconsistent per-page headers).

## 4. Scope
**In:** Global header (logo image `bp-logo` right; dark-mode + profile left; **no hamburger** per latest decision); mobile bottom nav (🏠 Home · 🗺️ Explore · ➕ New · 🤝 Buddies · 🧳 My Trips); routing & active-state; i18n framework (AR/EN, `dir`, localized dates/numbers/currency); theme (light/dark/system, persisted, system-aware); responsive tokens/breakpoints; accessibility baseline (focus, skip-link, landmarks, reduced-motion); footer with logo + copyright.
**Out:** Feature-specific screens (their own stories); auth logic (US-001) though the shell hosts its modal.

## 5. Functional Requirements
- **FR-014-001** Persistent header on all pages: logo (links home) right; dark-mode toggle + profile/account left; no hamburger.
- **FR-014-002** Mobile bottom navigation with 5 fixed items + centered "New" CTA; active item highlighted; hidden/optional on large screens.
- **FR-014-003** Language switch AR↔EN updates `dir` (RTL/LTR) and all strings live; persisted (US-002).
- **FR-014-004** Theme light/dark/system; persisted; respects OS preference for "system".
- **FR-014-005** Client routing with code-splitting; active-route reflection; deep-links.
- **FR-014-006** Global footer (logo + copyright) on all pages.
- **FR-014-007** Localized number/date/currency formatting utilities (shared).
- **FR-014-008** Accessibility baseline: skip-to-content, landmarks, focus-visible, reduced-motion, min contrast.

## 6. Business Rules
- **BR-014-001** No UI string is hard-coded; all via i18n keys (AR/EN bundles).
- **BR-014-002** Direction is derived from locale (ar→rtl, en→ltr) app-wide; components must be direction-agnostic.
- **BR-014-003** Theme value ∈ {light, dark, system}; "system" follows OS live.
- **BR-014-004** Navigation targets and permissions-based visibility are consistent across web & mobile (shared nav model).
- **BR-014-005** Logo asset is a single shared token/component (no per-page duplication).

## 7. Operation Rules
- **Create/Update/Delete:** N/A (shell). **Activate/Deactivate:** feature-flag driven nav items (future). **Import/Export:** i18n bundles managed as resources.

## 8. Validation Rules
- **VR-014-001** Locale∈{ar,en}; theme∈{light,dark,system}. **VR-014-002** i18n bundles complete (no missing keys — CI check). **VR-014-003** Contrast ≥ 4.5:1 (audit).

## 9. Permissions & Access Control
Shell is public; nav items may hide based on auth/role (UX only) but each destination enforces its own server-side permissions. No security decision lives in the shell.

## 10. Audit Requirements
N/A (no sensitive ops). Optional analytics: `LANG_SWITCH`, `THEME_SWITCH`, `NAV_CLICK` (consent-gated, no PII).

## 11. Acceptance Criteria
- **AC1** Given any page, When it loads, Then the same header (logo right; dark+profile left; no hamburger) and footer render.
- **AC2** Given a mobile viewport, When I browse, Then the 5-item bottom nav is fixed at bottom with the active item highlighted.
- **AC3** Given I switch to English, When applied, Then the whole app becomes LTR/English with no hard-coded Arabic remaining.
- **AC4** Given theme=system, When OS is dark, Then the app is dark; toggling to light overrides and persists.
- **AC5** Given keyboard-only use, When I tab, Then focus is visible, skip-link works, and modals trap focus.
- **AC6** Given no horizontal overflow on 360–1440px widths, When resized, Then layout adapts without horizontal scroll.
- **AC7** i18n bundle completeness check passes in CI (no missing keys).

## 12. Dependencies
Depends on: none (foundation). Enables: **all UI stories**. Hosts US-001 auth modal; consumes US-002 persisted prefs.

## 13. Product Subtasks
- **US-014-UX-001** Design system & shell: header/footer/bottom-nav, tokens (colors/spacing/typography/logo), states, RTL/LTR mirrors, dark/light, responsive grid, a11y patterns (focus, skip-link, landmarks, reduced-motion); UX AC=AC1–AC6; handoff (token spec); DoD.
- **US-014-FE-001** Shell implementation (web): layout, router + code-split, header/footer/bottom-nav components, theme store (system-aware), i18n setup (i18next), direction management, shared formatters; CI missing-key check; DoD tests.
- **US-014-FE-002** Shell implementation (mobile RN): navigation (tabs mirroring bottom nav), `I18nManager` RTL, theme, shared i18n/formatters/design-tokens.
- **US-014-BE-001** Minimal: serve/localize error contract; expose config (enabled nav/flags) if needed; i18n resource endpoint (optional). DoD.
- **US-014-SEC-001** Ensure shell makes no security decisions; CSP/security headers; no secrets; verify nav visibility ≠ authorization; DoD.
- **US-014-QA-001** Functional AC1–AC7; BR-014-*; RTL (full mirror), responsive (360–1440, no overflow), a11y audit (axe, keyboard, contrast, reduced-motion), localization completeness; regression across pages; evidence; DoD.

## 14. Definition of Ready
Design tokens & logo asset finalized; locale/theme model agreed; routing map from story-map; a11y target (WCAG 2.2 AA) set. ✅

## 15. Definition of Done
Global DoD + AC1–AC7; consistent shell on web+mobile; full AR/EN + RTL/LTR; theme incl. system; responsive no-overflow; a11y baseline passes; i18n completeness in CI; tests green.
