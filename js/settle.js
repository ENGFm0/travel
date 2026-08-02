/* =========================================================
   settle.js — حسابات القطة والميزانية والتسوية بين الأشخاص
   كل المبالغ بعملة الديار (home).
   ========================================================= */

const r2 = (n) => Math.round(n * 100) / 100;

/* ---------------- القطة (الصندوق) ---------------- */
export function poolStats(trip) {
  const parts = trip.pool.participantIds.filter(id => trip.members.some(m => m.id === id));
  const count = parts.length;
  const total = trip.pool.total || 0;
  const share = count ? total / count : 0;

  const paidIds = parts.filter(id => trip.members.find(m => m.id === id)?.qattahPaid);
  const collected = r2(share * paidIds.length);
  const spent = r2(trip.groupExpenses.reduce((s, e) => s + e.amount, 0));
  const remaining = r2(collected - spent);

  return {
    participants: parts,
    count,
    total: r2(total),
    share: r2(share),
    paidIds,
    pendingIds: parts.filter(id => !paidIds.includes(id)),
    collected,
    spent,
    remaining,
    fundedPct: total ? Math.min(100, Math.round((collected / total) * 100)) : 0,
  };
}

/* ---------------- ميزانية عضو ---------------- */
export function memberBudget(trip, memberId) {
  const m = trip.members.find(x => x.id === memberId);
  const budget = m && m.budget != null ? m.budget : null;
  const isParticipant = trip.pool.participantIds.includes(memberId);
  const ps = poolStats(trip);
  const qattahShare = isParticipant ? ps.share : 0;
  const personal = (trip.personalExpenses[memberId] || []);
  const personalSpent = r2(personal.reduce((s, e) => s + e.amount, 0));

  // صافي القطّات المشتركة لهذا العضو (+ له / - عليه)
  const shared = sharedNet(trip)[memberId] || 0;

  const remaining = budget == null ? null : r2(budget - qattahShare - personalSpent);
  return {
    budget, qattahShare, personalSpent, remaining,
    personalCount: personal.length,
    isParticipant,
    qattahPaid: !!m?.qattahPaid,
    sharedNet: r2(shared),
  };
}

/* ---------------- قطة مشتركة بين أشخاص ---------------- */
// تُقسّم بالتساوي على المشاركين؛ الدافع دفع الكل وكل مشارك عليه نصيبه
export function sharedNet(trip) {
  const net = {};
  trip.members.forEach(m => { net[m.id] = 0; });
  trip.sharedExpenses.forEach(e => {
    const parts = (e.participants || []).filter(id => net[id] !== undefined);
    if (!parts.length) return;
    const share = e.amount / parts.length;
    if (net[e.paidBy] !== undefined) net[e.paidBy] += e.amount;   // دفع الكل
    parts.forEach(id => { net[id] -= share; });                  // كل مشارك عليه نصيبه
  });
  Object.keys(net).forEach(k => net[k] = r2(net[k]));
  return net;
}

export function settleShared(trip) {
  const net = sharedNet(trip);
  const creditors = [], debtors = [];
  Object.entries(net).forEach(([id, v]) => {
    if (v > 0.009) creditors.push({ id, amt: v });
    else if (v < -0.009) debtors.push({ id, amt: -v });
  });
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);
  const txns = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j];
    const pay = r2(Math.min(d.amt, c.amt));
    if (pay > 0) txns.push({ from: d.id, to: c.id, amount: pay });
    d.amt = r2(d.amt - pay); c.amt = r2(c.amt - pay);
    if (d.amt <= 0.009) i++;
    if (c.amt <= 0.009) j++;
  }
  return txns;
}

export { r2 };
