# apps/mobile — BoardingPass Mobile (US-014-FE-002 shell)

Expo + **React Native 0.86** + TypeScript. Mirrors the web app shell: 5-item
bottom-tab navigation, i18n (AR/EN), theming (system light/dark), and RTL via
`I18nManager`.

## What this shell provides
- Bottom-tab navigation matching the web's 5 items (Home · Explore · New · Buddies · My Trips).
- i18n (AR/EN) + fallback; `I18nManager.forceRTL` on Arabic.
- System theme via `useColorScheme` + React Navigation themes.
- Placeholder screens (filled by later stories).

## Shared-with-web (architecture §3)
These should live in `packages/*` and be imported by both apps rather than
duplicated: `@boardingpass/i18n`, `@boardingpass/design-tokens`,
`@boardingpass/validation` (Zod), `@boardingpass/api-client`, `@boardingpass/types`,
formatters, and state models. The scaffold currently inlines a minimal i18n
bundle for standalone clarity.

## Run (on a dev machine with Expo tooling + emulator/device)
```bash
cd apps/mobile
npm install
npx expo start          # then press a (Android) / i (iOS), or scan with Expo Go
npm run typecheck
```

> ⚠️ **Sandbox note:** authored as a scaffold; **not installed/built/run** in the
> spec environment (no Android/iOS emulator or device). Dependency versions
> (Expo SDK, react-navigation, RN) should be aligned with `expo install` on a
> real machine. RTL flips require an app reload (expo-updates) to apply globally.
