// The app's share of a trip — Haraj-style: a voluntary transfer to the app's
// IBAN, on the user's honor. Both values are build-time config so the IBAN
// and the percentage can be changed without touching code.

/** Percentage of the trip's total spend (e.g. 1 → 1%). 0 hides the section. */
export const APP_FEE_PCT: number = Number(import.meta.env.VITE_APP_FEE_PCT ?? '1') || 0;

/** The app's IBAN (normalized). Empty until configured. */
export const APP_IBAN: string = String(import.meta.env.VITE_APP_IBAN ?? '').replace(/\s+/g, '').toUpperCase();

/** The fee for a given total, to the halala. */
export function appFee(total: number): number {
  return Math.round(total * APP_FEE_PCT) / 100;
}
