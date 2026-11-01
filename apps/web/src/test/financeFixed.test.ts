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

describe('FIXED kitty — settlement on what was actually spent', () => {
  it('splits 1,000 ÷ 3 into halala-exact dues that add up to exactly 1,000', () => {
    expect(splitExact(1000, 3)).toEqual([333.34, 333.33, 333.33]);
    expect(splitExact(100, 4)).toEqual([25, 25, 25, 25]);
    const dues = perMemberDue(1000, M);
    expect(sum(dues)).toBe(1000);
    expect(dues.amir).toBe(333.34);
  });

  it('reviewer scenario: pot 1,000, 3 paid in, 1,100 spent from the pot → the 100 shortfall is split, not lost', () => {
    const f = base({ paid: { amir: true, majed: true, noura: true }, group: [{ id: 'g1', desc: 'hotel', category: 'HOUSING', amount: 1100, payerUid: POT_UID }] });
    const pot = potStatus(f, M);
    expect(pot.collected).toBe(1000);
    expect(pot.spent).toBe(1100);
    expect(pot.remaining).toBe(-100);   // cash in hand, not total − spent
    expect(pot.shortfall).toBe(100);
    const net = netByMember(f, M, 'amir');
    // Each paid 333.33 in (Amir carried the extra halala: 333.34) and owes a
    // 366.67 share → 33.34 each to the holder, who covered the 100 shortfall.
    expect(net.amir).toBe(66.68);
    expect(net.majed).toBe(-33.34);
    expect(net.noura).toBe(-33.34);
    expect(Math.abs(sum(net))).toBeLessThan(0.005);
    const { transfers } = settledLedger(f, M, 'amir');
    expect(transfers).toEqual([{ from: 'majed', to: 'amir', amount: 33.34 }, { from: 'noura', to: 'amir', amount: 33.34 }]);
  });

  it('underspent pot → the holder refunds the difference', () => {
    const f = base({ paid: { amir: true, majed: true, noura: true }, group: [{ id: 'g1', desc: 'dinner', category: 'FOOD', amount: 700, payerUid: POT_UID }] });
    const net = netByMember(f, M, 'amir');
    expect(net.majed).toBe(100);       // paid 333.33 in, share 233.33
    expect(net.noura).toBe(100);
    expect(net.amir).toBe(-200);
    const { transfers } = settledLedger(f, M, 'amir');
    expect(transfers.map((t) => t.from)).toEqual(['amir', 'amir']);
  });

  it('a member who has not paid in owes their share of the ACTUAL spend, not the planned due', () => {
    const f = base({ paid: { amir: true, majed: true }, group: [{ id: 'g1', desc: 'car', category: 'TRANSPORT', amount: 600, payerUid: POT_UID }] });
    const net = netByMember(f, M, 'amir');
    expect(net.noura).toBe(-200);      // 600 ÷ 3, nothing paid in
    expect(net.majed).toBe(133.33);    // paid 333.33 in, share 200 → refund
    expect(net.amir).toBe(66.67);
  });

  it('an expense a member paid out of pocket credits that member, not the holder', () => {
    const f = base({
      paid: { amir: true, majed: true, noura: true },
      group: [
        { id: 'g1', desc: 'hotel', category: 'HOUSING', amount: 900, payerUid: POT_UID },
        { id: 'g2', desc: 'taxi', category: 'TRANSPORT', amount: 90, payerUid: 'noura' },
      ],
    });
    const net = netByMember(f, M, 'amir');
    // shares: 330 each. noura: paid 333.33 + 90 = 423.33 → +93.33; majed: +3.33; amir: 900 − 330 − 666.67 = −96.67
    expect(net.noura).toBe(93.33);
    expect(net.majed).toBe(3.33);
    expect(net.amir).toBe(-96.66);     // halala rounding lands on the holder (rows derive from rounded transfers)
    expect(Math.abs(sum(net))).toBeLessThan(0.005);
  });

  it('breakdown lines reconcile to the balance (paid − share) for the holder and a member', () => {
    const f = base({ paid: { amir: true, majed: true, noura: true }, group: [{ id: 'g1', desc: 'hotel', category: 'HOUSING', amount: 1100, payerUid: POT_UID }] });
    const amir = memberBreakdown(f, M, 'amir', 'amir');
    expect(amir.lines.map((l) => l.kind)).toEqual(['potSpend', 'potHeld']);
    expect(Math.round(amir.net * 100) / 100).toBe(66.67);
    const majed = memberBreakdown(f, M, 'majed', 'amir');
    expect(majed.lines.map((l) => l.kind)).toEqual(['potSpend', 'potIn']);
    expect(Math.round(majed.net * 100) / 100).toBe(-33.34); // exact −33.333…; display rounds, the ledger row shows −33.33
  });

  it('nothing spent and nothing paid in → nobody owes anybody yet', () => {
    const f = base();
    expect(settledLedger(f, M, 'amir').transfers).toEqual([]);
  });
});
