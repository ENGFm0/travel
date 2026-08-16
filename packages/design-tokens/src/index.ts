/** @boardingpass/design-tokens — TS token constants (for React Native / JS use).
 *  The CSS custom-property version lives in `./tokens.css` (web). Keep both in
 *  sync — the contrast test in apps/web guards the light-theme text pairs. */

export const brand = {
  navy: '#14213D',
  orange: '#E85D3D',
  gold: '#F4A950',
  sand: '#FDF6EC',
  teal: '#2A9D8F',
  blue: '#3A6EA5',
  violet: '#7C5CBF',
} as const;

export const light = {
  bg: '#FDF6EC',
  surface: '#FFFFFF',
  ink: '#14213D',
  inkMuted: 'rgba(20,33,61,0.62)',
  primary: brand.orange,
  onPrimary: '#FFFFFF',
  border: 'rgba(20,33,61,0.10)',
} as const;

export const dark = {
  bg: '#0F1A30',
  surface: '#1F2F54',
  ink: '#FDF6EC',
  inkMuted: 'rgba(253,246,236,0.66)',
  primary: brand.orange,
  onPrimary: '#FFFFFF',
  border: 'rgba(255,255,255,0.10)',
} as const;

export const radius = { sm: 6, md: 12, lg: 16, full: 9999 } as const;
export const spacing = { s1: 4, s2: 8, s3: 12, s4: 16, s6: 24, s8: 32 } as const;
export const fontFamily = 'IBM Plex Sans Arabic';
