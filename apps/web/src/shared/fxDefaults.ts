/** Rough SAR value of one unit of common destination currencies — a starting
 *  point the trip owner can overwrite (rates drift; these are only defaults). */
export const SAR_PER_UNIT: Record<string, number> = {
  SAR: 1, USD: 3.75, EUR: 4.10, GBP: 4.75, AED: 1.02, KWD: 12.2, QAR: 1.03, BHD: 9.95, OMR: 9.75, JOD: 5.29,
  EGP: 0.077, TRY: 0.11, MAD: 0.38, MYR: 0.85, THB: 0.11, IDR: 0.00024, JPY: 0.025, KRW: 0.0028, CHF: 4.6,
  INR: 0.045, PKR: 0.0135, CNY: 0.52, AUD: 2.45, CAD: 2.7, SGD: 2.8, GEL: 1.38, AZN: 2.2, BAM: 2.1,
};

/** base → dest multiplier for the finance model (amounts are stored in base). */
export function defaultRate(base: string, dest: string): number {
  const b = SAR_PER_UNIT[base], d = SAR_PER_UNIT[dest];
  if (!b || !d) return 1;
  return Math.round((b / d) * 10000) / 10000;
}

/** How many units of base one unit of dest costs ("1 EUR = 4.10 SAR"). */
export const unitPrice = (rate: number) => (rate > 0 ? Math.round((1 / rate) * 100) / 100 : 0);
