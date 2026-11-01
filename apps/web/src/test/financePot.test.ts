import { describe, it, expect } from 'vitest';
import { POT_UID, memberBreakdown, netByMember, potAccount, settledLedger, type Finance } from '@/features/expenses/finance';

const base = (over: Partial<Finance> = {}): Finance => ({
  base: 'SAR', dest: 'SAR', rate: 1, kittyMode: 'FIXED', kittyTotal: 1000, paid: {}, contrib: {},
  group: [], sides: [], personalBudget: 0, personal: [], ...over,
});
const r = (n: number) => Math.round(n * 100) / 100;

describe('pot money is shared, not a debt (user: "كلنا متساويين")', () => {
  it('two members each paid 500 into an untouched pot → nobody owes anybody', () => {
    const f = base({ paid: { me: true, friend: true } });
    const M = ['me', 'friend'];
    expect(settledLedger(f, M, 'me').transfers).toEqual([]);
    const acc = potAccount(f, M, 'me');
    expect(acc.balances).toEqual({ me: 500, friend: 500 });
    expect(acc.cash).toBe(1000);
    // Breakdowns reconcile to zero for both.
    expect(r(memberBreakdown(f, M, 'me', 'me').net)).toBe(0);
    expect(r(memberBreakdown(f, M, 'friend', 'me').net)).toBe(0);
  });

  it('pot underspent → still even while open; closing the pot refunds what is left', () => {
    const open = base({ paid: { me: true, friend: true }, group: [{ id: 'g', desc: 'dinner', category: 'FOOD', amount: 400, payerUid: POT_UID }] });
    const M = ['me', 'friend'];
    expect(settledLedger(open, M, 'me').transfers).toEqual([]);
    expect(potAccount(open, M, 'me').balances).toEqual({ me: 300, friend: 300 });
    const closed = { ...open, potClosed: true };
    expect(settledLedger(closed, M, 'me').transfers).toEqual([{ from: 'me', to: 'friend', amount: 300 }]);
    expect(r(memberBreakdown(closed, M, 'me', 'me').net)).toBe(-300);
    expect(r(memberBreakdown(closed, M, 'friend', 'me').net)).toBe(300);
  });

  it('overspent pot → the shortfall the holder covered is split (reviewer scenario)', () => {
    const f = base({ paid: { amir: true, majed: true, noura: true }, group: [{ id: 'g', desc: 'hotel', category: 'HOUSING', amount: 1100, payerUid: POT_UID }] });
    const M = ['amir', 'majed', 'noura'];
    expect(settledLedger(f, M, 'amir').transfers).toEqual([{ from: 'majed', to: 'amir', amount: 33.34 }, { from: 'noura', to: 'amir', amount: 33.34 }]);
    expect(r(memberBreakdown(f, M, 'amir', 'amir').net)).toBe(66.67); // exact 66.673; the ledger's two rounded 33.34s make 66.68 (shown as a +0.01 rounding line)
    expect(r(memberBreakdown(f, M, 'majed', 'amir').net)).toBe(-33.34);
  });

  it('a member who never paid in owes their share of the real spend; others stay even while open', () => {
    const f = base({ paid: { amir: true, majed: true }, group: [{ id: 'g', desc: 'car', category: 'TRANSPORT', amount: 600, payerUid: POT_UID }] });
    const M = ['amir', 'majed', 'noura'];
    expect(settledLedger(f, M, 'amir').transfers).toEqual([{ from: 'noura', to: 'amir', amount: 200 }]);
    const net = netByMember(f, M, 'amir');
    expect(net).toEqual({ amir: 200, majed: 0, noura: -200 });
    expect(r(memberBreakdown(f, M, 'amir', 'amir').net)).toBe(200);
    expect(r(memberBreakdown(f, M, 'majed', 'amir').net)).toBe(0);
  });

  it('holder who consumed more than they put in settles when the pot closes', () => {
    // amir never paid in; majed did; 400 spent from the pot (200 each).
    const f = base({ kittyTotal: 1000, paid: { majed: true }, group: [{ id: 'g', desc: 'x', category: 'OTHER', amount: 400, payerUid: POT_UID }] });
    const M = ['amir', 'majed'];
    expect(settledLedger(f, M, 'amir').transfers).toEqual([]);          // open: majed's 300 is in the pot
    expect(r(memberBreakdown(f, M, 'amir', 'amir').net)).toBe(0);
    const closed = { ...f, potClosed: true };
    expect(settledLedger(closed, M, 'amir').transfers).toEqual([{ from: 'amir', to: 'majed', amount: 300 }]);
    expect(r(memberBreakdown(closed, M, 'amir', 'amir').net)).toBe(-300);
  });

  it('an expense recorded as paid by the pot HOLDER counts as pot money (user: "دفعت 50")', () => {
    const f = base({ paid: { me: true, friend: true }, group: [{ id: 'g', desc: 'مطعم', category: 'FOOD', amount: 50, payerUid: 'me' }] });
    const M = ['me', 'friend'];
    expect(potAccount(f, M, 'me').spent).toBe(50);
    expect(potAccount(f, M, 'me').cash).toBe(950);
    expect(potAccount(f, M, 'me').balances).toEqual({ me: 475, friend: 475 });
    expect(settledLedger(f, M, 'me').transfers).toEqual([]);        // even — nobody owes anybody
    // Without a fixed pot the same record is an ordinary out-of-pocket expense.
    const open = { ...f, kittyMode: 'OPEN' as const, kittyTotal: 0 };
    expect(settledLedger(open, M, 'me').transfers).toEqual([{ from: 'friend', to: 'me', amount: 25 }]);
  });

  it('direct out-of-pocket expenses still settle pairwise alongside the pot', () => {
    const f = base({ paid: { me: true, friend: true }, group: [{ id: 'g', desc: 'taxi', category: 'TRANSPORT', amount: 90, payerUid: 'friend' }] });
    const M = ['me', 'friend'];
    expect(settledLedger(f, M, 'me').transfers).toEqual([{ from: 'me', to: 'friend', amount: 45 }]);
  });
});
