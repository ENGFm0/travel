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

/** Payer sentinel: the expense was paid FROM the fixed pot. Nobody is
 *  credited and nobody owes a share — it only draws the pot down. */
export const POT_UID = '__pot__';

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

/** A FIXED kitty with an amount set: contributions flow to the holder and
 *  pot-paid expenses are paid by the holder out of that money. */
export const fixedKitty = (f: Finance) => (f.kittyMode ?? 'FIXED') === 'FIXED' && (f.kittyTotal || 0) > 0;

/** Pot status for a FIXED kitty.
 *  - due: the typical share; dues: each member's exact due (sum = total)
 *  - collected: what actually came in (confirmed dues)
 *  - spent: what was paid FROM the pot
 *  - remaining: cash actually in hand = collected − spent (negative = the
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

/** Who economically paid an expense: a pot-paid expense was paid by the pot's
 *  holder out of the money members put in (nobody, for legacy data without a
 *  holder). */
const payerOf = (e: GroupExpense, holderUid?: string) => (e.payerUid === POT_UID ? holderUid : e.payerUid);

/** Exact net from group expenses split equally across ALL members, on what
 *  was ACTUALLY spent: (what I paid, pot-paid counting for the holder) −
 *  (my share of each expense). Positive → owed to me. */
function groupNetExact(group: GroupExpense[], memberUids: string[], me: string, holderUid?: string): number {
  const n = memberUids.length;
  const inGroup = memberUids.includes(me);
  let net = 0;
  for (const e of group) {
    if (payerOf(e, holderUid) === me) net += e.amount;
    if (inGroup) net -= exactShare(e.amount, n);
  }
  return net;
}

/** Exact net from pot contributions (FIXED kitty): a member who paid their due
 *  in is credited with it; the holder, who keeps the money, owes it back
 *  (their own contribution cancels out). */
function potNetExact(f: Finance, memberUids: string[], me: string, holderUid?: string): number {
  if (!fixedKitty(f) || !holderUid) return 0;
  const dues = perMemberDue(f.kittyTotal, memberUids);
  let net = 0;
  for (const u of memberUids) {
    if (u === holderUid || !f.paid[u]) continue;
    if (u === me) net += dues[u];
    if (me === holderUid) net -= dues[u];
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
export function groupNet(group: GroupExpense[], memberUids: string[], me: string, holderUid?: string): number {
  return round2(groupNetExact(group, memberUids, me, holderUid));
}

/** My net from side kitties (rounded for display). */
export function sideNet(sides: SideKitty[], me: string): number {
  return round2(sideNetExact(sides, me));
}

/** Exact (unrounded) net per member: actual spend shares − (what they paid
 *  directly + what they paid into the pot). */
export function netByMemberExact(f: Finance, memberUids: string[], holderUid?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of memberUids) {
    out[u] = groupNetExact(f.group, memberUids, u, holderUid) + potNetExact(f, memberUids, u, holderUid) + sideNetExact(f.sides, u);
  }
  return out;
}

export interface Settlement { from: string; to: string; amount: number }
export interface Ledger { transfers: Settlement[]; net: Record<string, number> }

/** Exact pairwise debts: debts[a][b] = what a owes b, after netting each pair
 *  (if a owes b 10 and b owes a 4, a owes b 6). Built from who actually paid:
 *  every participant of a pot owes the pot's payer their share. */
export function pairwiseDebts(f: Finance, memberUids: string[], holderUid?: string): Record<string, Record<string, number>> {
  const owe = new Map<string, number>(); // `${from}|${to}` → amount
  const add = (from: string, to: string, amt: number) => {
    if (from === to || amt === 0) return;
    const k = `${from}|${to}`;
    owe.set(k, (owe.get(k) ?? 0) + amt);
  };
  const n = memberUids.length;
  // Every member owes their share of each expense to whoever actually paid it;
  // a pot-paid expense was paid by the pot's holder (out of the pot money).
  for (const e of f.group) {
    const payer = payerOf(e, holderUid);
    if (!payer) continue; // legacy pot-paid data with no holder: nobody to credit
    const share = exactShare(e.amount, n);
    for (const u of memberUids) add(u, payer, share);
  }
  // FIXED kitty: money members put into the pot sits with the holder, who owes
  // it back — netted against the shares above, so if the pot was overspent each
  // member ends up owing the holder only the difference, and if it was
  // underspent the holder refunds it.
  if (fixedKitty(f) && holderUid) {
    const dues = perMemberDue(f.kittyTotal, memberUids);
    for (const u of memberUids) if (f.paid[u]) add(holderUid, u, dues[u]);
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
  if (!memberUids.includes(me)) return round2(groupNetExact(f.group, memberUids, me, holderUid) + sideNetExact(f.sides, me));
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
  /** group: shared expenses members paid directly · potSpend: expenses paid
   *  from the pot (by its holder) · potIn: what this member put into the pot
   *  (counts as paid) · potHeld: what the holder received into the pot from
   *  others (counts against them) · side: an unsettled subset expense. */
  kind: 'group' | 'side' | 'potSpend' | 'potIn' | 'potHeld';
  label: string;   // side title ('' otherwise)
  total: number;   // what was spent / contributed
  count: number;   // people it is split across (or contributors, for potHeld)
  share: number;   // this member's exact share (0 if not a participant)
  paid: number;    // what this member paid towards it
}
export interface MemberBreakdown { lines: BreakdownLine[]; paid: number; share: number; net: number }

/** Line-by-line derivation of one member's balance (so every number can be
 *  checked by hand): shared spend, pot spend, pot contributions, then each
 *  unsettled side kitty they're in. net = paid − share. */
export function memberBreakdown(f: Finance, memberUids: string[], u: string, holderUid?: string): MemberBreakdown {
  const lines: BreakdownLine[] = [];
  const n = memberUids.length;
  const inGroup = memberUids.includes(u);
  const direct = f.group.filter((e) => e.payerUid !== POT_UID);
  const fromPot = f.group.filter((e) => e.payerUid === POT_UID);
  const directTotal = direct.reduce((a, e) => a + e.amount, 0);
  const directPaid = direct.filter((e) => e.payerUid === u).reduce((a, e) => a + e.amount, 0);
  if (directTotal > 0 || directPaid > 0) {
    lines.push({ kind: 'group', label: '', total: directTotal, count: n, share: inGroup ? exactShare(directTotal, n) : 0, paid: directPaid });
  }
  const potTotal = fromPot.reduce((a, e) => a + e.amount, 0);
  if (potTotal > 0) {
    lines.push({ kind: 'potSpend', label: '', total: potTotal, count: n, share: inGroup ? exactShare(potTotal, n) : 0, paid: u === holderUid ? potTotal : 0 });
  }
  if (fixedKitty(f) && holderUid) {
    const dues = perMemberDue(f.kittyTotal, memberUids);
    if (u !== holderUid && inGroup && f.paid[u]) {
      lines.push({ kind: 'potIn', label: '', total: dues[u], count: n, share: 0, paid: dues[u] });
    }
    if (u === holderUid) {
      const payers = memberUids.filter((m) => m !== u && f.paid[m]);
      const held = payers.reduce((a, m) => a + dues[m], 0);
      if (payers.length) lines.push({ kind: 'potHeld', label: '', total: held, count: payers.length, share: held, paid: 0 });
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
