import { describe, it, expect } from 'vitest';
import {
  splitEqual, perMemberDue, kittyCollected, distribution, groupNet, sideNet,
  myNetBalance, personalSpent, personalRemaining, convert,
  netByMember, netByMemberExact, settlements, memberBreakdown,
  type Finance, type GroupExpense, type SideKitty,
} from '@/features/expenses/finance';

const M = ['a', 'b', 'c'];

describe('US-007 finance core', () => {
  it('splits equally, last participant absorbs the remainder (BR-007-002)', () => {
    expect(splitEqual(600, 3)).toEqual([200, 200, 200]);
    expect(splitEqual(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(splitEqual(0, 3)).toEqual([0, 0, 0]);
  });

  it('per-member kitty due is total / members (AC1)', () => {
    expect(perMemberDue(4500, M)).toEqual({ a: 1500, b: 1500, c: 1500 });
  });

  it('collected sums only owner-confirmed dues (AC1/AC2)', () => {
    expect(kittyCollected(4500, M, { a: true })).toBe(1500);
    expect(kittyCollected(4500, M, { a: true, b: true, c: true })).toBe(4500);
    expect(kittyCollected(4500, M, {})).toBe(0);
  });

  it('distributes group spend by category', () => {
    const group: GroupExpense[] = [
      { id: '1', desc: 'hotel', category: 'HOUSING', amount: 800, payerUid: 'a' },
      { id: '2', desc: 'lunch', category: 'FOOD', amount: 120, payerUid: 'b' },
      { id: '3', desc: 'dinner', category: 'FOOD', amount: 80, payerUid: 'a' },
    ];
    expect(distribution(group)).toEqual({ HOUSING: 800, FOOD: 200, TRANSPORT: 0, OTHER: 0 });
  });

  it('group net = paid − fair share (positive → owed to me)', () => {
    const group: GroupExpense[] = [{ id: '1', desc: 'x', category: 'OTHER', amount: 300, payerUid: 'a' }];
    expect(groupNet(group, M, 'a')).toBe(200); // paid 300, share 100
    expect(groupNet(group, M, 'b')).toBe(-100); // owes share
  });

  it('side net credits the payer and debits participants (AC3)', () => {
    const sides: SideKitty[] = [{ id: 's', title: 'taxi', participantUids: ['a', 'b', 'c'], total: 600, payerUid: 'a', settled: false }];
    expect(sideNet(sides, 'a')).toBe(400); // 600 − own 200
    expect(sideNet(sides, 'b')).toBe(-200);
    expect(sideNet(sides, 'x')).toBe(0); // not a participant
  });

  it('overall net balance combines group + side (AC6)', () => {
    const f = {
      base: 'SAR', dest: 'GBP', rate: 0.2122, kittyTotal: 0, paid: {},
      group: [{ id: '1', desc: 'x', category: 'OTHER', amount: 300, payerUid: 'a' }],
      sides: [{ id: 's', title: 't', participantUids: ['a', 'b'], total: 100, payerUid: 'b', settled: false }],
      personalBudget: 0, personal: [],
    } satisfies Finance;
    // group: a paid 300, share 100 → +200; side: a owes 50 → −50 ⇒ +150
    expect(myNetBalance(f, M, 'a')).toBe(150);
  });

  it('is exact: identical participation → identical nets, nets sum to 0, transfers settle everyone', () => {
    // Real scenario: 7 members, a group pot of 664 (÷7), two side kitties ÷3
    // and two ÷5 with different payers.
    const U = ['khalid', 'abu', 'faisal', 'ziad', 'mutrafi', 'shibl', 'fahad'];
    const f: Finance = {
      base: 'SAR', dest: 'SAR', rate: 1, kittyTotal: 0, paid: {}, personalBudget: 0, personal: [],
      group: [
        { id: 'g1', desc: 'villa', category: 'HOUSING', amount: 564, payerUid: 'abu' },
        { id: 'g2', desc: 'snacks', category: 'FOOD', amount: 100, payerUid: 'abu' },
      ],
      sides: [
        { id: 's1', title: 'fuel', participantUids: ['abu', 'fahad', 'faisal'], total: 121, payerUid: 'abu', settled: false },
        { id: 's2', title: 'lunch', participantUids: ['abu', 'fahad', 'faisal'], total: 74, payerUid: 'abu', settled: false },
        { id: 's3', title: 'breakfast', participantUids: ['khalid', 'abu', 'faisal', 'shibl', 'fahad'], total: 40, payerUid: 'abu', settled: false },
        { id: 's4', title: 'dinner', participantUids: ['khalid', 'abu', 'faisal', 'shibl', 'fahad'], total: 363, payerUid: 'shibl', settled: false },
      ],
    };
    const exact = netByMemberExact(f, U);
    expect(Math.abs(Object.values(exact).reduce((a, b) => a + b, 0))).toBeLessThan(1e-9);
    expect(exact.faisal).toBeCloseTo(-240.457, 3); // −(664/7 + 121/3 + 74/3 + 8 + 72.6)
    expect(exact.abu).toBeCloseTo(658.543, 3);     // 569.143 + 80.667 + 49.333 + 32 − 72.6
    const net = netByMember(f, U);
    expect(net.faisal).toBe(net.fahad);   // same participation → same number (was 240.47 vs 240.49)
    expect(net.faisal).toBe(-240.46);
    expect(net.ziad).toBe(-94.86);
    expect(net.mutrafi).toBe(net.ziad);
    expect(net.khalid).toBe(-175.46);
    // Plain rounding leaves the table 2 halalas short; they go to the unique,
    // largest balances (the creditors here) so the settled table sums to 0.
    expect(net.abu).toBe(658.55);
    expect(net.shibl).toBe(187.55);
    expect(Math.abs(Math.round(Object.values(net).reduce((a, b) => a + b, 0) * 100))).toBe(0); // zero-sum (±0)
    // Transfers reproduce every row EXACTLY (what's above = what's below).
    const tr = settlements(net);
    for (const u of U) {
      const out = tr.filter((x) => x.from === u).reduce((a, x) => a + Math.round(x.amount * 100), 0);
      const inn = tr.filter((x) => x.to === u).reduce((a, x) => a + Math.round(x.amount * 100), 0);
      expect(inn - out).toBe(Math.round(net[u] * 100));
    }
    expect(myNetBalance(f, U, 'abu')).toBe(658.55); // the headline matches the row
    // Breakdown lists exactly the pots the member is in, with the right divisors.
    const b = memberBreakdown(f, U, 'faisal');
    expect(b.lines.map((l) => l.count)).toEqual([7, 3, 3, 5, 5]);
    expect(b.net).toBeCloseTo(-240.457, 3);
    // A settled side kitty drops out of the balance.
    const g = { ...f, sides: f.sides.map((s) => (s.id === 's4' ? { ...s, settled: true } : s)) };
    expect(netByMember(g, U).shibl).toBe(-102.86); // −94.857 − 8
  });

  it('personal spend and remaining', () => {
    const p = [{ id: '1', desc: 'a', amount: 40 }, { id: '2', desc: 'b', amount: 12.5 }];
    expect(personalSpent(p)).toBe(52.5);
    expect(personalRemaining(200, p)).toBe(147.5);
  });

  it('converts to destination currency by the trip rate (AC5)', () => {
    expect(convert(4500, true, 0.2122)).toBe(954.9);
    expect(convert(4500, false, 0.2122)).toBe(4500);
  });
});
