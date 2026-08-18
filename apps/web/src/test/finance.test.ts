import { describe, it, expect } from 'vitest';
import {
  splitEqual, perMemberDue, kittyCollected, distribution, groupNet, sideNet,
  myNetBalance, personalSpent, personalRemaining, convert,
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
