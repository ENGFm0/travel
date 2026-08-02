/* =========================================================
   settle.js — حساب الأرصدة والتسوية بأقل عدد تحويلات
   ========================================================= */

/* يقرّب لأقرب هللتين */
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * يحسب رصيد كل عضو:
 *   موجب  = له (دفع أكثر من نصيبه)
 *   سالب  = عليه (نصيبه أكثر مما دفع)
 * القطّة الشخصية (personal) لا تدخل التسوية — تخص صاحبها فقط.
 */
export function computeBalances(trip) {
  const bal = {};
  trip.members.forEach(m => { bal[m.id] = 0; });

  trip.expenses.forEach(e => {
    if (e.type === 'personal') return; // خارج القطة، لا تُقسّم

    // من يشارك في هذه القطّة
    let shareIds;
    if (e.type === 'group') {
      shareIds = trip.members.map(m => m.id);
    } else { // some
      shareIds = e.sharedAmong.length ? e.sharedAmong : [e.paidBy];
    }
    if (shareIds.length === 0) return;

    const per = e.amount / shareIds.length;

    // الدافع دفع كامل المبلغ
    if (bal[e.paidBy] !== undefined) bal[e.paidBy] += e.amount;
    // كل مشارك عليه نصيبه
    shareIds.forEach(id => { if (bal[id] !== undefined) bal[id] -= per; });
  });

  Object.keys(bal).forEach(k => { bal[k] = r2(bal[k]); });
  return bal;
}

/**
 * يحوّل الأرصدة إلى أقل عدد تحويلات (greedy debt settlement).
 * يُرجع: [{ from, to, amount }]
 */
export function settle(trip) {
  const bal = computeBalances(trip);

  const creditors = []; // له
  const debtors = [];   // عليه
  Object.entries(bal).forEach(([id, v]) => {
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
    d.amt = r2(d.amt - pay);
    c.amt = r2(c.amt - pay);
    if (d.amt <= 0.009) i++;
    if (c.amt <= 0.009) j++;
  }
  return txns;
}

/* إجماليات مفيدة للواجهة */
export function tripTotals(trip) {
  let group = 0, some = 0, personal = 0;
  trip.expenses.forEach(e => {
    if (e.type === 'personal') personal += e.amount;
    else if (e.type === 'group') group += e.amount;
    else some += e.amount;
  });
  return {
    shared: r2(group + some),   // ضمن القطة (تُقسّم)
    group: r2(group),
    some: r2(some),
    personal: r2(personal),     // خارج القطة
    all: r2(group + some + personal),
  };
}
