/* =========================================================
   app.js — رِفقة: قطة القروب + الميزانية الشخصية + قطة بين شخصين
   ========================================================= */
import * as db from './store.js';
import { poolStats, memberBudget, pairNet, settlePairs } from './settle.js';
import { icons, catList, catIcon } from './icons.js';

/* ---------------- أدوات ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const headerActions = $('#headerActions');
const modalRoot = $('#modalRoot');

const CUR = {
  SAR: 'ر.س', AED: 'د.إ', KWD: 'د.ك', BHD: 'د.ب', QAR: 'ر.ق', OMR: 'ر.ع',
  TRY: '₺', USD: '$', EUR: '€', GBP: '£', EGP: 'ج.م', MYR: 'RM', THB: '฿',
  IDR: 'Rp', JPY: '¥', GEL: '₾', AZN: '₼', MVR: '.ރ', MAD: 'د.م', CHF: 'Fr',
};
const curLabel = (c) => CUR[c] || c;

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const round2 = (n) => Math.round(n * 100) / 100;

const money = (nHome, t) => `${nf.format(round2(nHome))} ${curLabel(t.homeCurrency)}`;
const inDest = (nHome, t) => `${nf.format(round2(nHome * (t.rate || 1)))} ${curLabel(t.destCurrency)}`;
const dual = (nHome, t) =>
  `<span class="dual"><span class="dual-h">${money(nHome, t)}</span><span class="dual-d">≈ ${inDest(nHome, t)}</span></span>`;

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function initials(name) {
  const p = name.trim().split(/\s+/);
  return (p[0]?.[0] || '') + (p[1]?.[0] || '');
}
function avatar(m, size) {
  const s = size ? `width:${size}px;height:${size}px;font-size:${size * 0.4}px` : '';
  return `<span class="avatar" style="background:${m.color};${s}">${esc(initials(m.name))}</span>`;
}
function waLink(phone, text) {
  const p = (phone || '').replace(/[^\d]/g, '');
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function copyText(text) { navigator.clipboard?.writeText?.(text).catch(() => {}); }

/* ---------------- التنقّل ---------------- */
const R = { tripId: null, tab: 'budget' };
function go(tripId, tab = 'budget') { R.tripId = tripId; R.tab = tab; render(); window.scrollTo(0, 0); }
function goHome() { R.tripId = null; render(); }
$('#brandBtn').addEventListener('click', goHome);

function render() {
  const t = R.tripId && db.getTrip(R.tripId);
  if (t) renderTrip(t, R.tab);
  else { R.tripId = null; renderHome(); }
}

/* =========================================================
   الرئيسية — قائمة الرحلات
   ========================================================= */
function renderHome() {
  headerActions.innerHTML = '';
  const trips = db.getTrips();
  let body;
  if (!trips.length) {
    body = `<div class="empty">${icons.luggage}<h3>ما عندك رحلات بعد</h3>
      <p>أنشئ رحلة، ضِف القروب، وحدّد قطة الرحلة.</p>
      <button class="btn btn-primary mt" data-act="new">${icons.plus} ابدأ رحلة</button></div>`;
  } else {
    body = `<div class="trip-grid">${trips.map(tripCard).join('')}</div>`;
  }
  view.innerHTML = `
    <div class="flex-between" style="margin-bottom:18px">
      <div><h1 class="page-title">رحلاتي</h1>
        <p class="muted-text">القطة والميزانية الشخصية في مكان واحد</p></div>
      ${trips.length ? `<button class="btn btn-primary btn-sm" data-act="new">${icons.plus} رحلة</button>` : ''}
    </div>${body}`;
  view.querySelectorAll('[data-act="new"]').forEach(b => b.onclick = openNewTrip);
  view.querySelectorAll('[data-trip]').forEach(c => c.onclick = () => go(c.dataset.trip));
}

function tripCard(t) {
  const ps = poolStats(t);
  const amir = db.memberById(t, t.amirId);
  return `
    <button class="trip-card" data-trip="${t.id}">
      <div class="trip-cover">
        <span class="flag">${t.flag}</span>
        <div><div class="dest">${esc(t.destination)}</div>
          ${t.country ? `<div style="opacity:.85;font-size:.85rem">${esc(t.country)}</div>` : ''}</div>
      </div>
      <div class="trip-card-body">
        <div class="trip-meta">
          <span>${icons.users} <b>${t.members.length}</b></span>
          ${amir ? `<span class="chip amir" style="padding:2px 8px">${icons.crown} ${esc(amir.name)}</span>` : ''}
        </div>
        <div style="font-weight:800;color:var(--teal-800)">${t.pool.total ? money(t.pool.total, t) : '—'}</div>
      </div>
    </button>`;
}

/* =========================================================
   شاشة الرحلة
   ========================================================= */
const TABS = [
  { key: 'budget', label: 'مصاريفي', icon: icons.coins },
  { key: 'pool', label: 'القطة', icon: icons.wallet },
  { key: 'pairs', label: 'بين شخصين', icon: icons.users },
  { key: 'places', label: 'الأماكن', icon: icons.pin },
];

function renderTrip(t, tab) {
  const amir = db.memberById(t, t.amirId);
  headerActions.innerHTML = `
    <button class="btn btn-ghost btn-icon" data-act="settings" title="إعدادات الرحلة">${icons.gear}</button>
    <button class="btn btn-ghost btn-sm" data-act="home">${icons.back} رحلاتي</button>`;
  headerActions.querySelector('[data-act="home"]').onclick = goHome;
  headerActions.querySelector('[data-act="settings"]').onclick = () => openSettings(t);

  const tabsHtml = `<nav class="tabs">${TABS.map(x => `
    <button class="tab ${x.key === tab ? 'active' : ''}" data-tab="${x.key}">${x.icon}<span>${x.label}</span></button>`).join('')}</nav>`;

  let content = '';
  if (tab === 'budget') content = tabBudget(t);
  else if (tab === 'pool') content = tabPool(t);
  else if (tab === 'pairs') content = tabPairs(t);
  else if (tab === 'places') content = tabPlaces(t);

  view.innerHTML = `
    <div class="flex-between" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:2.2rem">${t.flag}</span>
        <div><h1 class="page-title" style="margin:0">${esc(t.destination)}</h1>
          <p class="muted-text">${esc(t.country || '')}${t.country ? ' · ' : ''}${curLabel(t.homeCurrency)} / ${curLabel(t.destCurrency)}</p></div>
      </div>
    </div>${tabsHtml}<div id="tc">${content}</div>`;

  view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go(t.id, b.dataset.tab));
  wire(t, tab);
}

/* ---------------- تبويب: مصاريفي ---------------- */
function tabBudget(t) {
  const me = db.memberById(t, t.currentMemberId) || db.memberById(t, t.amirId);
  if (!me) return `<div class="empty">${icons.users}<h3>أضِف أعضاء القروب</h3>
    <button class="btn btn-primary mt" data-act="go-pool">إدارة القطة والأعضاء</button></div>`;

  const b = memberBudget(t, me.id);
  const memberOpts = t.members.map(m =>
    `<option value="${m.id}" ${m.id === me.id ? 'selected' : ''}>${esc(m.name)}${m.id === t.amirId ? ' (الأمير)' : ''}</option>`).join('');

  const personal = (t.personalExpenses[me.id] || []).slice().sort((a, c) => c.createdAt - a.createdAt);

  let breakdown;
  if (b.budget == null) {
    breakdown = `<div class="empty" style="padding:28px">${icons.coins}
      <h3>حدّد ميزانيتك الكاملة</h3>
      <p>مبلغك الكامل للرحلة — تنخصم منه قطة القروب، والباقي مصاريفك الشخصية.</p>
      <button class="btn btn-primary mt" data-act="set-budget">تحديد الميزانية</button></div>`;
  } else {
    const paidChip = b.isParticipant
      ? (b.qattahPaid ? `<span class="badge paid">سدّدت ✓</span>` : `<span class="badge pending">بانتظار السداد</span>`)
      : `<span class="badge personal">خارج القطة</span>`;
    breakdown = `
      <div class="card card-pad budget-card">
        <div class="bk-row"><span>ميزانيتي الكاملة</span><b>${money(b.budget, t)}</b></div>
        <div class="bk-row"><span>قطة الرحلة (للقروب) ${paidChip}</span><b class="neg">− ${money(b.qattahShare, t)}</b></div>
        <div class="bk-row"><span>مصاريف شخصية (${b.personalCount})</span><b class="neg">− ${money(b.personalSpent, t)}</b></div>
        <div class="bk-total"><span>المتبقي معي</span><span class="bk-amt ${b.remaining < 0 ? 'over' : ''}">${dual(b.remaining, t)}</span></div>
        ${b.pairNet !== 0 ? `<div class="bk-note">${b.pairNet > 0 ? 'لك' : 'عليك'} في «بين شخصين»: <b>${money(Math.abs(b.pairNet), t)}</b></div>` : ''}
      </div>`;
  }

  const list = personal.length ? personal.map(e => `
    <div class="exp">
      <span class="exp-cat">${catIcon(e.category)}</span>
      <div class="exp-body"><div class="exp-title">${esc(e.title)}</div>
        <div class="exp-sub">${new Date(e.createdAt).toLocaleDateString('ar')}</div></div>
      <div class="exp-amount">${dual(e.amount, t)}</div>
      <button class="icon-btn danger" data-del-personal="${e.id}">${icons.trash}</button>
    </div>`).join('') : `<p class="muted-text center" style="padding:16px">ما سجّلت مصاريف شخصية بعد.</p>`;

  return `
    <div class="whoami">
      <label>أنت:</label>
      <div class="select-wrap">${icons.chevron}
        <select class="select" id="whoami-sel">${memberOpts}</select></div>
      ${b.budget != null ? `<button class="btn btn-ghost btn-sm" data-act="set-budget">${icons.edit} تعديل الميزانية</button>` : ''}
    </div>
    ${breakdown}
    ${b.budget != null ? `
      <div class="section-head"><h2>مصاريفي الشخصية</h2></div>
      ${list}
      <button class="btn btn-primary btn-block mt" data-act="add-personal">${icons.plus} تسجيل مصروف شخصي</button>` : ''}`;
}

/* ---------------- تبويب: القطة ---------------- */
function tabPool(t) {
  const ps = poolStats(t);
  const isAmir = t.currentMemberId === t.amirId;

  // الأعضاء
  const membersHtml = t.members.map(m => `
    <div class="member-row">
      ${avatar(m, 40)}
      <div class="member-grow">
        <div class="member-name">${esc(m.name)} ${m.id === t.amirId ? `<span class="chip amir" style="padding:1px 7px;font-size:.72rem">${icons.crown} أمير</span>` : ''}</div>
        ${m.phone ? `<div class="muted-text" style="font-size:.8rem" dir="ltr">${esc(m.phone)}</div>` : ''}
      </div>
      <div class="row-actions">
        ${m.id !== t.amirId ? `<button class="icon-btn" data-make-amir="${m.id}" title="عيّنه أميرًا">${icons.crown}</button>` : ''}
        <button class="icon-btn" data-edit-member="${m.id}" title="تعديل">${icons.edit}</button>
        ${m.id !== t.amirId ? `<button class="icon-btn danger" data-del-member="${m.id}">${icons.trash}</button>` : ''}
      </div>
    </div>`).join('');

  // إعداد القطة + الحالة
  let poolBody;
  if (!t.pool.total || ps.count === 0) {
    poolBody = `<div class="empty" style="padding:26px">${icons.wallet}
      <h3>حدّد قطة الرحلة</h3>
      <p>الأمير يحدّد إجمالي القطة، على مين، وإيش تشمل — وتتقسّم على المشاركين.</p>
      <button class="btn btn-primary mt" data-act="setup-pool">تحديد القطة</button></div>`;
  } else {
    const statusRows = ps.participants.map(id => {
      const m = db.memberById(t, id);
      const paid = m.qattahPaid;
      const reqText = `مرحبا ${m.name} 👋\nقطة رحلة ${t.destination}: نصيبك ${money(ps.share, t)} (≈ ${inDest(ps.share, t)}).\n${t.pool.covers ? 'تشمل: ' + t.pool.covers + '\n' : ''}الرجاء التحويل عبر برق. شكراً 🌿`;
      return `<div class="status-row">
        ${avatar(m, 36)}
        <div class="member-grow"><div class="member-name">${esc(m.name)}</div>
          <div class="muted-text" style="font-size:.8rem">${money(ps.share, t)}</div></div>
        ${paid ? `<span class="badge paid">سدّد ✓</span>`
               : `<span class="badge pending">بانتظار</span>`}
        <button class="icon-btn" data-toggle-paid="${id}" title="${paid ? 'إلغاء' : 'تعليم كمسدّد'}">${icons.check}</button>
        ${m.phone && !paid ? `<a class="icon-btn" style="color:var(--green)" href="${waLink(m.phone, reqText)}" target="_blank" rel="noopener" title="اطلب عبر واتساب">${icons.send}</a>` : ''}
      </div>`;
    }).join('');

    poolBody = `
      <div class="pool-hero">
        <div class="pool-hero-top">
          <div><div class="pool-label">نصيب الفرد</div><div class="pool-share">${dual(ps.share, t)}</div></div>
          <button class="btn btn-ghost btn-sm" data-act="setup-pool">${icons.edit} تعديل</button>
        </div>
        <div class="pool-bar"><span style="width:${ps.fundedPct}%"></span></div>
        <div class="pool-stats">
          <div><b>${money(ps.collected, t)}</b><small>مُحصّل</small></div>
          <div><b>${money(ps.total, t)}</b><small>إجمالي القطة</small></div>
          <div><b>${money(ps.spent, t)}</b><small>مصروف</small></div>
          <div><b class="${ps.remaining < 0 ? 'over' : ''}">${money(ps.remaining, t)}</b><small>متبقٍ بالصندوق</small></div>
        </div>
        ${t.pool.covers ? `<div class="pool-covers">${icons.info}<span>تشمل: ${esc(t.pool.covers)}</span></div>` : ''}
      </div>

      <div class="section-head"><h2>سداد القطة</h2><span class="hint">${ps.paidIds.length}/${ps.count} سدّدوا</span></div>
      <div class="card card-pad"><div class="stack">${statusRows}</div></div>

      <div class="section-head"><h2>الصرف من القطة</h2><span class="hint">${t.groupExpenses.length}</span></div>
      ${t.groupExpenses.length ? t.groupExpenses.slice().sort((a, c) => c.createdAt - a.createdAt).map(e => `
        <div class="exp">
          <span class="exp-cat">${catIcon(e.category)}</span>
          <div class="exp-body"><div class="exp-title">${esc(e.title)}</div>
            <div class="exp-sub">من صندوق القطة</div></div>
          <div class="exp-amount">${dual(e.amount, t)}</div>
          <button class="icon-btn danger" data-del-group="${e.id}">${icons.trash}</button>
        </div>`).join('') : `<p class="muted-text center" style="padding:12px">ما صُرف من القطة بعد.</p>`}
      <button class="btn btn-ghost btn-block mt" data-act="add-group">${icons.plus} صرف من القطة</button>`;
  }

  return `
    <div class="section-head"><h2>القروب (${t.members.length})</h2></div>
    <div class="card card-pad"><div class="stack">${membersHtml}</div>
      <button class="btn btn-ghost btn-block mt" data-act="add-member">${icons.userplus} إضافة عضو</button></div>

    <div class="section-head"><h2>قطة الرحلة</h2></div>
    ${poolBody}`;
}

/* ---------------- تبويب: بين شخصين ---------------- */
function tabPairs(t) {
  if (t.members.length < 2) {
    return `<div class="empty">${icons.users}<h3>تحتاج شخصين على الأقل</h3>
      <p>أضِف أعضاء القروب من تبويب «القطة».</p></div>`;
  }
  const list = t.pairExpenses.slice().sort((a, c) => c.createdAt - a.createdAt);
  const listHtml = list.length ? list.map(e => {
    const payer = db.memberById(t, e.paidBy), other = db.memberById(t, e.withId);
    return `<div class="exp">
      <span class="exp-cat">${catIcon(e.category)}</span>
      <div class="exp-body"><div class="exp-title">${esc(e.title)}</div>
        <div class="exp-sub">دفعها ${payer ? esc(payer.name) : '؟'} · مع ${other ? esc(other.name) : '؟'} · مناصفة</div></div>
      <div class="exp-amount">${dual(e.amount, t)}</div>
      <button class="icon-btn danger" data-del-pair="${e.id}">${icons.trash}</button>
    </div>`;
  }).join('') : `<div class="empty">${icons.users}<h3>ما فيه قطّات بين شخصين</h3><p>مصاريف تخص شخصين وتتسوّى بينهم مباشرة.</p></div>`;

  const txns = settlePairs(t);
  const txHtml = txns.length ? txns.map(x => {
    const from = db.memberById(t, x.from), to = db.memberById(t, x.to);
    const payText = `تحويل عبر برق:\nمن: ${from.name}\nإلى: ${to.name}\nالمبلغ: ${money(x.amount, t)}`;
    return `<div class="settle">
      <div class="settle-flow">
        <span class="who">${avatar(from, 30)} ${esc(from.name)}</span>
        <span class="settle-arrow">${icons.arrow}</span>
        <span class="who">${avatar(to, 30)} ${esc(to.name)}</span>
      </div>
      <div style="text-align:end"><div class="settle-amount">${money(x.amount, t)}</div>
        <button class="btn btn-sand btn-sm" style="margin-top:6px" data-pay='${esc(JSON.stringify(payText))}'>${icons.wallet} برق</button></div>
    </div>`;
  }).join('') : '';

  return `
    <div class="pay-note" style="background:var(--teal-050);color:var(--teal-800)">${icons.info}
      <span>قطّات <b>خارج صندوق القروب</b> — مصروف يخص شخصين، يُقسّم مناصفة ويتسوّى بينهما.</span></div>
    ${txns.length ? `<div class="section-head"><h2>التسوية</h2></div>${txHtml}` : ''}
    <div class="section-head"><h2>القطّات (${t.pairExpenses.length})</h2></div>
    ${listHtml}
    <button class="btn btn-primary btn-block mt" data-act="add-pair">${icons.plus} قطة بين شخصين</button>`;
}

/* ---------------- تبويب: الأماكن ---------------- */
function tabPlaces(t) {
  const amir = db.memberById(t, t.amirId);
  const list = t.places.length ? t.places.map((p, i) => `
    <div class="place">
      <span class="place-idx">${i + 1}</span>
      <div class="place-body"><div class="place-name">${esc(p.name)}</div>
        ${p.note ? `<div class="place-note">${esc(p.note)}</div>` : ''}
        <div class="place-links">
          ${p.mapUrl
            ? `<a class="map-link" href="${esc(p.mapUrl)}" target="_blank" rel="noopener">${icons.map} فتح في الخريطة</a>`
            : `<a class="map-link" href="https://www.google.com/maps/search/${encodeURIComponent(p.name + ' ' + (t.destination || ''))}" target="_blank" rel="noopener">${icons.map} قوقل ماب</a>`}
          <button class="map-link" style="background:${p.visited ? 'var(--green-bg)' : '#eef1f0'};color:${p.visited ? 'var(--green)' : 'var(--ink-500)'}" data-visited="${p.id}">
            ${icons.check} ${p.visited ? 'تمّت الزيارة' : 'لم تُزَر'}</button>
        </div></div>
      <button class="icon-btn danger" data-del-place="${p.id}">${icons.trash}</button>
    </div>`).join('') : `<div class="empty">${icons.pin}<h3>لا توجد أماكن</h3>
      <p>${amir ? esc(amir.name) + ' (أمير الرحلة) يحدّد الأماكن من قوقل ماب.' : 'حدّد أمير الرحلة أولًا.'}</p></div>`;

  return `
    <div class="pay-note" style="background:var(--sand-100);color:var(--sand-600)">${icons.crown}
      <span>${amir ? `<b>${esc(amir.name)}</b> أمير الرحلة — هو من يحدّد الأماكن.` : 'حدّد أمير الرحلة من تبويب «القطة».'}</span></div>
    <div class="section-head"><h2>الوجهات (${t.places.length})</h2></div>
    ${list}
    <button class="btn btn-primary btn-block mt" data-act="add-place">${icons.plus} إضافة مكان</button>`;
}

/* =========================================================
   ربط الأحداث
   ========================================================= */
function wire(t, tab) {
  const c = $('#tc');
  const on = (sel, fn) => c.querySelectorAll(sel).forEach(el => el.onclick = fn);

  // مصاريفي
  const sel = c.querySelector('#whoami-sel');
  if (sel) sel.onchange = () => { db.setCurrentMember(t.id, sel.value); render(); };
  on('[data-act="set-budget"]', () => openSetBudget(t));
  on('[data-act="add-personal"]', () => openExpense(t, 'personal'));
  on('[data-del-personal]', e => { db.removePersonalExpense(t.id, t.currentMemberId, e.currentTarget.dataset.delPersonal); render(); });
  on('[data-act="go-pool"]', () => go(t.id, 'pool'));

  // القطة / الأعضاء
  on('[data-act="add-member"]', () => openMember(t));
  on('[data-edit-member]', e => openMember(t, e.currentTarget.dataset.editMember));
  on('[data-del-member]', e => { try { db.removeMember(t.id, e.currentTarget.dataset.delMember); render(); } catch (err) { toast(err.message); } });
  on('[data-make-amir]', e => { db.setAmir(t.id, e.currentTarget.dataset.makeAmir); toast('تم تعيين أمير الرحلة'); render(); });
  on('[data-act="setup-pool"]', () => openPool(t));
  on('[data-toggle-paid]', e => { db.toggleQattahPaid(t.id, e.currentTarget.dataset.togglePaid); render(); });
  on('[data-act="add-group"]', () => openExpense(t, 'group'));
  on('[data-del-group]', e => { db.removeGroupExpense(t.id, e.currentTarget.dataset.delGroup); render(); });

  // بين شخصين
  on('[data-act="add-pair"]', () => openExpense(t, 'pair'));
  on('[data-del-pair]', e => { db.removePairExpense(t.id, e.currentTarget.dataset.delPair); render(); });
  on('[data-pay]', e => { copyText(JSON.parse(e.currentTarget.dataset.pay)); toast('تم نسخ تفاصيل التحويل ✓'); });

  // الأماكن
  on('[data-act="add-place"]', () => openPlace(t));
  on('[data-visited]', e => { db.togglePlaceVisited(t.id, e.currentTarget.dataset.visited); render(); });
  on('[data-del-place]', e => { db.removePlace(t.id, e.currentTarget.dataset.delPlace); render(); });
}

/* =========================================================
   النوافذ
   ========================================================= */
function openModal({ title, body, footer }) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${title}</h3>
        <button class="icon-btn" data-close aria-label="إغلاق">${icons.close}</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}</div>`;
  modalRoot.classList.add('open');
  modalRoot.setAttribute('aria-hidden', 'false');
  modalRoot.querySelectorAll('[data-close]').forEach(el => el.onclick = closeModal);
}
function closeModal() { modalRoot.classList.remove('open'); modalRoot.setAttribute('aria-hidden', 'true'); modalRoot.innerHTML = ''; }

const FLAGS = ['🧳','🇸🇦','🇦🇪','🇹🇷','🇬🇧','🇫🇷','🇮🇹','🇪🇸','🇯🇵','🇹🇭','🇲🇾','🇮🇩','🇪🇬','🇲🇦','🇨🇭','🇬🇪','🇦🇿','🇲🇻','🇬🇷','🇺🇸'];
const curOptions = (sel) => Object.keys(CUR).map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${k} — ${CUR[k]}</option>`).join('');

/* رحلة جديدة */
function openNewTrip() {
  openModal({
    title: 'رحلة جديدة',
    body: `
      <p class="muted-text" style="margin-bottom:14px">أنت أمير الرحلة — تنشئها وتضيف القروب وتحدّد القطة.</p>
      <div class="field"><label>اسمك (أمير الرحلة)</label>
        <input class="input" id="f-amir" placeholder="اسمك" autocomplete="off"></div>
      <div class="field"><label>جوالك <span class="hint">اختياري — لطلبات القطة</span></label>
        <input class="input" id="f-amir-phone" placeholder="مثال: 9665xxxxxxxx" dir="ltr" inputmode="tel" autocomplete="off"></div>
      <div class="field"><label>الوجهة</label>
        <input class="input" id="f-dest" placeholder="مثال: طرابزون" autocomplete="off"></div>
      <div class="field"><label>الدولة</label>
        <input class="input" id="f-country" placeholder="مثال: تركيا" autocomplete="off"></div>
      <div class="field"><label>العلم</label>
        <div class="picker" id="f-flags">${FLAGS.map((f, i) => `<button type="button" class="pick ${i === 0 ? 'sel' : ''}" data-flag="${f}" style="font-size:1.2rem;padding:6px 10px">${f}</button>`).join('')}</div></div>
      <div class="two-col">
        <div class="field"><label>عملة الديار <span class="hint">عملتكم</span></label>
          <select class="select" id="f-home">${curOptions('SAR')}</select></div>
        <div class="field"><label>عملة الوجهة</label>
          <select class="select" id="f-dest-cur">${curOptions('TRY')}</select></div>
      </div>
      <div class="field"><label>سعر الصرف</label>
        <div class="rate-row">1 <b id="rl-home">ر.س</b> =
          <input class="input" id="f-rate" type="number" inputmode="decimal" step="0.0001" min="0" placeholder="0" dir="ltr" style="max-width:130px">
          <b id="rl-dest">₺</b></div>
        <span class="hint">اكتب كم تساوي عملة الديار بعملة الوجهة (تقدر تعدّله لاحقًا).</span></div>`,
    footer: `<button class="btn btn-primary btn-block" id="f-save">${icons.check} إنشاء الرحلة</button>`,
  });

  let flag = FLAGS[0];
  modalRoot.querySelectorAll('[data-flag]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-flag]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); flag = b.dataset.flag;
  });
  const home = $('#f-home'), dcur = $('#f-dest-cur');
  const syncLabels = () => { $('#rl-home').textContent = curLabel(home.value); $('#rl-dest').textContent = curLabel(dcur.value); };
  home.onchange = syncLabels; dcur.onchange = syncLabels; syncLabels();
  $('#f-amir').focus();

  $('#f-save').onclick = () => {
    const amirName = $('#f-amir').value.trim();
    const dest = $('#f-dest').value.trim();
    if (!amirName) { toast('اكتب اسمك'); return; }
    if (!dest) { toast('اكتب الوجهة'); return; }
    const trip = db.createTrip({
      destination: dest, country: $('#f-country').value, flag,
      destCurrency: dcur.value, homeCurrency: home.value,
      rate: parseFloat($('#f-rate').value) || 1,
      amirName, amirPhone: $('#f-amir-phone').value,
    });
    closeModal(); go(trip.id, 'pool'); toast('تم إنشاء الرحلة ✓');
  };
}

/* إعدادات الرحلة */
function openSettings(t) {
  openModal({
    title: 'إعدادات الرحلة',
    body: `
      <div class="field"><label>الوجهة</label><input class="input" id="s-dest" value="${esc(t.destination)}"></div>
      <div class="field"><label>الدولة</label><input class="input" id="s-country" value="${esc(t.country)}"></div>
      <div class="two-col">
        <div class="field"><label>عملة الديار</label><select class="select" id="s-home">${curOptions(t.homeCurrency)}</select></div>
        <div class="field"><label>عملة الوجهة</label><select class="select" id="s-dest-cur">${curOptions(t.destCurrency)}</select></div>
      </div>
      <div class="field"><label>سعر الصرف</label>
        <div class="rate-row">1 <b id="sl-home">${curLabel(t.homeCurrency)}</b> =
          <input class="input" id="s-rate" type="number" step="0.0001" min="0" value="${t.rate}" dir="ltr" style="max-width:130px">
          <b id="sl-dest">${curLabel(t.destCurrency)}</b></div></div>
      <div class="divider"></div>
      <button class="btn btn-danger-ghost btn-block" id="s-del">${icons.trash} حذف الرحلة</button>`,
    footer: `<button class="btn btn-primary btn-block" id="s-save">${icons.check} حفظ</button>`,
  });
  const home = $('#s-home'), dcur = $('#s-dest-cur');
  const sync = () => { $('#sl-home').textContent = curLabel(home.value); $('#sl-dest').textContent = curLabel(dcur.value); };
  home.onchange = sync; dcur.onchange = sync;
  $('#s-save').onclick = () => {
    db.updateTrip(t.id, {
      destination: $('#s-dest').value.trim() || t.destination,
      country: $('#s-country').value.trim(),
      homeCurrency: home.value, destCurrency: dcur.value,
      rate: parseFloat($('#s-rate').value) || 1,
    });
    closeModal(); render(); toast('تم الحفظ ✓');
  };
  $('#s-del').onclick = () => { closeModal(); confirmDeleteTrip(t); };
}

function confirmDeleteTrip(t) {
  openModal({
    title: 'حذف الرحلة',
    body: `<p class="muted-text">بتحذف رحلة <b>${esc(t.destination)}</b> بكل بياناتها. ما تقدر تتراجع.</p>`,
    footer: `<div style="display:flex;gap:10px">
      <button class="btn btn-ghost btn-block" data-close>إلغاء</button>
      <button class="btn btn-danger-ghost btn-block" id="del-yes">${icons.trash} حذف</button></div>`,
  });
  modalRoot.querySelectorAll('[data-close]').forEach(el => el.onclick = closeModal);
  $('#del-yes').onclick = () => { db.deleteTrip(t.id); closeModal(); goHome(); toast('تم حذف الرحلة'); };
}

/* إضافة/تعديل عضو */
function openMember(t, memberId) {
  const m = memberId ? db.memberById(t, memberId) : null;
  openModal({
    title: m ? 'تعديل عضو' : 'إضافة عضو',
    body: `
      <div class="field"><label>الاسم</label>
        <input class="input" id="m-name" value="${m ? esc(m.name) : ''}" placeholder="اسم العضو" autocomplete="off"></div>
      <div class="field"><label>رقم الجوال <span class="hint">لطلب القطة عبر واتساب</span></label>
        <input class="input" id="m-phone" value="${m ? esc(m.phone) : ''}" placeholder="9665xxxxxxxx" dir="ltr" inputmode="tel" autocomplete="off"></div>
      <div class="field"><label>المعرّف (يوزر) <span class="hint">اختياري</span></label>
        <input class="input" id="m-user" value="${m ? esc(m.username) : ''}" placeholder="@username" dir="ltr" autocomplete="off"></div>`,
    footer: `<button class="btn btn-primary btn-block" id="m-save">${m ? icons.check : icons.plus} ${m ? 'حفظ' : 'إضافة'}</button>`,
  });
  $('#m-name').focus();
  $('#m-save').onclick = () => {
    const name = $('#m-name').value.trim();
    if (!name) { toast('اكتب الاسم'); return; }
    const data = { name, phone: $('#m-phone').value, username: $('#m-user').value };
    if (m) db.updateMember(t.id, m.id, data);
    else db.addMember(t.id, data);
    closeModal(); render(); toast(m ? 'تم الحفظ ✓' : 'تمت الإضافة ✓');
  };
}

/* تحديد القطة */
function openPool(t) {
  const selected = new Set(t.pool.participantIds.length ? t.pool.participantIds : t.members.map(m => m.id));
  openModal({
    title: 'قطة الرحلة',
    body: `
      <div class="field"><label>إجمالي القطة (${curLabel(t.homeCurrency)})</label>
        <input class="input" id="q-total" type="number" inputmode="decimal" min="0" step="0.01" value="${t.pool.total || ''}" placeholder="0" dir="ltr"></div>
      <div class="field"><label>على مين؟</label>
        <div class="seg" id="q-scope">
          <button type="button" class="seg-opt ${t.pool.participantIds.length === 0 || t._poolAll ? 'sel' : ''}" data-scope="all">على الكل<small>كل أعضاء القروب</small></button>
          <button type="button" class="seg-opt ${t.pool.participantIds.length && !t._poolAll ? 'sel' : ''}" data-scope="some">أشخاص معيّنين<small>تختارهم</small></button>
        </div></div>
      <div class="field" id="q-parts-field">
        <label>المشاركون</label>
        <div class="picker" id="q-parts">${t.members.map(m => `
          <button type="button" class="pick ${selected.has(m.id) ? 'sel' : ''}" data-part="${m.id}">
            <span class="dot" style="background:${m.color}">${esc(initials(m.name))}</span>${esc(m.name)}</button>`).join('')}</div></div>
      <div class="field"><label>القطة تشمل <span class="hint">اختياري</span></label>
        <textarea class="input" id="q-covers" placeholder="مثال: الفندق، المواصلات المشتركة، الأكل الجماعي">${esc(t.pool.covers)}</textarea></div>
      <div class="share-preview" id="q-preview"></div>`,
    footer: `<button class="btn btn-primary btn-block" id="q-save">${icons.check} حفظ القطة</button>`,
  });

  let scope = (t.pool.participantIds.length && !t._poolAll) ? 'some' : 'all';
  const partsField = $('#q-parts-field');
  const preview = $('#q-preview');

  function currentParts() {
    if (scope === 'all') return t.members.map(m => m.id);
    return [...selected];
  }
  function refresh() {
    partsField.style.display = scope === 'some' ? 'block' : 'none';
    const total = parseFloat($('#q-total').value) || 0;
    const n = currentParts().length;
    preview.innerHTML = n && total
      ? `نصيب الفرد: <b>${money(total / n, t)}</b> ≈ ${inDest(total / n, t)} <span class="muted-text">(${n} مشاركين)</span>`
      : '';
  }
  modalRoot.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-scope]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); scope = b.dataset.scope; refresh();
  });
  modalRoot.querySelectorAll('[data-part]').forEach(b => b.onclick = () => {
    const id = b.dataset.part;
    if (selected.has(id)) { selected.delete(id); b.classList.remove('sel'); }
    else { selected.add(id); b.classList.add('sel'); }
    refresh();
  });
  $('#q-total').oninput = refresh;
  refresh();

  $('#q-save').onclick = () => {
    const total = parseFloat($('#q-total').value);
    if (!(total > 0)) { toast('اكتب إجمالي القطة'); return; }
    const parts = currentParts();
    if (!parts.length) { toast('اختر المشاركين'); return; }
    db.setPool(t.id, { total, participantIds: parts, covers: $('#q-covers').value, poolAll: scope === 'all' });
    closeModal(); render(); toast('تم حفظ القطة ✓');
  };
}

/* تحديد الميزانية */
function openSetBudget(t) {
  const me = db.memberById(t, t.currentMemberId);
  const b = memberBudget(t, me.id);
  openModal({
    title: `ميزانية ${esc(me.name)}`,
    body: `
      <div class="field"><label>ميزانيتك الكاملة (${curLabel(t.homeCurrency)})</label>
        <input class="input" id="bd" type="number" inputmode="decimal" min="0" step="0.01" value="${me.budget ?? ''}" placeholder="0" dir="ltr"></div>
      ${b.isParticipant ? `<div class="pay-note" style="background:var(--teal-050);color:var(--teal-800)">${icons.info}
        <span>قطة الرحلة <b>${money(b.qattahShare, t)}</b> بتنخصم تلقائيًا من ميزانيتك، والباقي مصاريفك الشخصية.</span></div>` : ''}`,
    footer: `<button class="btn btn-primary btn-block" id="bd-save">${icons.check} حفظ</button>`,
  });
  $('#bd').focus();
  $('#bd-save').onclick = () => {
    const v = parseFloat($('#bd').value);
    if (!(v >= 0)) { toast('اكتب مبلغًا صحيحًا'); return; }
    db.setMemberBudget(t.id, me.id, v);
    closeModal(); render(); toast('تم حفظ الميزانية ✓');
  };
}

/* مصروف (group | personal | pair) */
function openExpense(t, kind) {
  const state = { category: 'food', enteredCur: t.destCurrency, paidBy: t.currentMemberId, withId: null };
  const titles = { group: 'صرف من القطة', personal: 'مصروف شخصي', pair: 'قطة بين شخصين' };

  const pairFields = kind === 'pair' ? `
    <div class="field"><label>مين دفع؟</label>
      <div class="picker" id="e-payer">${t.members.map(m => `
        <button type="button" class="pick ${m.id === state.paidBy ? 'sel' : ''}" data-payer="${m.id}">
          <span class="dot" style="background:${m.color}">${esc(initials(m.name))}</span>${esc(m.name)}</button>`).join('')}</div></div>
    <div class="field"><label>مع مين؟ <span class="hint">الطرف الآخر</span></label>
      <div class="picker" id="e-with">${t.members.map(m => `
        <button type="button" class="pick" data-with="${m.id}">
          <span class="dot" style="background:${m.color}">${esc(initials(m.name))}</span>${esc(m.name)}</button>`).join('')}</div></div>` : '';

  openModal({
    title: titles[kind],
    body: `
      <div class="field"><label>الوصف</label>
        <input class="input" id="e-title" placeholder="مثال: ${kind === 'group' ? 'عشاء القروب' : kind === 'pair' ? 'تكسي مع صاحبي' : 'قهوة'}" autocomplete="off"></div>
      <div class="field"><label>المبلغ</label>
        <div class="amount-row">
          <input class="input" id="e-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" dir="ltr">
          <div class="seg cur-seg" id="e-cur">
            <button type="button" class="seg-opt sel" data-cur="${t.destCurrency}">${curLabel(t.destCurrency)}<small>الوجهة</small></button>
            <button type="button" class="seg-opt" data-cur="${t.homeCurrency}">${curLabel(t.homeCurrency)}<small>الديار</small></button>
          </div>
        </div></div>
      <div class="field"><label>الفئة</label>
        <div class="cat-grid" id="e-cats">${catList.map(cc => `
          <button type="button" class="cat-opt ${cc.key === 'food' ? 'sel' : ''}" data-cat="${cc.key}">${cc.icon}<span>${cc.label}</span></button>`).join('')}</div></div>
      ${pairFields}`,
    footer: `<button class="btn btn-primary btn-block" id="e-save">${icons.check} حفظ</button>`,
  });

  modalRoot.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-cat]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); state.category = b.dataset.cat;
  });
  modalRoot.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-cur]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); state.enteredCur = b.dataset.cur;
  });
  if (kind === 'pair') {
    modalRoot.querySelectorAll('[data-payer]').forEach(b => b.onclick = () => {
      modalRoot.querySelectorAll('[data-payer]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); state.paidBy = b.dataset.payer;
    });
    modalRoot.querySelectorAll('[data-with]').forEach(b => b.onclick = () => {
      modalRoot.querySelectorAll('[data-with]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); state.withId = b.dataset.with;
    });
  }
  $('#e-title').focus();

  $('#e-save').onclick = () => {
    const title = $('#e-title').value.trim();
    const amount = parseFloat($('#e-amount').value);
    if (!title) { toast('اكتب الوصف'); return; }
    if (!(amount > 0)) { toast('اكتب مبلغًا صحيحًا'); return; }
    const payload = { title, amount, category: state.category, enteredCur: state.enteredCur };
    if (kind === 'group') db.addGroupExpense(t.id, payload);
    else if (kind === 'personal') db.addPersonalExpense(t.id, t.currentMemberId, payload);
    else {
      if (!state.withId) { toast('اختر الطرف الآخر'); return; }
      if (state.withId === state.paidBy) { toast('لازم شخصين مختلفين'); return; }
      db.addPairExpense(t.id, { ...payload, paidBy: state.paidBy, withId: state.withId });
    }
    closeModal(); render(); toast('تم الحفظ ✓');
  };
}

/* مكان */
function openPlace(t) {
  openModal({
    title: 'إضافة مكان',
    body: `
      <div class="field"><label>اسم المكان</label>
        <input class="input" id="p-name" placeholder="مثال: بحيرة أوزنجول" autocomplete="off"></div>
      <div class="field"><label>ملاحظة <span class="hint">اختياري</span></label>
        <input class="input" id="p-note" placeholder="مثال: زيارتها صباحًا" autocomplete="off"></div>
      <div class="field"><label>رابط قوقل ماب <span class="hint">اختياري</span></label>
        <input class="input" id="p-map" placeholder="الصق رابط الموقع" dir="ltr" autocomplete="off"></div>
      <div class="pay-note" style="background:var(--teal-050);color:var(--teal-800)">${icons.map}
        <span>بدون رابط، يظهر زر بحث تلقائي في قوقل ماب باسم المكان.</span></div>`,
    footer: `<button class="btn btn-primary btn-block" id="p-save">${icons.plus} إضافة</button>`,
  });
  $('#p-name').focus();
  $('#p-save').onclick = () => {
    const name = $('#p-name').value.trim();
    if (!name) { toast('اكتب اسم المكان'); return; }
    db.addPlace(t.id, { name, note: $('#p-note').value, mapUrl: $('#p-map').value });
    closeModal(); render(); toast('تمت إضافة المكان ✓');
  };
}

/* ---------------- إقلاع ---------------- */
render();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
