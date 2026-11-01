import { describe, it, expect } from 'vitest';
import {
  POT_UID, memberBreakdown, netByMember, perMemberDue, potStatus, settledLedger, splitExact, type Finance,
} from '@/features/expenses/finance';

const base = (over: Partial<Finance> = {}): Finance => ({
  base: 'SAR', dest: 'EUR', rate: 0.2439, kittyMode: 'FIXED', kittyTotal: 1000, paid: {}, contrib: {},
  group: [], sides: [], personalBudget: 0, personal: [], ...over,
});
const M = ['amir', 'majed', 'noura']; // amir holds the pot (trip owner)
const sum = (o: Record<string, number>) => Math.round(Object.values(o).reduce((a, v) => a + v, 0) * 100) / 100;
const r = (n: number) => Math.round(n * 100) / 100;

describe('FIXED kitty — exact dues and honest pot figures', () => {
  it('splits 1,000 ÷ 3 into halala-exact dues that add up to exactly 1,000', () => {
    expect(splitExact(1000, 3)).toEqual([333.34, 333.33, 333.33]);
    expect(splitExact(100, 4)).toEqual([25, 25, 25, 25]);
    const dues = perMemberDue(1000, M);
    expect(sum(dues)).toBe(1000);
    expect(dues.amir).toBe(333.34);
  });

  it('pot status: remaining is cash in hand (collected − spent), with uncollected and shortfall', () => {
    const f = base({ paid: { amir: true, majed: true }, group: [{ id: 'g1', desc: 'hotel', category: 'HOUSING', amount: 900, payerUid: POT_UID }] });
    const pot = potStatus(f, M);
    expect(pot.collected).toBe(666.67);
    expect(pot.spent).toBe(900);
    expect(pot.remaining).toBe(-233.33);
    expect(pot.uncollected).toBe(333.33);
    expect(pot.shortfall).toBe(233.33);
  });

  it('reviewer scenario: pot 1,000, 3 paid in, 1,100 spent from the pot → the 100 shortfall is split, not lost', () => {
    const f = base({ paid: { amir: true, majed: true, noura: true }, group: [{ id: 'g1', desc: 'hotel', category: 'HOUSING', amount: 1100, payerUid: POT_UID }] });
    const net = netByMember(f, M, 'amir');
    // Each paid 333.33 in (Amir carried the extra halala: 333.34) and owes a
    // 366.67 share → 33.34 each to the holder, who covered the 100 shortfall.
    expect(net).toEqual({ amir: 66.68, majed: -33.34, noura: -33.34 });
    expect(Math.abs(sum(net))).toBeLessThan(0.005);
    expect(settledLedger(f, M, 'amir').transfers).toEqual([{ from: 'majed', to: 'amir', amount: 33.34 }, { from: 'noura', to: 'amir', amount: 33.34 }]);
  });

  it('an expense a member paid out of pocket credits that member directly', () => {
    const f = base({
      paid: { amir: true, majed: true, noura: true },
      group: [
        { id: 'g1', desc: 'hotel', category: 'HOUSING', amount: 900, payerUid: POT_UID },  // pot: 300 each, all still have 33.33 in the pot (open → even)
        { id: 'g2', desc: 'taxi', category: 'TRANSPORT', amount: 90, payerUid: 'noura' }, // direct: 30 each → amir and majed owe noura 30
      ],
    });
    const net = netByMember(f, M, 'amir');
    expect(net).toEqual({ amir: -30, majed: -30, noura: 60 });
    expect(settledLedger(f, M, 'amir').transfers).toEqual([{ from: 'amir', to: 'noura', amount: 30 }, { from: 'majed', to: 'noura', amount: 30 }]);
  });

  it('breakdown lines reconcile to the balance for the holder and a member', () => {
    const f = base({ paid: { amir: true, majed: true, noura: true }, group: [{ id: 'g1', desc: 'hotel', category: 'HOUSING', amount: 1100, payerUid: POT_UID }] });
    const amir = memberBreakdown(f, M, 'amir', 'amir');
    expect(amir.lines.map((l) => l.kind)).toEqual(['potIn', 'potSpend', 'potCredit', 'potRecv']);
    expect(r(amir.net)).toBe(66.67); // exact; the ledger rounds each 33.337 transfer up to 33.34 → 66.68 shown with a +0.01 rounding line
    const majed = memberBreakdown(f, M, 'majed', 'amir');
    expect(majed.lines.map((l) => l.kind)).toEqual(['potIn', 'potSpend']);
    expect(r(majed.net)).toBe(-33.34);
  });

  it('nothing spent and nothing paid in → nobody owes anybody yet', () => {
    expect(settledLedger(base(), M, 'amir').transfers).toEqual([]);
  });
});
