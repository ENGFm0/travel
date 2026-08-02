/* =========================================================
   app.js — الواجهة والتنقّل والمنطق
   ========================================================= */
import * as db from './store.js';
import { settle, computeBalances, tripTotals } from './settle.js';
import { icons, catList, catIcon, catLabel } from './icons.js';

/* ---------------- أدوات مساعدة ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const headerActions = $('#headerActions');
const modalRoot = $('#modalRoot');

const CURRENCIES = {
  SAR: 'ر.س', AED: 'د.إ', KWD: 'د.ك', BHD: 'د.ب', QAR: 'ر.ق',
  OMR: 'ر.ع', USD: '$', EUR: '€', GBP: '£', TRY: '₺', EGP: 'ج.م',
};

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const money = (n, cur = 'SAR') => `${nf.format(Math.round(n * 100) / 100)} ${CURRENCIES[cur] || cur}`;

const esc = (s) => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

function avatar(m, size) {
  const s = size ? `width:${size}px;height:${size}px;font-size:${size * 0.4}px` : '';
  return `<span class="avatar" style="background:${m.color};${s}">${esc(initials(m.name))}</span>`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- التنقّل ---------------- */
const routeState = { tripId: null, tab: 'overview' };

function go(tripId, tab = 'overview') {
  routeState.tripId = tripId;
  routeState.tab = tab;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function goHome() {
  routeState.tripId = null;
  render();
}

$('#brandBtn').addEventListener('click', goHome);

function render() {
  if (routeState.tripId && db.getTrip(routeState.tripId)) {
    renderTrip(db.getTrip(routeState.tripId), routeState.tab);
  } else {
    routeState.tripId = null;
    renderHome();
  }
}

/* =========================================================
   الشاشة الرئيسية — قائمة الرحلات
   ========================================================= */
function renderHome() {
  headerActions.innerHTML = '';
  const trips = db.getTrips();

  let body;
  if (trips.length === 0) {
    body = `
      <div class="empty">
        ${icons.luggage}
        <h3>ما عندك رحلات بعد</h3>
        <p>ابدأ رحلة جديدة، ضِف القروب، وعيّن أمير الرحلة.</p>
        <button class="btn btn-primary mt" data-act="new-trip">${icons.plus} ابدأ رحلة</button>
      </div>`;
  } else {
    body = `<div class="trip-grid">${trips.map(tripCard).join('')}</div>`;
  }

  view.innerHTML = `
    <div class="flex-between" style="margin-bottom:18px">
      <div>
        <h1 class="page-title">رحلاتي</h1>
        <p class="muted-text">نظّم مصاريف السفر مع القروب في مكان واحد</p>
      </div>
      ${trips.length ? `<button class="btn btn-primary btn-sm" data-act="new-trip">${icons.plus} رحلة</button>` : ''}
    </div>
    ${body}`;

  view.querySelectorAll('[data-act="new-trip"]').forEach(b => b.onclick = openNewTrip);
  view.querySelectorAll('[data-trip]').forEach(c => c.onclick = () => go(c.dataset.trip));
}

function tripCard(t) {
  const totals = tripTotals(t);
  return `
    <button class="trip-card" data-trip="${t.id}">
      <div class="trip-cover">
        <span class="flag">${t.flag}</span>
        <div>
          <div class="dest">${esc(t.destination)}</div>
          ${t.country ? `<div style="opacity:.85;font-size:.85rem">${esc(t.country)}</div>` : ''}
        </div>
      </div>
      <div class="trip-card-body">
        <div class="trip-meta">
          <span>${icons.users} <b>${t.members.length}</b> أفراد</span>
          <span>${icons.receipt} <b>${t.expenses.length}</b> قطّة</span>
        </div>
        <div style="font-weight:800;color:var(--teal-800)">${money(totals.all, t.currency)}</div>
      </div>
    </button>`;
}

/* =========================================================
   شاشة الرحلة — تبويبات
   ========================================================= */
const TABS = [
  { key: 'overview', label: 'نظرة عامة', icon: icons.overview },
  { key: 'places', label: 'الأماكن', icon: icons.pin },
  { key: 'expenses', label: 'القطّات', icon: icons.receipt },
  { key: 'settle', label: 'التسوية', icon: icons.wallet },
];

function renderTrip(t, tab) {
  headerActions.innerHTML = `
    <button class="btn btn-ghost btn-icon" data-act="del-trip" title="حذف الرحلة">${icons.trash}</button>
    <button class="btn btn-ghost btn-sm" data-act="home">${icons.back} رحلاتي</button>`;
  headerActions.querySelector('[data-act="home"]').onclick = goHome;
  headerActions.querySelector('[data-act="del-trip"]').onclick = () => confirmDeleteTrip(t);

  const tabsHtml = `<nav class="tabs">${TABS.map(x => `
    <button class="tab ${x.key === tab ? 'active' : ''}" data-tab="${x.key}">${x.icon}<span>${x.label}</span></button>
  `).join('')}</nav>`;

  let content = '';
  if (tab === 'overview') content = tabOverview(t);
  else if (tab === 'places') content = tabPlaces(t);
  else if (tab === 'expenses') content = tabExpenses(t);
  else if (tab === 'settle') content = tabSettle(t);

  view.innerHTML = `
    <div class="flex-between" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:2.2rem">${t.flag}</span>
        <div>
          <h1 class="page-title" style="margin:0">${esc(t.destination)}</h1>
          ${t.country ? `<p class="muted-text">${esc(t.country)}</p>` : ''}
        </div>
      </div>
    </div>
    ${tabsHtml}
    <div id="tabContent">${content}</div>`;

  view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go(t.id, b.dataset.tab));
  wireTab(t, tab);
}

/* ---------------- تبويب: نظرة عامة ---------------- */
const STAGES = [
  { key: 'tickets', title: 'شراء التذاكر والحجز', note: 'تذاكر الطيران وحجز الفنادق' },
  { key: 'depart', title: 'الإقلاع والوصول', note: 'انطلاق الرحلة' },
  { key: 'places', title: 'تحديد الأماكن', note: 'أمير الرحلة يحدّد الوجهات' },
  { key: 'daily', title: 'القطّات اليومية', note: 'أكل، مواصلات، تسوّق' },
  { key: 'settle', title: 'التسوية والدفع', note: 'كل واحد يسدّد نصيبه عبر برق' },
];

function stageDone(t, key) {
  if (t.stageState[key] !== undefined) return t.stageState[key];
  // اشتقاق تلقائي مبدئي
  if (key === 'tickets') return t.expenses.some(e => ['flight', 'hotel', 'ticket'].includes(e.category));
  if (key === 'places') return t.places.length > 0;
  if (key === 'daily') return t.expenses.some(e => ['food', 'car', 'shop'].includes(e.category));
  if (key === 'settle') return false;
  return false;
}

function tabOverview(t) {
  const totals = tripTotals(t);
  const amir = t.members.find(m => m.id === t.amirId);

  let firstUndone = STAGES.find(s => !stageDone(t, s.key));

  const stagesHtml = STAGES.map((s, i) => {
    const done = stageDone(t, s.key);
    const active = firstUndone && s.key === firstUndone.key;
    return `
      <button class="stage ${done ? 'done' : ''} ${active ? 'active' : ''}" data-stage="${s.key}">
        <span class="stage-dot">${done ? icons.check : (i + 1)}</span>
        <span class="stage-body">
          <span class="stage-title">${s.title}</span>
          <span class="stage-note">${s.note}</span>
        </span>
        ${done ? `<span class="stage-check">${icons.check}</span>` : ''}
      </button>`;
  }).join('');

  return `
    <div class="tiles">
      <div class="tile"><div class="v">${money(totals.shared, t.currency)}</div><div class="l">ضمن القطة</div></div>
      <div class="tile"><div class="v">${money(totals.personal, t.currency)}</div><div class="l">خارج القطة</div></div>
      <div class="tile"><div class="v">${t.members.length}</div><div class="l">أفراد القروب</div></div>
    </div>

    <div class="section-head"><h2>القروب</h2>
      <span class="hint">أمير الرحلة يحدّد الأماكن</span></div>
    <div class="card card-pad">
      ${amir ? `<div class="flex-between" style="margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:10px">${avatar(amir, 40)}
          <div><div class="member-name">${esc(amir.name)}</div>
          <span class="chip amir">${icons.crown} أمير الرحلة</span></div></div>
      </div><div class="divider" style="margin:12px 0"></div>` : ''}
      <div class="stack">
        ${t.members.filter(m => m.id !== t.amirId).map(m => `
          <div class="member-row">
            ${avatar(m, 40)}
            <div class="member-grow"><div class="member-name">${esc(m.name)}</div></div>
            <div class="row-actions">
              <button class="icon-btn" data-make-amir="${m.id}" title="عيّنه أميرًا">${icons.crown}</button>
              <button class="icon-btn danger" data-del-member="${m.id}" title="حذف">${icons.trash}</button>
            </div>
          </div>`).join('') || (amir ? '' : '<p class="muted-text center">أضِف أعضاء القروب</p>')}
      </div>
      <button class="btn btn-ghost btn-block mt" data-act="add-member">${icons.plus} إضافة عضو</button>
    </div>

    <div class="section-head"><h2>مراحل الرحلة</h2>
      <span class="hint">اضغط لتعليم المرحلة</span></div>
    <div class="stages">${stagesHtml}</div>`;
}

/* ---------------- تبويب: الأماكن ---------------- */
function tabPlaces(t) {
  const amir = t.members.find(m => m.id === t.amirId);
  const list = t.places.length
    ? t.places.map((p, i) => `
      <div class="place">
        <span class="place-idx">${i + 1}</span>
        <div class="place-body">
          <div class="place-name">${esc(p.name)}</div>
          ${p.note ? `<div class="place-note">${esc(p.note)}</div>` : ''}
          <div class="place-links">
            ${p.mapUrl
              ? `<a class="map-link" href="${esc(p.mapUrl)}" target="_blank" rel="noopener">${icons.map} فتح في الخريطة</a>`
              : `<a class="map-link" href="https://www.google.com/maps/search/${encodeURIComponent(p.name + ' ' + (t.destination || ''))}" target="_blank" rel="noopener">${icons.map} بحث في قوقل ماب</a>`}
            <button class="map-link" style="background:${p.visited ? 'var(--green-bg)' : '#eef1f0'};color:${p.visited ? 'var(--green)' : 'var(--ink-500)'}" data-visited="${p.id}">
              ${icons.check} ${p.visited ? 'تمّت الزيارة' : 'لم تُزَر بعد'}
            </button>
          </div>
        </div>
        <button class="icon-btn danger" data-del-place="${p.id}">${icons.trash}</button>
      </div>`).join('')
    : `<div class="empty">${icons.pin}<h3>لا توجد أماكن</h3><p>${amir ? esc(amir.name) + ' (أمير الرحلة) يضيف الأماكن من قوقل ماب.' : 'عيّن أمير الرحلة ثم أضِف الأماكن.'}</p></div>`;

  return `
    <div class="pay-note" style="background:var(--teal-050);color:var(--teal-800)">
      ${icons.crown}
      <span>${amir ? `<b>${esc(amir.name)}</b> أمير الرحلة — هو من يحدّد الأماكن اللي بتُزار.` : 'عيّن أمير الرحلة من تبويب «نظرة عامة».'}</span>
    </div>
    <div class="section-head"><h2>الوجهات (${t.places.length})</h2></div>
    ${list}
    <button class="btn btn-primary btn-block mt" data-act="add-place">${icons.plus} إضافة مكان</button>`;
}

/* ---------------- تبويب: القطّات ---------------- */
const TYPE_LABEL = { group: 'على القروب', some: 'بين أشخاص', personal: 'خارج القطة' };
const TYPE_CLASS = { group: 'group', some: 'some', personal: 'personal' };

function tabExpenses(t) {
  if (t.members.length === 0) {
    return `<div class="empty">${icons.users}<h3>أضِف القروب أولًا</h3><p>لا يمكن تسجيل قطّة قبل إضافة الأعضاء.</p>
      <button class="btn btn-primary mt" data-act="go-overview">الذهاب لنظرة عامة</button></div>`;
  }
  const totals = tripTotals(t);
  const sorted = t.expenses.slice().sort((a, b) => b.createdAt - a.createdAt);

  const list = sorted.length ? sorted.map(e => {
    const payer = t.members.find(m => m.id === e.paidBy);
    let sub;
    if (e.type === 'group') sub = `دفعها ${payer ? esc(payer.name) : '؟'} · تنقسم على الكل`;
    else if (e.type === 'some') sub = `دفعها ${payer ? esc(payer.name) : '؟'} · بين ${e.sharedAmong.length} أشخاص`;
    else sub = `${payer ? esc(payer.name) : '؟'} · مصروف شخصي`;
    return `
      <div class="exp">
        <span class="exp-cat">${catIcon(e.category)}</span>
        <div class="exp-body">
          <div class="exp-title">${esc(e.title)}
            <span class="badge ${TYPE_CLASS[e.type]}">${TYPE_LABEL[e.type]}</span></div>
          <div class="exp-sub">${sub}</div>
        </div>
        <div class="exp-amount">${money(e.amount, t.currency)}</div>
        <button class="icon-btn danger" data-del-exp="${e.id}">${icons.trash}</button>
      </div>`;
  }).join('') : `<div class="empty">${icons.receipt}<h3>ما فيه قطّات</h3><p>سجّل أول مصروف: تذاكر، فندق، أكل...</p></div>`;

  return `
    <div class="tiles">
      <div class="tile"><div class="v">${money(totals.shared, t.currency)}</div><div class="l">ضمن القطة</div></div>
      <div class="tile"><div class="v">${money(totals.personal, t.currency)}</div><div class="l">خارج القطة</div></div>
      <div class="tile"><div class="v">${money(totals.all, t.currency)}</div><div class="l">الإجمالي</div></div>
    </div>
    <div class="section-head"><h2>القطّات (${t.expenses.length})</h2></div>
    ${list}
    <button class="btn btn-primary btn-block mt" data-act="add-exp">${icons.plus} تسجيل قطّة</button>`;
}

/* ---------------- تبويب: التسوية ---------------- */
function tabSettle(t) {
  if (t.members.length < 2) {
    return `<div class="empty">${icons.wallet}<h3>التسوية تحتاج شخصين على الأقل</h3><p>أضِف أعضاء القروب وسجّل القطّات.</p></div>`;
  }
  const balances = computeBalances(t);
  const txns = settle(t);
  const totals = tripTotals(t);

  const balancesHtml = t.members.map(m => {
    const v = balances[m.id] || 0;
    const cls = v > 0.009 ? 'pos' : v < -0.009 ? 'neg' : '';
    const label = v > 0.009 ? 'له' : v < -0.009 ? 'عليه' : 'متساوٍ';
    return `<div class="balance-row">
      ${avatar(m, 36)}
      <div class="member-grow"><div class="member-name">${esc(m.name)}</div>
        <div class="muted-text" style="font-size:.8rem">${label}</div></div>
      <div class="balance-val ${cls}">${money(Math.abs(v), t.currency)}</div>
    </div>`;
  }).join('');

  const txHtml = txns.length ? txns.map(x => {
    const from = t.members.find(m => m.id === x.from);
    const to = t.members.find(m => m.id === x.to);
    return `<div class="settle">
      <div class="settle-flow">
        <span class="who">${avatar(from, 30)} ${esc(from.name)}</span>
        <span class="settle-arrow">${icons.arrow}</span>
        <span class="who">${avatar(to, 30)} ${esc(to.name)}</span>
      </div>
      <div style="text-align:end">
        <div class="settle-amount">${money(x.amount, t.currency)}</div>
        <button class="btn btn-sand btn-sm" style="margin-top:6px" data-pay='${esc(JSON.stringify({ from: from.name, to: to.name, amount: x.amount, cur: t.currency }))}'>
          ${icons.wallet} ادفع عبر برق
        </button>
      </div>
    </div>`;
  }).join('') : `<div class="empty">${icons.check}<h3>كل الحسابات مسوّاة</h3><p>ما فيه أحد يستحق على أحد ضمن القطة.</p></div>`;

  return `
    <div class="pay-note">
      ${icons.info}
      <span>القطّة <b>الشخصية (خارج القطة)</b> ما تدخل التسوية — تخص صاحبها فقط. التسوية تحسب القطّات المشتركة بأقل عدد تحويلات.</span>
    </div>

    <div class="section-head"><h2>التحويلات المطلوبة</h2>
      <span class="hint">${txns.length} تحويل</span></div>
    ${txHtml}

    <div class="section-head"><h2>أرصدة الأفراد</h2></div>
    <div class="card card-pad"><div class="stack">${balancesHtml}</div></div>

    <div class="section-head"><h2>الدفع عبر برق</h2></div>
    <div class="card card-pad">
      <p class="muted-text">افتح تطبيق <b>برق</b> (أو أي تطبيق دفع فوري) وحوّل المبلغ لرقم جوال المستلم. اضغط «ادفع عبر برق» في أي تحويل لنسخ التفاصيل جاهزة.</p>
    </div>`;
}

/* =========================================================
   ربط أحداث كل تبويب
   ========================================================= */
function wireTab(t, tab) {
  const c = $('#tabContent');

  // نظرة عامة
  c.querySelectorAll('[data-act="add-member"]').forEach(b => b.onclick = () => openAddMember(t));
  c.querySelectorAll('[data-make-amir]').forEach(b => b.onclick = () => { db.setAmir(t.id, b.dataset.makeAmir); toast('تم تعيين أمير الرحلة'); render(); });
  c.querySelectorAll('[data-del-member]').forEach(b => b.onclick = () => {
    try { db.removeMember(t.id, b.dataset.delMember); render(); }
    catch (e) { toast(e.message); }
  });
  c.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => {
    const key = b.dataset.stage;
    t.stageState[key] = !stageDone(t, key);
    db.updateTrip(t.id, { stageState: t.stageState });
    render();
  });

  // الأماكن
  c.querySelectorAll('[data-act="add-place"]').forEach(b => b.onclick = () => openAddPlace(t));
  c.querySelectorAll('[data-visited]').forEach(b => b.onclick = () => { db.togglePlaceVisited(t.id, b.dataset.visited); render(); });
  c.querySelectorAll('[data-del-place]').forEach(b => b.onclick = () => { db.removePlace(t.id, b.dataset.delPlace); render(); });

  // القطّات
  c.querySelectorAll('[data-act="add-exp"]').forEach(b => b.onclick = () => openAddExpense(t));
  c.querySelectorAll('[data-act="go-overview"]').forEach(b => b.onclick = () => go(t.id, 'overview'));
  c.querySelectorAll('[data-del-exp]').forEach(b => b.onclick = () => { db.removeExpense(t.id, b.dataset.delExp); toast('تم حذف القطّة'); render(); });

  // التسوية
  c.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => {
    const d = JSON.parse(b.dataset.pay);
    const msg = `تحويل عبر برق:\nمن: ${d.from}\nإلى: ${d.to}\nالمبلغ: ${money(d.amount, d.cur)}`;
    copyText(msg);
    toast('تم نسخ تفاصيل التحويل ✓');
  });
}

function copyText(text) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
}

/* =========================================================
   النوافذ (Modals)
   ========================================================= */
function openModal({ title, body, footer }) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${title}</h3>
        <button class="icon-btn" data-close aria-label="إغلاق">${icons.close}</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  modalRoot.classList.add('open');
  modalRoot.setAttribute('aria-hidden', 'false');
  modalRoot.querySelectorAll('[data-close]').forEach(el => el.onclick = closeModal);
  return modalRoot;
}
function closeModal() {
  modalRoot.classList.remove('open');
  modalRoot.setAttribute('aria-hidden', 'true');
  modalRoot.innerHTML = '';
}

/* ---------------- نافذة: رحلة جديدة ---------------- */
const FLAGS = ['🧳','🇸🇦','🇦🇪','🇹🇷','🇬🇧','🇫🇷','🇮🇹','🇪🇸','🇯🇵','🇹🇭','🇲🇾','🇮🇩','🇪🇬','🇲🇦','🇨🇭','🇬🇪','🇦🇿','🇲🇻','🇬🇷','🇺🇸'];

function openNewTrip() {
  openModal({
    title: 'رحلة جديدة',
    body: `
      <div class="field">
        <label>الوجهة <span class="hint">المدينة أو المكان</span></label>
        <input class="input" id="f-dest" placeholder="مثال: طرابزون" autocomplete="off" />
      </div>
      <div class="field">
        <label>الدولة</label>
        <input class="input" id="f-country" placeholder="مثال: تركيا" autocomplete="off" />
      </div>
      <div class="field">
        <label>العلم / الأيقونة</label>
        <div class="picker" id="f-flags">
          ${FLAGS.map((f, i) => `<button type="button" class="pick ${i === 0 ? 'sel' : ''}" data-flag="${f}" style="font-size:1.2rem;padding:6px 10px">${f}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>العملة</label>
        <select class="select" id="f-cur">
          ${Object.entries(CURRENCIES).map(([k, v]) => `<option value="${k}" ${k === 'SAR' ? 'selected' : ''}>${k} — ${v}</option>`).join('')}
        </select>
      </div>`,
    footer: `<button class="btn btn-primary btn-block" id="f-save">${icons.check} إنشاء الرحلة</button>`,
  });

  let flag = FLAGS[0];
  modalRoot.querySelectorAll('[data-flag]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-flag]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); flag = b.dataset.flag;
  });
  $('#f-dest').focus();
  $('#f-save').onclick = () => {
    const dest = $('#f-dest').value.trim();
    if (!dest) { toast('اكتب الوجهة'); $('#f-dest').focus(); return; }
    const trip = db.createTrip({
      destination: dest,
      country: $('#f-country').value,
      flag,
      currency: $('#f-cur').value,
    });
    closeModal();
    go(trip.id, 'overview');
    toast('تم إنشاء الرحلة ✓');
  };
}

/* ---------------- نافذة: إضافة عضو ---------------- */
function openAddMember(t) {
  openModal({
    title: 'إضافة عضو للقروب',
    body: `<div class="field"><label>الاسم</label>
      <input class="input" id="m-name" placeholder="اسم العضو" autocomplete="off" /></div>
      <p class="muted-text">أول عضو يُعيَّن أميرًا للرحلة تلقائيًا، وتقدر تغيّره لاحقًا.</p>`,
    footer: `<button class="btn btn-primary btn-block" id="m-save">${icons.plus} إضافة</button>`,
  });
  const input = $('#m-name');
  input.focus();
  const save = () => {
    const name = input.value.trim();
    if (!name) { toast('اكتب الاسم'); return; }
    db.addMember(t.id, name);
    closeModal();
    render();
    toast('تمت الإضافة ✓');
  };
  $('#m-save').onclick = save;
  input.onkeydown = (e) => { if (e.key === 'Enter') save(); };
}

/* ---------------- نافذة: إضافة مكان ---------------- */
function openAddPlace(t) {
  openModal({
    title: 'إضافة مكان',
    body: `
      <div class="field"><label>اسم المكان</label>
        <input class="input" id="p-name" placeholder="مثال: بحيرة أوزنجول" autocomplete="off" /></div>
      <div class="field"><label>ملاحظة <span class="hint">اختياري</span></label>
        <input class="input" id="p-note" placeholder="مثال: أفضل وقت للزيارة الصباح" autocomplete="off" /></div>
      <div class="field"><label>رابط قوقل ماب <span class="hint">اختياري</span></label>
        <input class="input" id="p-map" placeholder="الصق رابط الموقع من قوقل ماب" dir="ltr" autocomplete="off" /></div>
      <div class="pay-note" style="background:var(--teal-050);color:var(--teal-800)">
        ${icons.map}<span>إذا ما لصقت رابط، بيظهر زر بحث تلقائي في قوقل ماب باسم المكان.</span></div>`,
    footer: `<button class="btn btn-primary btn-block" id="p-save">${icons.plus} إضافة المكان</button>`,
  });
  $('#p-name').focus();
  $('#p-save').onclick = () => {
    const name = $('#p-name').value.trim();
    if (!name) { toast('اكتب اسم المكان'); return; }
    db.addPlace(t.id, { name, note: $('#p-note').value, mapUrl: $('#p-map').value });
    closeModal();
    render();
    toast('تمت إضافة المكان ✓');
  };
}

/* ---------------- نافذة: تسجيل قطّة ---------------- */
function openAddExpense(t) {
  const state = {
    type: 'group',
    category: 'food',
    paidBy: t.amirId || t.members[0]?.id,
    shared: new Set(t.members.map(m => m.id)),
  };

  openModal({
    title: 'تسجيل قطّة',
    body: `
      <div class="field"><label>الوصف</label>
        <input class="input" id="e-title" placeholder="مثال: عشاء المطعم" autocomplete="off" /></div>

      <div class="field"><label>المبلغ (${CURRENCIES[t.currency] || t.currency})</label>
        <input class="input" id="e-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" dir="ltr" /></div>

      <div class="field"><label>الفئة</label>
        <div class="cat-grid" id="e-cats">
          ${catList.map(c => `<button type="button" class="cat-opt ${c.key === 'food' ? 'sel' : ''}" data-cat="${c.key}">${c.icon}<span>${c.label}</span></button>`).join('')}
        </div>
      </div>

      <div class="field"><label>نوع القطّة</label>
        <div class="seg" id="e-types">
          <button type="button" class="seg-opt sel" data-type="group">على القروب<small>تنقسم على الكل</small></button>
          <button type="button" class="seg-opt" data-type="some">بين أشخاص<small>تختار المشاركين</small></button>
          <button type="button" class="seg-opt" data-type="personal">خارج القطة<small>شخصي — هدايا/تذاكر</small></button>
        </div>
      </div>

      <div class="field"><label id="payer-label">مين دفع؟</label>
        <div class="picker" id="e-payer">
          ${t.members.map(m => `<button type="button" class="pick ${m.id === state.paidBy ? 'sel' : ''}" data-payer="${m.id}">
            <span class="dot" style="background:${m.color}">${esc(initials(m.name))}</span>${esc(m.name)}</button>`).join('')}
        </div>
      </div>

      <div class="field" id="shared-field">
        <label>المشاركون في القطّة <span class="hint">مين يتقاسمها</span></label>
        <div class="picker" id="e-shared">
          ${t.members.map(m => `<button type="button" class="pick ${state.shared.has(m.id) ? 'sel' : ''}" data-share="${m.id}">
            <span class="dot" style="background:${m.color}">${esc(initials(m.name))}</span>${esc(m.name)}</button>`).join('')}
        </div>
      </div>`,
    footer: `<button class="btn btn-primary btn-block" id="e-save">${icons.check} حفظ القطّة</button>`,
  });

  const sharedField = $('#shared-field');
  const payerLabel = $('#payer-label');

  function refreshTypeUI() {
    // خارج القطة => لا مشاركين (شخص واحد)، القروب => الكل، أشخاص => اختيار
    if (state.type === 'personal') {
      sharedField.style.display = 'none';
      payerLabel.textContent = 'صاحب المصروف';
    } else if (state.type === 'group') {
      sharedField.style.display = 'none';
      payerLabel.textContent = 'مين دفع؟';
    } else {
      sharedField.style.display = 'block';
      payerLabel.textContent = 'مين دفع؟';
    }
  }
  refreshTypeUI();

  // فئات
  modalRoot.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-cat]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); state.category = b.dataset.cat;
  });
  // نوع
  modalRoot.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-type]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); state.type = b.dataset.type; refreshTypeUI();
  });
  // الدافع
  modalRoot.querySelectorAll('[data-payer]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-payer]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); state.paidBy = b.dataset.payer;
  });
  // المشاركون
  modalRoot.querySelectorAll('[data-share]').forEach(b => b.onclick = () => {
    const id = b.dataset.share;
    if (state.shared.has(id)) { state.shared.delete(id); b.classList.remove('sel'); }
    else { state.shared.add(id); b.classList.add('sel'); }
  });

  $('#e-title').focus();
  $('#e-save').onclick = () => {
    const title = $('#e-title').value.trim();
    const amount = parseFloat($('#e-amount').value);
    if (!title) { toast('اكتب وصف القطّة'); return; }
    if (!(amount > 0)) { toast('اكتب مبلغًا صحيحًا'); $('#e-amount').focus(); return; }
    if (!state.paidBy) { toast('اختر مين دفع'); return; }

    let sharedAmong = [];
    if (state.type === 'some') {
      sharedAmong = [...state.shared];
      if (sharedAmong.length === 0) { toast('اختر المشاركين'); return; }
    } else if (state.type === 'group') {
      sharedAmong = t.members.map(m => m.id);
    } else {
      sharedAmong = [state.paidBy];
    }

    db.addExpense(t.id, { title, amount, category: state.category, type: state.type, paidBy: state.paidBy, sharedAmong });
    closeModal();
    render();
    toast('تم حفظ القطّة ✓');
  };
}

/* ---------------- حذف رحلة ---------------- */
function confirmDeleteTrip(t) {
  openModal({
    title: 'حذف الرحلة',
    body: `<p class="muted-text">بتحذف رحلة <b>${esc(t.destination)}</b> بكل قطّاتها وأماكنها. ما تقدر تتراجع.</p>`,
    footer: `<div style="display:flex;gap:10px">
      <button class="btn btn-ghost btn-block" data-close>إلغاء</button>
      <button class="btn btn-danger-ghost btn-block" id="del-yes">${icons.trash} حذف</button></div>`,
  });
  modalRoot.querySelectorAll('[data-close]').forEach(el => el.onclick = closeModal);
  $('#del-yes').onclick = () => { db.deleteTrip(t.id); closeModal(); goHome(); toast('تم حذف الرحلة'); };
}

/* =========================================================
   إقلاع التطبيق
   ========================================================= */
render();

// تسجيل خدمة العمل دون اتصال (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
