# @boardingpass/web — App Shell (US-014)

Web frontend for **BoardingPass (بوردنق باس)**. This package implements
**US-014 — Platform Navigation, Localization, Theming & Accessibility (Shell)**:
the foundation every feature story plugs into.

## Stack
React 19 · TypeScript · Vite 8 · React Router 7 · i18next · Zustand.

## What US-014 delivers here
- **Unified shell**: sticky header (logo start + language/dark-mode/account actions, **no hamburger**), routed `<main>`, footer, and a fixed **5-item bottom navigation** (Home · Explore · ➕ New · Buddies · My Trips).
- **Localization**: AR/EN via i18next, `dir` (RTL/LTR) derived from locale, localized date/number/currency formatters. **No hard-coded UI strings** — all keys live in `src/shared/i18n/{ar,en}.json`.
- **Theming**: light / dark / **system** (OS-aware, live), persisted; resolved to `data-theme` on `<html>`.
- **Responsive**: mobile-first, logical CSS props (RTL-safe), no horizontal overflow.
- **Accessibility**: skip-to-content link, focus-visible, labeled landmarks/controls, reduced-motion, ≥42px touch targets.

## Structure
```
src/
├── app/            providers (Theme, Locale), router, ui store (Zustand)
├── shared/         i18n bundles, design tokens + global css, formatters, Logo
├── features/shell/ Header, Footer, BottomNav, Layout, nav model
├── pages/          placeholder section pages (filled by later stories)
└── test/           i18n-completeness + shell behavior tests (Vitest + RTL)
```

## Scripts
```bash
npm install
npm run dev        # start dev server
npm run build      # production build (Vite)
npm run typecheck  # tsc --noEmit
npm test           # vitest (shell + i18n completeness)
```

## Notes
- Design tokens (`src/shared/styles/tokens.css`), i18n, and formatters are written to be **extractable into shared packages** for the React Native app (architecture §3).
- Placeholder pages render a "US-014 · Shell" note; **US-001, US-003, US-005…** replace them with real content.
- The existing static prototype at repo root (GitHub Pages) is untouched; this app is the production re-platform.
