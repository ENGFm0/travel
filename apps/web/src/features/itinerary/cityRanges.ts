/** Date helpers + the rule that gives every city stop a date range.
 *
 *  A stop with its own dates keeps them. Stops without dates share the trip's
 *  remaining days in order (13 days, Paris + Rome → Paris days 1–7, Rome 8–13)
 *  instead of each one repeating the whole trip. */

export interface CityRange {
  from?: string;
  to?: string;
  /** true when the range was derived from the trip dates (not set on the stop). */
  derived: boolean;
}

/** Inclusive day count for a date range (no dates → 0, single date → 1). */
export function dayCount(from?: string, to?: string): number {
  if (!from) return 0;
  if (!to || to === from) return 1;
  const a = new Date(from), b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 1;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** Inclusive list of ISO dates between from..to (capped for safety). */
export function datesBetween(from?: string, to?: string, cap = 60): string[] {
  if (!from) return [];
  const start = new Date(from);
  const end = to ? new Date(to) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [from];
  const out: string[] = [];
  const d = new Date(start);
  while (d <= end && out.length < cap) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return out;
}

/** Add N days to an ISO date. */
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** One range per city, in city order. Dated stops are explicit; undated stops
 *  split the trip days not already covered by a dated stop, contiguous chunks
 *  in order, earlier stops taking the extra day when it doesn't divide evenly.
 *  Without trip dates an undated stop simply has no range. */
export function allocateCityRanges(
  cities: { dateFrom?: string; dateTo?: string }[],
  tripFrom?: string,
  tripTo?: string,
): CityRange[] {
  const out: CityRange[] = cities.map((c) => (c.dateFrom
    ? { from: c.dateFrom, to: c.dateTo ?? c.dateFrom, derived: false }
    : { derived: true }));
  const undated = out.map((r, i) => (r.derived ? i : -1)).filter((i) => i >= 0);
  if (undated.length === 0 || !tripFrom) return out;

  const taken = new Set<string>();
  for (const c of cities) if (c.dateFrom) for (const d of datesBetween(c.dateFrom, c.dateTo ?? c.dateFrom, 120)) taken.add(d);
  const free = datesBetween(tripFrom, tripTo ?? tripFrom, 120).filter((d) => !taken.has(d));
  if (free.length === 0) return out;

  const base = Math.floor(free.length / undated.length);
  let extra = free.length % undated.length;
  let cursor = 0;
  for (const i of undated) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    const chunk = free.slice(cursor, cursor + size);
    cursor += size;
    if (chunk.length) out[i] = { from: chunk[0], to: chunk[chunk.length - 1], derived: true };
  }
  return out;
}
