import { describe, it, expect } from 'vitest';
import { allocateCityRanges, dayCount, datesBetween } from '@/features/itinerary/cityRanges';

describe('city date ranges', () => {
  it('splits the trip days across undated stops in order (no repeats)', () => {
    const r = allocateCityRanges([{}, {}], '2026-12-10', '2026-12-22'); // 13 days
    expect(r[0]).toEqual({ from: '2026-12-10', to: '2026-12-16', derived: true }); // 7 days
    expect(r[1]).toEqual({ from: '2026-12-17', to: '2026-12-22', derived: true }); // 6 days
    expect(dayCount(r[0].from, r[0].to) + dayCount(r[1].from, r[1].to)).toBe(13);
  });

  it('keeps explicit stop dates and gives the rest to undated stops', () => {
    const r = allocateCityRanges([{ dateFrom: '2026-12-10', dateTo: '2026-12-12' }, {}, {}], '2026-12-10', '2026-12-16');
    expect(r[0]).toEqual({ from: '2026-12-10', to: '2026-12-12', derived: false });
    expect(r[1]).toEqual({ from: '2026-12-13', to: '2026-12-14', derived: true });
    expect(r[2]).toEqual({ from: '2026-12-15', to: '2026-12-16', derived: true });
  });

  it('leaves undated stops without a range when the trip has no dates or no free days', () => {
    expect(allocateCityRanges([{}, {}])).toEqual([{ derived: true }, { derived: true }]);
    const r = allocateCityRanges([{ dateFrom: '2026-12-10', dateTo: '2026-12-12' }, {}], '2026-12-10', '2026-12-12');
    expect(r[1]).toEqual({ derived: true });
  });

  it('more stops than days: the first stops get a day each', () => {
    const r = allocateCityRanges([{}, {}, {}], '2026-12-10', '2026-12-11');
    expect(r.map((x) => x.from)).toEqual(['2026-12-10', '2026-12-11', undefined]);
  });

  it('date helpers', () => {
    expect(dayCount('2026-12-10', '2026-12-22')).toBe(13);
    expect(dayCount(undefined)).toBe(0);
    expect(datesBetween('2026-12-30', '2027-01-01')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });
});
