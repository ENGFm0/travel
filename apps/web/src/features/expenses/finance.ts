// Pure financial calculations for US-007. All money math runs in integer cents
// to avoid floating-point drift; results are returned in major units. The real
// server is the source of truth (VR-007-*: never trust client sums) — this
// mirror keeps the UI responsive and is exhaustively unit-tested.

export type Category = 'HOUSING' | 'FOOD' | 'TRANSPORT' | 'OTHER';
export const CATEGORIES: Category[] = ['HOUSING', 'FOOD', 'TRANSPORT', 'OTHER'];

export interface GroupExpense {
  id: string;
  desc: string;
  category: Category;
  amount: number; // base currency, major units
  payerUid: string;
}

export interface SideKitty {
  id: string;
  title: string;
  participantUids: string[];
  total: number; // base currency
  payerUid: string;
  settled: boolean;
}

export interface PersonalExpense {
  id: string;
  desc: string;
  amount: number;
}

export interface Finance {
  base: string; // e.g. 'SAR'
  dest: string; // e.g. 'GBP'
  rate: number; // base → dest multiplier
  kittyTotal: number;
  paid: Record<string, boolean>; // memberUid → confirmed
  group: GroupExpense[];
  sides: SideKitty[];
  personalBudget: number;
  personal: PersonalExpense[]; // current user's only (self-scoped, BR-007-003)
}

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

/** Equal split with the LAST participant absorbing the rounding remainder
 *  (BR-007-002). Returns major-unit shares. */
export function splitEqual(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = toCents(total);
  const base = Math.floor(cents / count);
  const shares = Array<number>(count).fill(base);
  shares[count - 1] = cents - base * (count - 1); // last absorbs remainder
  return shares.map(fromCents);
}

/** Per-member kitty due (equal split, FR-007-001). */
export function perMemberDue(total: number, memberUids: string[]): Record<string, number> {
  const shares = splitEqual(total, memberUids.length);
  const out: Record<string, number> = {};
  memberUids.forEach((u, i) => { out[u] = shares[i] ?? 0; });
  return out;
}

/** Kitty collected = sum of dues for members the owner has confirmed paid. */
export function kittyCollected(total: number, memberUids: string[], paid: Record<string, boolean>): number {
  const dues = perMemberDue(total, memberUids);
  const cents = memberUids.reduce((acc, u) => acc + (paid[u] ? toCents(dues[u] ?? 0) : 0), 0);
  return fromCents(cents);
}

/** Group-spend distribution by category (FR-007-003). */
export function distribution(group: GroupExpense[]): Record<Category, number> {
  const out: Record<Category, number> = { HOUSING: 0, FOOD: 0, TRANSPORT: 0, OTHER: 0 };
  let cents: Record<Category, number> = { HOUSING: 0, FOOD: 0, TRANSPORT: 0, OTHER: 0 };
  for (const e of group) cents[e.category] += toCents(e.amount);
  (Object.keys(out) as Category[]).forEach((c) => { out[c] = fromCents(cents[c]); });
  return out;
}

/** My net from a set of group expenses split equally across all members.
 *  net = (what I paid) − (my fair share). Positive → owed to me. */
export function groupNet(group: GroupExpense[], memberUids: string[], me: string): number {
  const myIdx = memberUids.indexOf(me);
  let cents = 0;
  for (const e of group) {
    if (e.payerUid === me) cents += toCents(e.amount);
    if (myIdx >= 0) {
      const shares = splitEqual(e.amount, memberUids.length);
      cents -= toCents(shares[myIdx] ?? 0);
    }
  }
  return fromCents(cents);
}

/** My net from side kitties: payer is owed the others' shares; a non-payer
 *  participant owes their share (BR-007-002). Positive → owed to me. */
export function sideNet(sides: SideKitty[], me: string): number {
  let cents = 0;
  for (const s of sides) {
    const idx = s.participantUids.indexOf(me);
    if (idx < 0) continue;
    const shares = splitEqual(s.total, s.participantUids.length);
    const myShare = toCents(shares[idx] ?? 0);
    if (s.payerUid === me) cents += toCents(s.total) - myShare; // others owe me
    else cents -= myShare; // I owe the payer
  }
  return fromCents(cents);
}

/** My overall net balance (group + side). Sign per BR-007-005:
 *  positive = owed to me (لك), negative = I owe (عليك). */
export function myNetBalance(f: Finance, memberUids: string[], me: string): number {
  return fromCents(toCents(groupNet(f.group, memberUids, me)) + toCents(sideNet(f.sides, me)));
}

export function personalSpent(personal: PersonalExpense[]): number {
  return fromCents(personal.reduce((a, e) => a + toCents(e.amount), 0));
}

export function personalRemaining(budget: number, personal: PersonalExpense[]): number {
  return fromCents(toCents(budget) - toCents(personalSpent(personal)));
}

/** Display conversion: base amount → chosen currency (display-only, BR-007-004). */
export function convert(amountBase: number, toDest: boolean, rate: number): number {
  return toDest ? fromCents(Math.round(amountBase * rate * 100)) : amountBase;
}
