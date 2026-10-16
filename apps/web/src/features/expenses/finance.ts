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
  receiptUrl?: string;     // legacy single receipt
  receiptUrls?: string[];  // one or more receipt/invoice photos
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

export type KittyMode = 'FIXED' | 'OPEN';

export interface Finance {
  base: string; // e.g. 'SAR'
  dest: string; // e.g. 'GBP'
  rate: number; // base → dest multiplier
  kittyMode?: KittyMode; // FIXED = set a total & split equally; OPEN = free contributions
  kittyTotal: number;
  paid: Record<string, boolean>; // memberUid → confirmed (FIXED mode)
  contrib?: Record<string, number>; // memberUid → amount contributed (OPEN mode)
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

// ---------------------------------------------------------------------------
// Exact accounting. Balances are computed with exact (unrounded) shares and
// rounded ONCE, at the very end, to the halala. Rounding each share first and
// dumping the remainder on "the last participant" (what splitEqual does) made
// two people with identical participation show different amounts
// (e.g. 240.47 vs 240.49) — unacceptable for a settlement.
// ---------------------------------------------------------------------------

/** Round to 2 decimals, half away from zero. */
export const round2 = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) / 100;

/** Exact equal share (unrounded). Display rounds; the math never does. */
export const exactShare = (total: number, count: number) => (count > 0 ? total / count : 0);

/** Per-member kitty due (equal split, FR-007-001) — exact. */
export function perMemberDue(total: number, memberUids: string[]): Record<string, number> {
  const share = exactShare(total, memberUids.length);
  const out: Record<string, number> = {};
  memberUids.forEach((u) => { out[u] = share; });
  return out;
}

/** Open-kitty collected = sum of free contributions (OPEN mode). */
export function contribCollected(contrib: Record<string, number> | undefined): number {
  const cents = Object.values(contrib ?? {}).reduce((a, v) => a + toCents(v || 0), 0);
  return fromCents(cents);
}

/** Kitty collected = sum of dues for members the owner has confirmed paid. */
export function kittyCollected(total: number, memberUids: string[], paid: Record<string, boolean>): number {
  const share = exactShare(total, memberUids.length);
  return round2(memberUids.reduce((acc, u) => acc + (paid[u] ? share : 0), 0));
}

/** Group-spend distribution by category (FR-007-003). */
export function distribution(group: GroupExpense[]): Record<Category, number> {
  const out: Record<Category, number> = { HOUSING: 0, FOOD: 0, TRANSPORT: 0, OTHER: 0 };
  let cents: Record<Category, number> = { HOUSING: 0, FOOD: 0, TRANSPORT: 0, OTHER: 0 };
  for (const e of group) cents[e.category] += toCents(e.amount);
  (Object.keys(out) as Category[]).forEach((c) => { out[c] = fromCents(cents[c]); });
  return out;
}

/** Exact net from group expenses split equally across all members:
 *  (what I paid) − (my share of each expense). Positive → owed to me. */
function groupNetExact(group: GroupExpense[], memberUids: string[], me: string): number {
  const n = memberUids.length;
  const inGroup = memberUids.includes(me);
  let net = 0;
  for (const e of group) {
    if (e.payerUid === me) net += e.amount;
    if (inGroup) net -= exactShare(e.amount, n);
  }
  return net;
}

/** Exact net from side kitties: the payer is credited the full amount, every
 *  participant (payer included) owes an equal share (BR-007-002). Settled
 *  kitties are already squared up and don't count. */
function sideNetExact(sides: SideKitty[], me: string): number {
  let net = 0;
  for (const s of sides) {
    if (s.settled) continue;
    if (s.payerUid === me) net += s.total;
    if (s.participantUids.includes(me)) net -= exactShare(s.total, s.participantUids.length);
  }
  return net;
}

/** My net from group expenses (rounded for display). */
export function groupNet(group: GroupExpense[], memberUids: string[], me: string): number {
  return round2(groupNetExact(group, memberUids, me));
}

/** My net from side kitties (rounded for display). */
export function sideNet(sides: SideKitty[], me: string): number {
  return round2(sideNetExact(sides, me));
}

/** Exact (unrounded) net per member. */
export function netByMemberExact(f: Finance, memberUids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of memberUids) out[u] = groupNetExact(f.group, memberUids, u) + sideNetExact(f.sides, u);
  return out;
}

/** The balances that are actually SETTLED: whole halalas that sum to exactly
 *  zero, so "who pays whom" reproduces every row to the halala. Each exact net
 *  is rounded; the halalas missing/extra (fractions like 1/7 never round to a
 *  zero sum) are assigned by largest remainder — to whole groups of identical
 *  balances at once (so identical participation stays identical), biggest
 *  balance first; if that can't absorb the rest, the single largest unique
 *  balance takes it. Positive → owed to them (له), negative → they owe (عليه). */
export function netByMember(f: Finance, memberUids: string[]): Record<string, number> {
  const exact = netByMemberExact(f, memberUids);
  const rows = memberUids.map((u) => {
    const ec = exact[u] * 100;
    return { u, ec, c: Math.sign(ec) * Math.round(Math.abs(ec) + 1e-9) };
  });
  let diff = -rows.reduce((a, r) => a + r.c, 0); // halalas to add to reach a zero sum
  if (diff !== 0) {
    const dir = Math.sign(diff);
    let remaining = Math.abs(diff);
    // Group members by identical exact balance.
    const groups = new Map<number, typeof rows>();
    for (const r of rows) { const k = Math.round(r.ec * 1e4); const g = groups.get(k) ?? []; g.push(r); groups.set(k, g); }
    const ordered = [...groups.values()].sort((a, b) => {
      const ra = dir * (a[0].ec - a[0].c), rb = dir * (b[0].ec - b[0].c); // remainder in the needed direction
      if (Math.abs(ra - rb) > 1e-9) return rb - ra;
      return Math.abs(b[0].ec) - Math.abs(a[0].ec);
    });
    for (const g of ordered) {
      if (remaining === 0) break;
      if (g.length <= remaining) { for (const r of g) r.c += dir; remaining -= g.length; }
    }
    if (remaining > 0) {
      const single = ordered.find((g) => g.length === 1) ?? ordered[0];
      single[0].c += dir * remaining;
    }
  }
  const out: Record<string, number> = {};
  for (const r of rows) out[r.u] = r.c / 100;
  return out;
}

/** My overall net balance — the same settled figure as my row. Sign per
 *  BR-007-005: positive = owed to me (لك), negative = I owe (عليك). */
export function myNetBalance(f: Finance, memberUids: string[], me: string): number {
  if (!memberUids.includes(me)) return round2(groupNetExact(f.group, memberUids, me) + sideNetExact(f.sides, me));
  return netByMember(f, memberUids)[me] ?? 0;
}

export interface Settlement { from: string; to: string; amount: number }

/** "Who pays whom" from the settled (zero-sum, whole-halala) nets, in integer
 *  halalas — so each debtor's transfers add up to exactly their row and each
 *  creditor receives exactly theirs. Each debtor, largest first, pays a
 *  creditor who can absorb the whole remaining debt when one exists (fewest
 *  split payments), else the largest creditor. */
export function settlements(net: Record<string, number>): Settlement[] {
  const toC = (v: number) => Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-9);
  const debtors = Object.entries(net).map(([u, v]) => ({ u, c: -toC(v) })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
  const creditors = Object.entries(net).map(([u, v]) => ({ u, c: toC(v) })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
  const res: Settlement[] = [];
  for (const d of debtors) {
    let guard = 0;
    while (d.c > 0 && guard++ < 64) {
      const open = creditors.filter((c) => c.c > 0);
      if (open.length === 0) break;
      const fit = open.filter((c) => c.c >= d.c).sort((a, b) => a.c - b.c)[0];
      const c = fit ?? open[0];
      const pay = Math.min(d.c, c.c);
      res.push({ from: d.u, to: c.u, amount: pay / 100 });
      d.c -= pay; c.c -= pay;
    }
  }
  return res;
}

export interface BreakdownLine {
  kind: 'group' | 'side';
  label: string;   // side title ('' for the group pot)
  total: number;   // what was spent
  count: number;   // people it is split across
  share: number;   // this member's exact share (0 if not a participant)
  paid: number;    // what this member paid towards it
}
export interface MemberBreakdown { lines: BreakdownLine[]; paid: number; share: number; net: number }

/** Line-by-line derivation of one member's balance (so every number can be
 *  checked by hand): group pot, then each unsettled side kitty they're in. */
export function memberBreakdown(f: Finance, memberUids: string[], u: string): MemberBreakdown {
  const lines: BreakdownLine[] = [];
  const n = memberUids.length;
  const groupTotal = f.group.reduce((a, e) => a + e.amount, 0);
  const groupPaid = f.group.filter((e) => e.payerUid === u).reduce((a, e) => a + e.amount, 0);
  if (groupTotal > 0 || groupPaid > 0) {
    lines.push({ kind: 'group', label: '', total: groupTotal, count: n, share: memberUids.includes(u) ? exactShare(groupTotal, n) : 0, paid: groupPaid });
  }
  for (const s of f.sides) {
    if (s.settled) continue;
    const part = s.participantUids.includes(u), payer = s.payerUid === u;
    if (!part && !payer) continue;
    lines.push({ kind: 'side', label: s.title, total: s.total, count: s.participantUids.length, share: part ? exactShare(s.total, s.participantUids.length) : 0, paid: payer ? s.total : 0 });
  }
  const paid = lines.reduce((a, l) => a + l.paid, 0);
  const share = lines.reduce((a, l) => a + l.share, 0);
  return { lines, paid, share, net: paid - share };
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
