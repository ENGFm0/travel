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
  category?: Category;     // OPEN kitty: a shared expense among a subset
  receiptUrls?: string[];
}

/** Payer sentinel: the expense was paid FROM the fixed pot (by its holder, out
 *  of the money members put in). */
export const POT_UID = '__pot__';

export interface PersonalExpense {
  id: string;
  desc: string;
  amount: number;
}

export type KittyMode = 'FIXED' | 'OPEN';

/** Every change to the shared finance record, visible to all members. */
export type FinanceLogKind =
  | 'kittyTotal' | 'kittyMode' | 'paid' | 'unpaid' | 'currency' | 'potClose' | 'potReopen'
  | 'addGroup' | 'editGroup' | 'deleteGroup' | 'addSide' | 'deleteSide' | 'settleSide';
export interface FinanceLogEntry {
  id: string;
  at: string;       // ISO timestamp
  by: string;       // member uid
  kind: FinanceLogKind;
  desc?: string;    // expense description / mode / currency
  amount?: number;  // new amount
  prev?: number;    // previous amount (edits, total changes)
  uid?: string;     // affected member (paid / unpaid)
}

export interface Finance {
  base: string; // e.g. 'SAR'
  dest: string; // e.g. 'GBP'
  rate: number; // base → dest multiplier
  kittyMode?: KittyMode; // FIXED = set a total & split equally; OPEN = free contributions
  kittyTotal: number;
  paid: Record<string, boolean>; // memberUid → confirmed (FIXED mode)
  contrib?: Record<string, number>; // memberUid → amount contributed (OPEN mode)
  /** FIXED pot closed by the owner: what is left is refunded to those who
   *  still have money in it (until then, pot money is shared, not a debt). */
  potClosed?: boolean;
  group: GroupExpense[];
  sides: SideKitty[];
  personalBudget: number;
  personal: PersonalExpense[]; // current user's only (self-scoped, BR-007-003)
  log?: FinanceLogEntry[];
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

/** Split `total` into `count` halala-exact parts that sum to the total
 *  EXACTLY; the first parts get the extra halala (1,000 ÷ 3 → 333.34, 333.33,
 *  333.33). Used for amounts people actually transfer, so what the bank
 *  receives equals what the app records. */
export function splitExact(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = toCents(total);
  const base = Math.floor(cents / count);
  const rem = cents - base * count;
  return Array.from({ length: count }, (_, i) => fromCents(base + (i < rem ? 1 : 0)));
}

/** Per-member pot due (FR-007-001): halala-exact parts that sum to the total,
 *  in member order (the first member(s) carry the extra halala). */
export function perMemberDue(total: number, memberUids: string[]): Record<string, number> {
  const parts = splitExact(total, memberUids.length);
  const out: Record<string, number> = {};
  memberUids.forEach((u, i) => { out[u] = parts[i]; });
  return out;
}

/** Open-kitty collected = sum of free contributions (OPEN mode). */
export function contribCollected(contrib: Record<string, number> | undefined): number {
  const cents = Object.values(contrib ?? {}).reduce((a, v) => a + toCents(v || 0), 0);
  return fromCents(cents);
}

/** Kitty collected = sum of the (exact) dues of members confirmed paid. */
export function kittyCollected(total: number, memberUids: string[], paid: Record<string, boolean>): number {
  const dues = perMemberDue(total, memberUids);
  return fromCents(memberUids.reduce((acc, u) => acc + (paid[u] ? toCents(dues[u]) : 0), 0));
}

/** A FIXED kitty with an amount set. */
export const fixedKitty = (f: Finance) => (f.kittyMode ?? 'FIXED') === 'FIXED' && (f.kittyTotal || 0) > 0;

/** Pot status for a FIXED kitty.
 *  - due: the typical share; dues: each member's exact due (sum = total)
 *  - collected: what actually came in (confirmed dues)
 *  - spent: what was paid FROM the pot
 *  - remaining: cash actually in the pot = collected − spent (negative = the
 *    holder is out of pocket by that much)
 *  - uncollected: dues not yet paid in; shortfall: spent beyond what was
 *    collected (max 0) — the holder covered it and the settlement splits it. */
export interface PotStatus {
  total: number; due: number; dues: Record<string, number>; collected: number; spent: number;
  remaining: number; uncollected: number; shortfall: number;
}
export function potStatus(f: Finance, memberUids: string[]): PotStatus {
  const total = f.kittyTotal || 0;
  const dues = perMemberDue(total, memberUids);
  const due = memberUids.length ? Math.min(...memberUids.map((u) => dues[u])) : 0;
  const collected = kittyCollected(total, memberUids, f.paid);
  const spent = fromCents(f.group.filter((e) => e.payerUid === POT_UID).reduce((a, e) => a + toCents(e.amount), 0));
  return {
    total, due, dues, collected, spent,
    remaining: round2(collected - spent),
    uncollected: round2(total - collected),
    shortfall: Math.max(0, round2(spent - collected)),
  };
}

// ---------------------------------------------------------------------------
// The pot as an account. Each member's pot balance = what they put in − their
// equal share of what was spent from the pot (+ for the holder, whatever they
// covered out of pocket when the pot ran dry). Balances sum to the cash left
// in the pot.
//   balance < 0 → that member consumed more than they put in: they owe the pot
//                 (i.e. they pay the holder) — always a debt.
//   balance > 0 → their money is still in the pot: shared, NOT a debt. Only
//                 when the owner CLOSES the pot is it refunded by the holder.
// So two people who each paid 500 into an untouched pot are simply even.
// ---------------------------------------------------------------------------

export interface PotAccount {
  active: boolean;                     // a pot is in play (FIXED with a total, or pot-paid expenses)
  balances: Record<string, number>;    // exact, per member
  cash: number;                        // max(0, collected − spent) — what's physically left
  spent: number; collected: number; shortfall: number;
}
export function potAccount(f: Finance, memberUids: string[], holderUid?: string): PotAccount {
  const n = memberUids.length;
  const p = potStatus(f, memberUids);
  const active = Boolean(holderUid) && (fixedKitty(f) || p.spent > 0);
  const balances: Record<string, number> = {};
  if (!active) {
    for (const u of memberUids) balances[u] = 0;
    return { active, balances, cash: 0, spent: p.spent, collected: p.collected, shortfall: 0 };
  }
  const shareOfSpend = exactShare(p.spent, n);
  for (const u of memberUids) {
    balances[u] = (f.paid[u] ? p.dues[u] : 0) - shareOfSpend + (u === holderUid ? p.shortfall : 0);
  }
  return { active, balances, cash: Math.max(0, round2(p.collected - p.spent)), spent: p.spent, collected: p.collected, shortfall: p.shortfall };
}

/** What the pot contributes to a member's settlement net (exact).
 *  Member: a negative balance is owed to the holder; a positive one is owed
 *  back only once the pot is closed. Holder: the mirror of everyone else. */
function potPartExact(f: Finance, memberUids: string[], me: string, holderUid?: string): number {
  const acc = potAccount(f, memberUids, holderUid);
  if (!acc.active || !holderUid) return 0;
  const part = (u: string) => {
    const b = acc.balances[u] ?? 0;
    return b < 0 ? b : (f.potClosed ? b : 0);
  };
  if (me !== holderUid) return memberUids.includes(me) ? part(me) : 0;
  return -memberUids.filter((u) => u !== holderUid).reduce((a, u) => a + part(u), 0);
}

/** Spend distribution by category (FR-007-003) — shared expenses of everyone
 *  (group) and of subsets (sides with a category). */
export function distribution(group: GroupExpense[], sides: SideKitty[] = []): Record<Category, number> {
  const out: Record<Category, number> = { HOUSING: 0, FOOD: 0, TRANSPORT: 0, OTHER: 0 };
  let cents: Record<Category, number> = { HOUSING: 0, FOOD: 0, TRANSPORT: 0, OTHER: 0 };
  for (const e of group) cents[e.category] += toCents(e.amount);
  for (const s of sides) if (s.category) cents[s.category] += toCents(s.total);
  (Object.keys(out) as Category[]).forEach((c) => { out[c] = fromCents(cents[c]); });
  return out;
}

/** Exact net from group expenses members paid DIRECTLY (out of pocket) for
 *  everyone: (what I paid) − (my share of each). Pot-paid expenses are
 *  handled by the pot account, not here. */
function directNetExact(group: GroupExpense[], memberUids: string[], me: string): number {
  const n = memberUids.length;
  const inGroup = memberUids.includes(me);
  let net = 0;
  for (const e of group) {
    if (e.payerUid === POT_UID) continue;
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

/** My net from directly-paid group expenses (rounded for display). */
export function groupNet(group: GroupExpense[], memberUids: string[], me: string): number {
  return round2(directNetExact(group, memberUids, me));
}

/** My net from side kitties (rounded for display). */
export function sideNet(sides: SideKitty[], me: string): number {
  return round2(sideNetExact(sides, me));
}

/** Exact (unrounded) net per member: direct shared spend + pot position +
 *  side kitties. */
export function netByMemberExact(f: Finance, memberUids: string[], holderUid?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of memberUids) {
    out[u] = directNetExact(f.group, memberUids, u) + potPartExact(f, memberUids, u, holderUid) + sideNetExact(f.sides, u);
  }
  return out;
}

export interface Settlement { from: string; to: string; amount: number }
export interface Ledger { transfers: Settlement[]; net: Record<string, number> }

/** Exact pairwise debts: debts[a][b] = what a owes b, after netting each pair
 *  (if a owes b 10 and b owes a 4, a owes b 6). Built from who actually paid:
 *  every participant owes the payer their share; the pot is settled through
 *  its holder (see potAccount). */
export function pairwiseDebts(f: Finance, memberUids: string[], holderUid?: string): Record<string, Record<string, number>> {
  const owe = new Map<string, number>(); // `${from}|${to}` → amount
  const add = (from: string, to: string, amt: number) => {
    if (from === to || amt === 0) return;
    const k = `${from}|${to}`;
    owe.set(k, (owe.get(k) ?? 0) + amt);
  };
  const n = memberUids.length;
  for (const e of f.group) {
    if (e.payerUid === POT_UID) continue; // through the pot account below
    const share = exactShare(e.amount, n);
    for (const u of memberUids) add(u, e.payerUid, share);
  }
  const acc = potAccount(f, memberUids, holderUid);
  if (acc.active && holderUid) {
    for (const u of memberUids) {
      if (u === holderUid) continue;
      const b = acc.balances[u] ?? 0;
      if (b < 0) add(u, holderUid, -b);                 // consumed more than put in → pays the holder
      else if (f.potClosed && b > 0) add(holderUid, u, b); // pot closed → holder refunds what's left
    }
  }
  for (const s of f.sides) {
    if (s.settled) continue;
    const share = exactShare(s.total, s.participantUids.length);
    for (const u of s.participantUids) add(u, s.payerUid, share);
  }
  const out: Record<string, Record<string, number>> = {};
  const done = new Set<string>();
  for (const [k, v] of owe) {
    if (done.has(k)) continue;
    const [a, b] = k.split('|');
    const rk = `${b}|${a}`;
    done.add(k); done.add(rk);
    const net = v - (owe.get(rk) ?? 0);
    if (Math.abs(net) < 1e-9) continue;
    const [from, to, amt] = net > 0 ? [a, b, net] : [b, a, -net];
    (out[from] ??= {})[to] = amt;
  }
  return out;
}

/** DIRECT settlement — the default: everyone pays whoever paid for them
 *  (pairs netted), each transfer rounded to the halala. Balances are DERIVED
 *  from these rounded transfers, so the per-person rows and "who pays whom"
 *  agree to the halala and sum to exactly zero by construction; identical
 *  participation yields identical transfers and rows. Transfers are listed
 *  grouped by payee (largest payee first), largest amount first. */
export function settledLedger(f: Finance, memberUids: string[], holderUid?: string): Ledger {
  const debts = pairwiseDebts(f, memberUids, holderUid);
  const transfers: Settlement[] = [];
  const netC: Record<string, number> = {};
  for (const u of memberUids) netC[u] = 0;
  for (const [from, tos] of Object.entries(debts)) {
    for (const [to, amt] of Object.entries(tos)) {
      const c = Math.round(amt * 100 + 1e-9);
      if (c <= 0) continue;
      transfers.push({ from, to, amount: c / 100 });
      netC[from] = (netC[from] ?? 0) - c;
      netC[to] = (netC[to] ?? 0) + c;
    }
  }
  const inflow: Record<string, number> = {};
  for (const t of transfers) inflow[t.to] = (inflow[t.to] ?? 0) + t.amount;
  transfers.sort((a, b) => (inflow[b.to] - inflow[a.to]) || a.to.localeCompare(b.to) || (b.amount - a.amount));
  const net: Record<string, number> = {};
  for (const u of memberUids) net[u] = (netC[u] ?? 0) / 100;
  return { transfers, net };
}

/** Settled balance per member (whole halalas, zero-sum — see settledLedger).
 *  Positive → owed to them (له), negative → they owe (عليه). */
export function netByMember(f: Finance, memberUids: string[], holderUid?: string): Record<string, number> {
  return settledLedger(f, memberUids, holderUid).net;
}

/** My overall net balance — the same settled figure as my row. Sign per
 *  BR-007-005: positive = owed to me (لك), negative = I owe (عليك). */
export function myNetBalance(f: Finance, memberUids: string[], me: string, holderUid?: string): number {
  if (!memberUids.includes(me)) return round2(directNetExact(f.group, memberUids, me) + sideNetExact(f.sides, me));
  return netByMember(f, memberUids, holderUid)[me] ?? 0;
}

/** MINIMAL settlement (optional view): fewest transfers that reproduce the
 *  settled nets, in integer halalas — a debtor may end up paying someone who
 *  never paid for them (debts are routed), which is why it is not the default.
 *  Each debtor, largest first, pays a creditor who can absorb the whole
 *  remaining debt when one exists, else the largest creditor. */
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
  /** group: shared expenses members paid directly · side: an unsettled subset
   *  expense · potIn: what this member put into the pot (counts as paid) ·
   *  potSpend: equal share of what was spent from the pot (the holder's
   *  `paid` here is any shortfall they covered) · potCredit: this member's
   *  money still in the pot (shared, not a debt — zeroes a positive balance
   *  while the pot is open; the holder always keeps their own) · potOver:
   *  the holder consumed more than they put in (settled when the pot closes)
   *  · potRecv: what the holder collects from members who overdrew the pot ·
   *  potCash: pot closed — the cash left, refunded by the holder. */
  kind: 'group' | 'side' | 'potIn' | 'potSpend' | 'potCredit' | 'potOver' | 'potRecv' | 'potCash';
  label: string;   // side title ('' otherwise)
  total: number;   // what was spent / contributed
  count: number;   // people it is split across
  share: number;   // this member's exact share (what counts against them)
  paid: number;    // what counts for them
}
export interface MemberBreakdown { lines: BreakdownLine[]; paid: number; share: number; net: number }

/** Line-by-line derivation of one member's balance (so every number can be
 *  checked by hand). net = paid − share, and matches the settled net before
 *  halala rounding. */
export function memberBreakdown(f: Finance, memberUids: string[], u: string, holderUid?: string): MemberBreakdown {
  const lines: BreakdownLine[] = [];
  const n = memberUids.length;
  const inGroup = memberUids.includes(u);
  const direct = f.group.filter((e) => e.payerUid !== POT_UID);
  const directTotal = direct.reduce((a, e) => a + e.amount, 0);
  const directPaid = direct.filter((e) => e.payerUid === u).reduce((a, e) => a + e.amount, 0);
  if (directTotal > 0 || directPaid > 0) {
    lines.push({ kind: 'group', label: '', total: directTotal, count: n, share: inGroup ? exactShare(directTotal, n) : 0, paid: directPaid });
  }
  const acc = potAccount(f, memberUids, holderUid);
  if (acc.active && holderUid && inGroup) {
    const p = potStatus(f, memberUids);
    const isHolder = u === holderUid;
    if (f.paid[u]) lines.push({ kind: 'potIn', label: '', total: p.dues[u], count: n, share: 0, paid: p.dues[u] });
    if (p.spent > 0 || (isHolder && p.shortfall > 0)) {
      lines.push({ kind: 'potSpend', label: '', total: p.spent, count: n, share: exactShare(p.spent, n), paid: isHolder ? p.shortfall : 0 });
    }
    const b = acc.balances[u] ?? 0;
    if (isHolder) {
      if (f.potClosed) {
        if (acc.cash > 0) lines.push({ kind: 'potCash', label: '', total: acc.cash, count: n, share: acc.cash, paid: 0 });
      } else {
        if (b > 0) lines.push({ kind: 'potCredit', label: '', total: b, count: n, share: b, paid: 0 });
        if (b < 0) lines.push({ kind: 'potOver', label: '', total: -b, count: n, share: 0, paid: -b });
        const recv = memberUids.filter((m) => m !== u && (acc.balances[m] ?? 0) < 0).reduce((a, m) => a - (acc.balances[m] ?? 0), 0);
        if (recv > 0) lines.push({ kind: 'potRecv', label: '', total: recv, count: n, share: 0, paid: recv });
      }
    } else if (!f.potClosed && b > 0) {
      lines.push({ kind: 'potCredit', label: '', total: b, count: n, share: b, paid: 0 });
    }
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
