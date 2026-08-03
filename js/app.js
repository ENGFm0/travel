/* =========================================================
   app.js — بوردنق: قطة القروب + الميزانية الشخصية + القطّات المشتركة + تجارب الأماكن
   ========================================================= */
import * as db from './store.js';
import { poolStats, memberBudget, sharedNet, settleShared } from './settle.js';
import { icons, catList, catIcon } from './icons.js';
import { COUNTRIES, flagOf } from './countries.js';
import { AIRPORTS, airlineName, flightIdent } from './airports.js';
import * as sync from './sync.js';

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

/* ---------------- خرائط قوقل (بحث حي عبر Places API) ----------------
   المفتاح الافتراضي مدمج للعمل مباشرة على الموقع.
   مفتاح خرائط قوقل client-side علنيّ بطبيعته — حمايته بتقييد النطاق (HTTP referrers)
   من Google Cloud، وليس بإخفائه. يمكن لكل جهاز تجاوزه من الإعدادات.
--------------------------------------------------------------------- */
const MAPS_KEY_LS = 'boarding.mapsKey';
const DEFAULT_MAPS_KEY = 'AIzaSyBaJPU21zfuupnhP6HLIApc7fhb_UkbnPs';
function getMapsKey() { try { return localStorage.getItem(MAPS_KEY_LS) || DEFAULT_MAPS_KEY; } catch { return DEFAULT_MAPS_KEY; } }
function setMapsKey(k) { try { k && k.trim() ? localStorage.setItem(MAPS_KEY_LS, k.trim()) : localStorage.removeItem(MAPS_KEY_LS); } catch {} }

let _mapsPromise = null;
function loadMaps() {
  if (window.google?.maps?.places) return Promise.resolve(true);
  const key = getMapsKey();
  if (!key) return Promise.reject(new Error('no-key'));
  if (_mapsPromise) return _mapsPromise;
  _mapsPromise = new Promise((resolve, reject) => {
    window.__boardingMapsReady = () => resolve(true);
    const s = document.createElement('script');
    s.async = true;
    s.onerror = () => { _mapsPromise = null; reject(new Error('load-failed')); };
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=ar&loading=async&callback=__boardingMapsReady`;
    document.head.appendChild(s);
  });
  return _mapsPromise;
}
const mapsSearchUrl = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
const mapsPlaceUrl = (q, placeId) => placeId
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}&query_place_id=${encodeURIComponent(placeId)}`
  : mapsSearchUrl(q);

/* ---------------- سعر الصرف التلقائي ---------------- */
// 1 عملة الديار = rate عملة الوجهة — عدة مصادر لضمان النجاح
async function fetchRate(home, dest) {
  if (!home || !dest || home === dest) return 1;
  const h = home.toLowerCase(), d = dest.toLowerCase();
  const round = (v) => Math.round(v * 10000) / 10000;

  // مصدر أساسي: fawazahmed0 عبر jsDelivr (موثوق وسريع، بدون مفتاح)
  const cdns = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${h}.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/${h}.json`,
  ];
  for (const url of cdns) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const v = data?.[h]?.[d];
      if (v) return round(v);
    } catch { /* جرّب التالي */ }
  }
  // احتياطي: open.er-api
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(home)}`);
    const data = await res.json();
    const v = data?.rates?.[dest];
    if (v) return round(v);
  } catch { /* لا شيء */ }
  throw new Error('no-rate');
}

/* ---------------- جلب تفاصيل الرحلة (AeroDataBox عبر RapidAPI) ---------------- */
const FLIGHT_KEY_LS = 'boarding.flightKey';
function getFlightKey() { try { return localStorage.getItem(FLIGHT_KEY_LS) || ''; } catch { return ''; } }
function setFlightKey(k) { try { k && k.trim() ? localStorage.setItem(FLIGHT_KEY_LS, k.trim()) : localStorage.removeItem(FLIGHT_KEY_LS); } catch {} }
const flightawareUrl = (no) => 'https://ar.flightaware.com/live/flight/' + encodeURIComponent(flightIdent(no));

// yyyy-mm-ddThh:mm من نص وقت AeroDataBox المحلي ("2026-08-12 02:00+03:00")
function toLocalInput(s) {
  if (!s) return '';
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : '';
}
async function fetchFlight(flightNo, dateStr) {
  const key = getFlightKey();
  if (!key) throw new Error('no-key');
  const num = flightNo.replace(/\s+/g, '').toUpperCase();
  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(num)}/${dateStr}?withAircraftImage=false&withLocation=false`;
  const res = await fetch(url, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' } });
  if (res.status === 204) throw new Error('not-found');
  if (!res.ok) throw new Error('http ' + res.status);
  const data = await res.json();
  const f = Array.isArray(data) ? data[0] : (data.flights ? data.flights[0] : data);
  if (!f) throw new Error('not-found');
  const dep = f.departure || {}, arr = f.arrival || {};
  return {
    flightNo: f.number || num,
    from: (dep.airport?.iata ? dep.airport.iata + ' — ' + (dep.airport.name || '') : ''),
    to: (arr.airport?.iata ? arr.airport.iata + ' — ' + (arr.airport.name || '') : ''),
    depAt: toLocalInput(dep.scheduledTime?.local || dep.revisedTime?.local),
    arrAt: toLocalInput(arr.scheduledTime?.local || arr.revisedTime?.local),
    terminal: dep.terminal || '',
    gate: dep.gate || '',
    aircraft: f.aircraft?.model || '',
    status: f.status || '',
  };
}

/* ---------------- منتقي الدول (بحث) ---------------- */
function wireCountryPicker(input, list, onPick) {
  const render = () => {
    const q = input.value.trim();
    const ql = q.toLowerCase();
    const items = (q ? COUNTRIES.filter(([code, ar]) => ar.includes(q) || code.toLowerCase().includes(ql)) : COUNTRIES).slice(0, 8);
    if (!items.length) { list.innerHTML = ''; list.classList.remove('open'); return; }
    list.innerHTML = items.map(([code, ar, cur]) => `
      <button type="button" class="ac-item" data-code="${code}" data-ar="${esc(ar)}" data-cur="${cur}">
        <span class="ac-flag">${flagOf(code)}</span>
        <span class="ac-txt"><b>${esc(ar)}</b><small>${cur}</small></span></button>`).join('');
    list.classList.add('open');
    list.querySelectorAll('.ac-item').forEach(b => b.onclick = () => {
      input.value = b.dataset.ar; list.innerHTML = ''; list.classList.remove('open');
      onPick({ code: b.dataset.code, ar: b.dataset.ar, cur: b.dataset.cur });
    });
  };
  input.oninput = render;
  input.onfocus = render;
  input.onblur = () => setTimeout(() => list.classList.remove('open'), 180);
}

/* منتقي المطارات (بحث بالرمز أو المدينة) */
function wireAirportPicker(input, list) {
  const render = () => {
    const q = input.value.trim();
    const ql = q.toLowerCase();
    const items = (q ? AIRPORTS.filter(([code, name]) => code.toLowerCase().includes(ql) || name.includes(q)) : AIRPORTS).slice(0, 8);
    if (!items.length) { list.innerHTML = ''; list.classList.remove('open'); return; }
    list.innerHTML = items.map(([code, name, cc]) => `
      <button type="button" class="ac-item" data-val="${esc(code + ' — ' + name)}">
        <span class="ac-flag">${flagOf(cc)}</span>
        <span class="ac-txt"><b>${esc(code)}</b><small>${esc(name)}</small></span></button>`).join('');
    list.classList.add('open');
    list.querySelectorAll('.ac-item').forEach(b => b.onclick = () => {
      input.value = b.dataset.val; list.innerHTML = ''; list.classList.remove('open');
    });
  };
  input.oninput = render;
  input.onfocus = render;
  input.onblur = () => setTimeout(() => list.classList.remove('open'), 180);
}

/* ---------------- التنقّل ---------------- */
const R = { tripId: null, tab: 'budget' };
function go(tripId, tab = 'budget') { R.tripId = tripId; R.tab = tab; render(); window.scrollTo(0, 0); }
function goHome() { R.tripId = null; render(); }
$('#brandBtn').addEventListener('click', goHome);

const safeLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const authState = { user: null, guest: !!safeLS('boarding.guest'), checked: false };
let pendingJoin = null; // معرّف رحلة مشتركة بانتظار تسجيل الدخول

/* هويتي في الرحلة — محلية لكل جهاز (لا تُزامَن)، وتُقفل على الحساب إن طابق عضوًا */
function identityLocked(t) {
  if (!authState.user) return false;
  const nm = (authState.user.user_metadata?.name || '').trim();
  return !!(nm && t.members.find(x => x.name.trim() === nm));
}
function getMyId(t) {
  if (authState.user) {
    const nm = (authState.user.user_metadata?.name || '').trim();
    if (nm) { const m = t.members.find(x => x.name.trim() === nm); if (m) return m.id; }
  }
  const saved = safeLS('boarding.me.' + t.id);
  if (saved && t.members.find(x => x.id === saved)) return saved;
  return t.amirId;
}
function setMyId(t, id) { try { localStorage.setItem('boarding.me.' + t.id, id); } catch {} }

function render() {
  if (!authState.checked && !authState.guest && !authState.user) { renderSplash(); return; }
  if (!authState.user && !authState.guest) { renderAuth(); return; }
  const t = R.tripId && db.getTrip(R.tripId);
  if (t) renderTrip(t, R.tab);
  else { R.tripId = null; renderHome(); }
}

/* =========================================================
   شاشة الانتظار
   ========================================================= */
function renderSplash() {
  headerActions.innerHTML = '';
  view.innerHTML = `<div class="splash">
    <div class="splash-mark">${icons.pin}</div>
    <div class="splash-name">بوردنق</div>
    <div class="splash-dots"><span></span><span></span><span></span></div>
  </div>`;
}

/* =========================================================
   صفحة الدخول / التسجيل
   ========================================================= */
let authMode = 'login'; // login | signup
function renderAuth() {
  headerActions.innerHTML = '';
  const isSignup = authMode === 'signup';
  view.innerHTML = `
    <div class="auth">
      <div class="auth-hero">
        <div class="auth-logo">${icons.pin}</div>
        <h1>بوردنق</h1>
        <p>${pendingJoin ? 'انضم لرحلة القروب — سجّل دخولك أو أنشئ حساباً أولاً.' : 'نظّم رحلة القروب: القطة، المصاريف، الأماكن — بمكان واحد.'}</p>
      </div>

      <div class="auth-card">
        <div class="auth-tabs">
          <button class="auth-tab ${!isSignup ? 'active' : ''}" data-mode="login">دخول</button>
          <button class="auth-tab ${isSignup ? 'active' : ''}" data-mode="signup">حساب جديد</button>
        </div>

        <form id="auth-form" class="auth-form">
          ${isSignup ? `<div class="field"><label>الاسم</label>
            <div class="ac-wrap"><span class="ac-icon">${icons.guest}</span>
              <input class="input ac-input" id="au-name" placeholder="اسمك" autocomplete="name"></div></div>` : ''}
          <div class="field"><label>البريد الإلكتروني</label>
            <div class="ac-wrap"><span class="ac-icon">${icons.mail}</span>
              <input class="input ac-input" id="au-email" type="email" placeholder="you@example.com" dir="ltr" autocomplete="email"></div></div>
          <div class="field"><label>كلمة المرور</label>
            <div class="ac-wrap"><span class="ac-icon">${icons.lock}</span>
              <input class="input ac-input" id="au-pass" type="password" placeholder="••••••••" dir="ltr" autocomplete="${isSignup ? 'new-password' : 'current-password'}"></div></div>
          <button type="submit" class="btn btn-primary btn-block" id="au-submit">${isSignup ? icons.check + ' إنشاء الحساب' : icons.lock + ' تسجيل الدخول'}</button>
        </form>

        <div class="auth-or"><span>أو</span></div>

        <button class="btn btn-ghost btn-block auth-google" id="au-google">
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.7 30.1 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.5z"/><path fill="#FBBC05" d="M10.3 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.5l-7.1-5.5c-2 1.3-4.6 2.1-7.9 2.1-6.4 0-11.8-3.8-13.7-9.4l-7.8 6.1C6.4 42.6 14.6 48 24 48z"/></svg>
          المتابعة عبر Google
        </button>
        <button class="btn btn-ghost btn-block" id="au-magic">${icons.wand} رابط دخول عبر البريد</button>
        ${pendingJoin ? '' : `<button class="btn btn-ghost btn-block auth-guest" id="au-guest">${icons.guest} استمر كضيف</button>`}

        <p class="auth-note" id="au-note"></p>
      </div>
    </div>`;

  view.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { authMode = b.dataset.mode; renderAuth(); });
  const note = $('#au-note');
  const setNote = (msg, ok) => { note.textContent = msg; note.className = 'auth-note ' + (ok ? 'ok' : 'err'); };
  const email = () => $('#au-email').value.trim();
  const pass = () => $('#au-pass').value;

  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!email()) return setNote('اكتب بريدك الإلكتروني');
    if (pass().length < 6) return setNote('كلمة المرور ٦ أحرف على الأقل');
    const btn = $('#au-submit'); btn.disabled = true;
    try {
      if (isSignup) {
        const { data, error } = await sync.signUpEmail(email(), pass(), $('#au-name')?.value.trim());
        if (error) throw error;
        if (data.session) finishAuth(data.user);
        else setNote('تم الإنشاء ✓ راجع بريدك لتأكيد الحساب ثم سجّل الدخول', true);
      } else {
        const { data, error } = await sync.signInEmail(email(), pass());
        if (error) throw error;
        finishAuth(data.user);
      }
    } catch (err) { setNote(authErr(err)); }
    finally { btn.disabled = false; }
  };

  $('#au-google').onclick = async () => {
    try { const { error } = await sync.signInOAuth('google'); if (error) throw error; }
    catch (err) { setNote(authErr(err) + ' (فعّل مزوّد Google في Supabase)'); }
  };
  $('#au-magic').onclick = async () => {
    if (!email()) return setNote('اكتب بريدك أولًا للرابط السحري');
    try { const { error } = await sync.signInMagic(email()); if (error) throw error; setNote('أرسلنا رابط الدخول إلى بريدك ✉️', true); }
    catch (err) { setNote(authErr(err)); }
  };
  const guestBtn = $('#au-guest');
  if (guestBtn) guestBtn.onclick = () => {
    try { localStorage.setItem('boarding.guest', '1'); } catch {}
    authState.guest = true; render();
  };
}

function authErr(err) {
  const m = (err && (err.message || err.error_description)) || '';
  if (/Invalid login/i.test(m)) return 'بريد أو كلمة مرور غير صحيحة';
  if (/already registered/i.test(m)) return 'هذا البريد مسجّل — سجّل الدخول';
  if (/not configured|provider/i.test(m)) return 'الطريقة غير مفعّلة في Supabase';
  if (/Failed to fetch|NetworkError|import/i.test(m)) return 'تعذّر الاتصال بالمزامنة';
  return m || 'صار خطأ، حاول مرة ثانية';
}

function finishAuth(user) {
  authState.user = user;
  try { localStorage.removeItem('boarding.guest'); } catch {}
  authState.guest = false;
  toast('أهلًا ' + (user?.user_metadata?.name || user?.email || '') + ' ✓');
  render();
  ensureSubscriptions();
  if (pendingJoin) checkJoin();
}

/* =========================================================
   الرئيسية — قائمة الرحلات
   ========================================================= */
function renderHome() {
  headerActions.innerHTML = accountChip();
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
  wireAccount();
}

function accountChip() {
  if (authState.user) {
    const nm = authState.user.user_metadata?.name || authState.user.email || 'حسابي';
    return `<button class="btn btn-ghost btn-sm" data-act="account" title="${esc(nm)}">${icons.guest} <span class="acc-name">${esc(nm)}</span></button>`;
  }
  return `<button class="btn btn-ghost btn-sm" data-act="login">${icons.logout} تسجيل الدخول</button>`;
}
function wireAccount() {
  const a = headerActions.querySelector('[data-act="account"]');
  if (a) a.onclick = () => openAccount();
  const l = headerActions.querySelector('[data-act="login"]');
  if (l) l.onclick = () => { try { localStorage.removeItem('boarding.guest'); } catch {} authState.guest = false; render(); };
}
function openAccount() {
  const u = authState.user;
  openModal({
    title: 'حسابي',
    body: `<div class="member-row"><span class="avatar" style="background:var(--teal-800)">${esc((u.user_metadata?.name || u.email || '؟')[0])}</span>
      <div class="member-grow"><div class="member-name">${esc(u.user_metadata?.name || 'مستخدم')}</div>
      <div class="muted-text" style="font-size:.82rem" dir="ltr">${esc(u.email || '')}</div></div></div>`,
    footer: `<button class="btn btn-danger-ghost btn-block" id="ac-out">${icons.logout} تسجيل الخروج</button>`,
  });
  $('#ac-out').onclick = async () => {
    try { await sync.signOut(); } catch {}
    authState.user = null; closeModal(); render(); toast('تم تسجيل الخروج');
  };
}

function tripCard(t) {
  const ps = poolStats(t);
  const amir = db.memberById(t, t.amirId);
  return `
    <button class="trip-card" data-trip="${t.id}">
      <div class="trip-cover">
        <span class="flag">${t.flag}</span>
        ${t.cloud ? `<span class="cloud-tag">${icons.cloud} مزامنة</span>` : ''}
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
  { key: 'itinerary', label: 'الرحلة', icon: icons.route },
  { key: 'budget', label: 'مصاريفي', icon: icons.coins },
  { key: 'pool', label: 'القطة', icon: icons.wallet },
  { key: 'memories', label: 'ذكريات', icon: icons.images },
];

function renderTrip(t, tab) {
  const amir = db.memberById(t, t.amirId);
  headerActions.innerHTML = `
    <button class="btn btn-ghost btn-icon ${t.cloud ? 'synced' : ''}" data-act="share" title="مشاركة ومزامنة">${t.cloud ? icons.cloud : icons.share}</button>
    <button class="btn btn-ghost btn-icon" data-act="settings" title="إعدادات الرحلة">${icons.gear}</button>
    <button class="btn btn-ghost btn-sm" data-act="home">${icons.back} رحلاتي</button>`;
  headerActions.querySelector('[data-act="home"]').onclick = goHome;
  headerActions.querySelector('[data-act="settings"]').onclick = () => openSettings(t);
  headerActions.querySelector('[data-act="share"]').onclick = () => openShare(t);

  const tabsHtml = `<nav class="tabs">${TABS.map(x => `
    <button class="tab ${x.key === tab ? 'active' : ''}" data-tab="${x.key}">${x.icon}<span>${x.label}</span></button>`).join('')}</nav>`;

  let content = '';
  if (tab === 'itinerary') content = tabItinerary(t);
  else if (tab === 'budget') content = tabBudget(t);
  else if (tab === 'pool') content = tabPool(t);
  else if (tab === 'memories') content = tabMemories(t);

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
  const me = db.memberById(t, getMyId(t)) || db.memberById(t, t.amirId);
  if (!me) return `<div class="empty">${icons.users}<h3>أضِف أعضاء القروب</h3>
    <button class="btn btn-primary mt" data-act="go-pool">إدارة القطة والأعضاء</button></div>`;

  const b = memberBudget(t, me.id);
  const locked = identityLocked(t);

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
        ${b.sharedNet !== 0 ? `<div class="bk-note">${b.sharedNet > 0 ? 'لك' : 'عليك'} في القطّات المشتركة: <b>${money(Math.abs(b.sharedNet), t)}</b></div>` : ''}
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
      <span class="me-chip">${avatar(me, 30)} <b>${esc(me.name)}</b>${me.id === t.amirId ? ' <span class="chip amir" style="padding:1px 7px;font-size:.7rem">أمير</span>' : ''}</span>
      ${locked ? '' : `<button class="btn btn-ghost btn-sm" data-act="who-am-i">${icons.edit} لست أنا؟</button>`}
      ${b.budget != null ? `<button class="btn btn-ghost btn-sm" data-act="set-budget">${icons.edit} الميزانية</button>` : ''}
    </div>
    <p class="muted-text" style="font-size:.82rem;margin:-6px 0 14px">مصاريفك الشخصية خاصة بك — تعدّلها أنت فقط.</p>
    ${breakdown}
    ${b.budget != null ? `
      <div class="section-head"><h2>مصاريفي الشخصية</h2></div>
      ${list}
      <button class="btn btn-primary btn-block mt" data-act="add-personal">${icons.plus} تسجيل مصروف شخصي</button>` : ''}`;
}

/* ---------------- تبويب: القطة ---------------- */
function tabPool(t) {
  const ps = poolStats(t);
  const isAmir = getMyId(t) === t.amirId;

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
        ${isAmir ? `<button class="icon-btn" data-toggle-paid="${id}" title="${paid ? 'إلغاء' : 'تأكيد السداد'}">${icons.check}</button>` : ''}
        ${isAmir && m.phone && !paid ? `<a class="icon-btn" style="color:var(--green)" href="${waLink(m.phone, reqText)}" target="_blank" rel="noopener" title="اطلب عبر واتساب">${icons.send}</a>` : ''}
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
      ${!isAmir ? `<div class="pay-note" style="background:var(--sand-100);color:var(--sand-600)">${icons.crown}<span>تأكيد السداد يكون من <b>أمير الرحلة</b> فقط.</span></div>` : ''}
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
    ${poolBody}

    ${sharedSection(t)}`;
}

/* ---------------- قسم: قطّات مشتركة بين أشخاص (تحت القطة) ---------------- */
function sharedSection(t) {
  const canAdd = t.members.length >= 2;
  const list = t.sharedExpenses.slice().sort((a, c) => c.createdAt - a.createdAt);

  const listHtml = list.length ? list.map(e => {
    const payer = db.memberById(t, e.paidBy);
    const names = e.participants.map(id => db.memberById(t, id)?.name).filter(Boolean).join('، ');
    return `<div class="exp">
      <span class="exp-cat">${catIcon(e.category)}</span>
      <div class="exp-body"><div class="exp-title">${esc(e.title)}</div>
        <div class="exp-sub">دفعها ${payer ? esc(payer.name) : '؟'} · بين ${e.participants.length} (${esc(names)})</div></div>
      <div class="exp-amount">${dual(e.amount, t)}</div>
      <button class="icon-btn danger" data-del-shared="${e.id}">${icons.trash}</button>
    </div>`;
  }).join('') : `<p class="muted-text center" style="padding:12px">ما فيه قطّات مشتركة بعد.</p>`;

  const txns = settleShared(t);
  const txHtml = txns.map(x => {
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
  }).join('');

  return `
    <div class="shared-block">
      <div class="section-head"><h2>قطّات مشتركة</h2><span class="hint">بين أشخاص · خارج الصندوق</span></div>
      <div class="pay-note" style="background:var(--teal-050);color:var(--teal-800)">${icons.info}
        <span>مصروف يخص <b>أشخاصًا محددين</b> (٢ أو أكثر)، يُقسّم بالتساوي ويتسوّى بينهم مباشرة — منفصل عن صندوق القطة.</span></div>
      ${listHtml}
      ${txns.length ? `<div class="section-head" style="margin-top:16px"><h2 style="font-size:1rem">التسوية بينهم</h2></div>${txHtml}` : ''}
      ${canAdd
        ? `<button class="btn btn-ghost btn-block mt" data-act="add-shared">${icons.plus} قطة مشتركة</button>`
        : `<p class="muted-text center mt">أضِف عضوين على الأقل.</p>`}
    </div>`;
}

/* ---------------- تبويب: الأماكن ---------------- */
function stars(n, size) {
  const s = size || 14;
  let out = '<span class="stars" style="--sz:' + s + 'px">';
  for (let i = 1; i <= 5; i++) out += `<span class="star ${i <= n ? 'on' : ''}">${icons.star}</span>`;
  return out + '</span>';
}
function avgRating(p) {
  const rs = (p.reviews || []).filter(r => r.rating > 0);
  if (!rs.length) return 0;
  return Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10;
}

/* بطاقة مكان (تُستخدم داخل المدن) */
function placeCard(t, p, i) {
  const avg = avgRating(p);
  const reviews = (p.reviews || []).slice().sort((a, c) => c.createdAt - a.createdAt);
  const reviewsHtml = reviews.map(r => {
    const m = db.memberById(t, r.memberId);
    return `<div class="review">${m ? avatar(m, 30) : ''}
      <div class="review-body"><div class="review-head"><b>${m ? esc(m.name) : 'عضو'}</b> ${r.rating ? stars(r.rating, 12) : ''}</div>
        ${r.note ? `<div class="review-note">${esc(r.note)}</div>` : ''}</div>
      <button class="icon-btn danger" data-del-review="${p.id}|${r.id}">${icons.trash}</button></div>`;
  }).join('');
  return `
    <div class="place">
      <span class="place-idx">${i + 1}</span>
      <div class="place-body">
        <div class="place-name">${esc(p.name)}
          ${avg ? `<span class="rating-pill">${icons.star} ${avg} <small>(${reviews.length})</small></span>` : ''}</div>
        ${p.address ? `<div class="place-note">${esc(p.address)}</div>` : (p.note ? `<div class="place-note">${esc(p.note)}</div>` : '')}
        <div class="place-links">
          <a class="map-link" href="${p.mapUrl ? esc(p.mapUrl) : mapsPlaceUrl((p.name + ' ' + (t.destination || '')).trim(), p.placeId)}" target="_blank" rel="noopener">${icons.map} قوقل ماب</a>
          <button class="map-link" style="background:${p.visited ? 'var(--green-bg)' : '#eef1f0'};color:${p.visited ? 'var(--green)' : 'var(--ink-500)'}" data-visited="${p.id}">
            ${icons.check} ${p.visited ? 'تمّت الزيارة' : 'لم تُزَر'}</button>
        </div>
        ${reviews.length ? `<div class="reviews">${reviewsHtml}</div>` : ''}
        <div class="place-actions">
          <button class="btn btn-ghost btn-sm" data-add-review="${p.id}">${icons.star} تجربتك</button>
          <button class="btn btn-ghost btn-sm" data-add-mem="${p.id}|${p.cityId || ''}">${icons.camera} ذكرى</button>
        </div>
      </div>
      <button class="icon-btn danger" data-del-place="${p.id}">${icons.trash}</button>
    </div>`;
}

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('ar', { calendar: 'gregory', weekday: 'long', day: 'numeric', month: 'long' }); }
  catch { return iso; }
}
function fmtDT(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ar', { calendar: 'gregory', day: 'numeric', month: 'short' }) +
      ' · ' + d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

/* ---------------- تبويب: الرحلة (خط الرحلة) ---------------- */
function tabItinerary(t) {
  const it = t.itinerary || {};
  const ob = it.outbound || {}, ib = it.inbound || {};
  const DAY = 86400000, now = Date.now();
  const dep = ob.depAt ? new Date(ob.depAt).getTime() : null;
  const ret = ib.depAt ? new Date(ib.depAt).getTime() : null;

  let cdBig = '', cdSub = '', cdState = '';
  if (dep) {
    if (now < dep) { cdBig = String(Math.ceil((dep - now) / DAY)); cdSub = 'يوم على المغادرة ✈️'; cdState = 'soon'; }
    else if (ret && now <= ret) { cdBig = String(Math.ceil((ret - now) / DAY)); cdSub = 'يوم على العودة · الرحلة جارية'; cdState = 'live'; }
    else { cdBig = '🎉'; cdSub = ret ? 'انتهت الرحلة — رحلة سعيدة كانت' : 'الرحلة جارية'; cdState = 'done'; }
  }
  const duration = dep && ret ? Math.max(1, Math.round((ret - dep) / DAY)) : null;

  const countdown = dep
    ? `<div class="cd ${cdState}">
        <div class="cd-num">${cdBig}</div>
        <div class="cd-sub">${cdSub}</div>
        ${duration ? `<div class="cd-dur">${icons.calendar} مدة الرحلة ${duration} ليالٍ</div>` : ''}
       </div>`
    : `<div class="empty" style="padding:26px">${icons.plane}<h3>حدّد مواعيد رحلتكم</h3>
        <p>أضِف رحلة المغادرة والعودة ليظهر العدّاد التنازلي.</p>
        <button class="btn btn-primary mt" data-edit-flight="outbound">إضافة رحلة</button></div>`;

  const apCode = (s) => (s || '').split(' — ')[0];
  const flightBlock = (label, leg, f) => {
    const air = airlineName(f.flightNo);
    const has = f.flightNo || f.from || f.to || f.depAt;
    const detail = (ic, txt) => txt ? `<span class="fd">${ic} ${esc(txt)}</span>` : '';
    return `
    <div class="flight-leg">
      <div class="flight-leg-head">
        <span class="flight-ic ${leg === 'inbound' ? 'ret' : ''}">${icons.plane}</span>
        <div class="flight-body">
          <div class="flight-label">${label} ${has && (f.from || f.to) ? `<span class="flight-route">${esc(apCode(f.from) || '—')} ← ${esc(apCode(f.to) || '—')}</span>` : ''}</div>
          <div class="flight-when">${f.depAt ? esc(fmtDT(f.depAt)) : '—'}${f.arrAt ? ' ← ' + esc(fmtDT(f.arrAt)) : ''}</div>
        </div>
        ${f.flightNo ? `<span class="flight-no">${esc(f.flightNo)}</span>` : ''}
        <button class="icon-btn" data-edit-flight="${leg}" title="تعديل">${icons.edit}</button>
      </div>
      ${has ? `<div class="flight-details">
        ${detail('✈️', air)}
        ${detail(icons.clock, f.status)}
        ${f.terminal ? `<span class="fd">صالة ${esc(f.terminal)}</span>` : ''}
        ${f.gate ? `<span class="fd">بوابة ${esc(f.gate)}</span>` : ''}
        ${detail('🛩️', f.aircraft)}
        ${f.flightNo ? `<a class="fd link" href="${flightawareUrl(f.flightNo)}" target="_blank" rel="noopener">${icons.external} FlightAware</a>` : ''}
      </div>` : ''}
    </div>`;
  };

  const hasFlights = dep || ret || ob.flightNo || ib.flightNo || ob.from || ib.from;
  const flights = hasFlights ? `
    <div class="section-head"><h2>الطيران</h2></div>
    <div class="card card-pad flights">
      ${flightBlock('المغادرة', 'outbound', ob)}
      <div class="flight-divider"></div>
      ${flightBlock('العودة', 'inbound', ib)}
    </div>` : '';

  // التذكيرات
  const doneCount = t.checklist.filter(c => c.done).length;
  const checkHtml = t.checklist.map(c => `
    <div class="check-row ${c.done ? 'done' : ''}">
      <button class="check-box" data-check="${c.id}">${c.done ? icons.check : ''}</button>
      <span class="check-text">${esc(c.text)}</span>
      <button class="icon-btn danger" data-del-check="${c.id}">${icons.trash}</button>
    </div>`).join('');

  // المدن
  const cities = t.cities.slice().sort((a, b) => a.order - b.order);
  const citiesHtml = cities.map((c, ci) => {
    const places = t.places.filter(p => p.cityId === c.id);
    const placesHtml = places.length
      ? places.map((p, i) => placeCard(t, p, i)).join('')
      : `<p class="muted-text center" style="padding:10px">ما فيه أماكن بهالمدينة بعد.</p>`;
    const dates = c.fromDate || c.toDate ? `${fmtDate(c.fromDate)}${c.toDate ? ' ← ' + fmtDate(c.toDate) : ''}` : '';
    return `
      <div class="city">
        <div class="city-head">
          <div class="city-title"><span class="city-idx">${ci + 1}</span>
            <div><div class="city-name">${esc(c.name)}</div>${dates ? `<div class="city-dates">${dates}</div>` : ''}</div></div>
          <div class="row-actions">
            <button class="icon-btn" data-edit-city="${c.id}" title="تعديل">${icons.edit}</button>
            <button class="icon-btn danger" data-del-city="${c.id}" title="حذف">${icons.trash}</button>
          </div>
        </div>
        ${c.hotel && c.hotel.name
          ? `<div class="hotel">${icons.bed}<div class="hotel-body"><b>${esc(c.hotel.name)}</b>
              ${c.hotel.note ? `<div class="muted-text" style="font-size:.82rem">${esc(c.hotel.note)}</div>` : ''}</div>
              <a class="map-link" href="${c.hotel.mapUrl ? esc(c.hotel.mapUrl) : mapsSearchUrl(c.hotel.name + ' ' + c.name)}" target="_blank" rel="noopener">${icons.map} الخريطة</a>
              <button class="icon-btn" data-city-hotel="${c.id}">${icons.edit}</button></div>`
          : `<button class="btn btn-ghost btn-sm city-add-hotel" data-city-hotel="${c.id}">${icons.bed} أضف السكن</button>`}
        <div class="city-places">${placesHtml}</div>
        <button class="btn btn-ghost btn-sm mt" data-add-place-city="${c.id}" style="width:100%">${icons.plus} أضف مكان في ${esc(c.name)}</button>
      </div>`;
  }).join('');

  const orphan = t.places.filter(p => !p.cityId || !cities.find(c => c.id === p.cityId));
  const orphanHtml = orphan.length ? `
    <div class="city"><div class="city-head"><div class="city-title"><span class="city-idx">•</span>
      <div class="city-name">بدون مدينة</div></div></div>
      <div class="muted-text" style="font-size:.83rem;margin-bottom:8px">انقل هذه الأماكن لمدنها بحذفها وإضافتها داخل مدينة.</div>
      <div class="city-places">${orphan.map((p, i) => placeCard(t, p, i)).join('')}</div></div>` : '';

  return `
    ${countdown}
    ${flights}

    <div class="section-head"><h2>تذكيرات التجهيز</h2><span class="hint">${doneCount}/${t.checklist.length}</span></div>
    <div class="card card-pad"><div class="checklist">${checkHtml || '<p class="muted-text center">ما فيه تذكيرات.</p>'}</div>
      <button class="btn btn-ghost btn-block mt" data-act="add-check">${icons.plus} أضف تذكير</button></div>

    <div class="section-head"><h2>المدن والأماكن</h2><span class="hint">${cities.length} مدن</span></div>
    ${cities.length ? citiesHtml : `<div class="empty">${icons.city}<h3>أضِف مدن الرحلة</h3><p>ضِف كل مدينة، وأضِف أماكنها داخلها.</p></div>`}
    ${orphanHtml}
    <button class="btn btn-primary btn-block mt" data-act="add-city">${icons.plus} إضافة مدينة</button>`;
}

/* ---------------- تبويب: ذكريات ---------------- */
function memTile(t, m) {
  const place = t.places.find(p => p.id === m.placeId);
  const media = m.type === 'video'
    ? `<video src="${esc(m.url)}#t=0.1" preload="metadata" muted playsinline></video><span class="mem-play">${icons.play}</span>`
    : `<img src="${esc(m.url)}" loading="lazy" alt="">`;
  return `<button class="mem-tile" data-mem="${m.id}">${media}
    ${place ? `<span class="mem-place">${icons.pin} ${esc(place.name)}</span>` : ''}</button>`;
}
function tabMemories(t) {
  const mems = t.memories.slice().sort((a, c) => a.createdAt - c.createdAt);
  const dep = t.itinerary?.departAt ? new Date(t.itinerary.departAt) : null;
  const depDay = dep ? Date.parse(dep.toISOString().slice(0, 10) + 'T00:00:00') : null;

  const groups = {};
  mems.forEach(m => { const k = new Date(m.createdAt).toISOString().slice(0, 10); (groups[k] = groups[k] || []).push(m); });
  const keys = Object.keys(groups).sort();

  const daysHtml = keys.map(k => {
    const dt = Date.parse(k + 'T00:00:00');
    const n = depDay != null ? Math.round((dt - depDay) / 86400000) + 1 : null;
    const label = new Date(k + 'T00:00:00').toLocaleDateString('ar', { calendar: 'gregory', weekday: 'long', day: 'numeric', month: 'long' });
    return `<div class="mem-day">
      <div class="mem-day-head"><span class="mem-day-label">${label}</span>
        ${n && n >= 1 ? `<span class="mem-day-num">اليوم ${n}</span>` : ''}</div>
      <div class="mem-grid">${groups[k].map(m => memTile(t, m)).join('')}</div></div>`;
  }).join('');

  return `
    <div class="pay-note" style="background:var(--teal-050);color:var(--teal-800)">${icons.images}
      <span>صور وفيديوهات الرحلة — مربوطة بالأماكن ومرتّبة بالأيام، تبقى للأبد ويشوفها القروب.</span></div>
    ${mems.length ? `<div class="mem-count">${mems.length} ذكرى</div>${daysHtml}`
      : `<div class="empty">${icons.camera}<h3>ابدأ ألبوم الرحلة</h3><p>أضِف صورك ومقاطعك، واربطها بالأماكن — وارجع لها متى ما تبي.</p></div>`}
    <button class="btn btn-primary btn-block mt" data-act="add-memory">${icons.camera} أضف صورة / فيديو</button>`;
}

function memErr(e) {
  const m = (e && (e.message || e.error)) || '';
  if (/Bucket not found|bucket/i.test(m)) return 'أنشئ مخزن الصور (bucket باسم memories) في Supabase أولًا';
  if (/row-level security|policy|permission|denied/i.test(m)) return 'أضِف صلاحيات التخزين (policies) في Supabase';
  if (/exceeded|maximum|too large|size/i.test(m)) return 'حجم الملف كبير';
  if (/import|Failed to fetch|network/i.test(m)) return 'تعذّر الاتصال بالمزامنة';
  return 'تعذّر الرفع: ' + m;
}

function openAddMemory(t, opts = {}) {
  const placeOpts = t.places.map(p => {
    const c = t.cities.find(x => x.id === p.cityId);
    return `<option value="${p.id}" ${p.id === opts.placeId ? 'selected' : ''}>${esc((c ? c.name + ' · ' : '') + p.name)}</option>`;
  }).join('');
  openModal({
    title: 'أضف ذكرى',
    body: `
      <div class="mem-pick">
        <button type="button" class="mem-pick-btn" id="mm-cam-btn">${icons.camera}<span>الكاميرا</span></button>
        <button type="button" class="mem-pick-btn" id="mm-alb-btn">${icons.images}<span>الألبوم</span></button>
      </div>
      <input type="file" id="mm-cam" accept="image/*,video/*" capture="environment" hidden>
      <input type="file" id="mm-alb" accept="image/*,video/*" hidden>
      <div class="mem-preview" id="mm-preview"></div>
      <div class="field"><label>تعليق <span class="hint">اختياري</span></label>
        <input class="input" id="mm-cap" placeholder="مثال: أجمل غروب بالرحلة" autocomplete="off"></div>
      <div class="field"><label>المكان <span class="hint">اختياري</span></label>
        <div class="select-wrap">${icons.chevron}<select class="select" id="mm-place">
          <option value="">— بدون مكان —</option>${placeOpts}</select></div></div>
      <div class="conv-preview" id="mm-status"></div>`,
    footer: `<button class="btn btn-primary btn-block" id="mm-save">${icons.check} حفظ الذكرى</button>`,
  });

  let file = null, objUrl = null;
  const preview = $('#mm-preview');
  const setFile = (f) => {
    file = f;
    if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
    if (!f) { preview.innerHTML = ''; preview.classList.remove('has'); return; }
    objUrl = URL.createObjectURL(f);
    preview.innerHTML = (f.type || '').startsWith('video')
      ? `<video src="${objUrl}" controls playsinline></video>`
      : `<img src="${objUrl}" alt="">`;
    preview.classList.add('has');
  };
  $('#mm-cam-btn').onclick = () => $('#mm-cam').click();
  $('#mm-alb-btn').onclick = () => $('#mm-alb').click();
  $('#mm-cam').onchange = (e) => setFile(e.target.files[0]);
  $('#mm-alb').onchange = (e) => setFile(e.target.files[0]);

  $('#mm-save').onclick = async () => {
    const f = file;
    if (!f) { toast('التقط صورة أو اختر من الألبوم'); return; }
    if (f.size > 50 * 1024 * 1024) { toast('الحجم أكبر من 50MB — قصّر الفيديو'); return; }
    if (!sync.syncEnabled()) { toast('فعّل Supabase من الإعدادات'); return; }
    const btn = $('#mm-save'); btn.disabled = true;
    $('#mm-status').innerHTML = 'جارٍ الرفع… قد يأخذ وقتًا حسب الحجم';
    try {
      const { url, path } = await sync.uploadFile(t.id, f);
      const type = (f.type || '').startsWith('video') ? 'video' : 'image';
      const pid = $('#mm-place').value;
      const cid = t.places.find(p => p.id === pid)?.cityId || '';
      db.addMemory(t.id, { url, path, type, caption: $('#mm-cap').value, placeId: pid, cityId: cid, memberId: getMyId(t) });
      closeModal(); render(); toast('تمت إضافة الذكرى ✓');
    } catch (e) { $('#mm-status').innerHTML = `<span style="color:var(--red)">${esc(memErr(e))}</span>`; btn.disabled = false; console.warn(e); }
  };
}

function openMemory(t, id) {
  const m = t.memories.find(x => x.id === id);
  if (!m) return;
  const place = t.places.find(p => p.id === m.placeId);
  const who = db.memberById(t, m.memberId);
  const when = new Date(m.createdAt).toLocaleDateString('ar', { calendar: 'gregory', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  modalRoot.innerHTML = `
    <div class="lightbox">
      <button class="lb-close" data-close aria-label="إغلاق">${icons.close}</button>
      <div class="lb-media">${m.type === 'video'
        ? `<video src="${esc(m.url)}" controls autoplay playsinline></video>`
        : `<img src="${esc(m.url)}" alt="">`}</div>
      <div class="lb-meta">
        ${m.caption ? `<div class="lb-cap">${esc(m.caption)}</div>` : ''}
        <div class="lb-sub">${place ? icons.pin + ' ' + esc(place.name) + ' · ' : ''}${who ? esc(who.name) + ' · ' : ''}${esc(when)}</div>
        <button class="btn btn-danger-ghost btn-sm mt" id="lb-del">${icons.trash} حذف الذكرى</button>
      </div>
    </div>`;
  modalRoot.classList.add('open');
  modalRoot.setAttribute('aria-hidden', 'false');
  modalRoot.querySelectorAll('[data-close]').forEach(el => el.onclick = closeModal);
  $('#lb-del').onclick = () => {
    const mem = db.removeMemory(t.id, id);
    if (mem?.path) sync.deleteFile(mem.path);
    closeModal(); render(); toast('تم حذف الذكرى');
  };
}

/* =========================================================
   ربط الأحداث
   ========================================================= */
function wire(t, tab) {
  const c = $('#tc');
  const on = (sel, fn) => c.querySelectorAll(sel).forEach(el => el.onclick = fn);

  // مصاريفي
  on('[data-act="who-am-i"]', () => openWhoAmI(t));
  on('[data-act="set-budget"]', () => openSetBudget(t));
  on('[data-act="add-personal"]', () => openExpense(t, 'personal'));
  on('[data-del-personal]', e => { db.removePersonalExpense(t.id, getMyId(t), e.currentTarget.dataset.delPersonal); render(); });
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

  // قطّات مشتركة (تحت القطة)
  on('[data-act="add-shared"]', () => openExpense(t, 'shared'));
  on('[data-del-shared]', e => { db.removeSharedExpense(t.id, e.currentTarget.dataset.delShared); render(); });
  on('[data-pay]', e => { copyText(JSON.parse(e.currentTarget.dataset.pay)); toast('تم نسخ تفاصيل التحويل ✓'); });

  // الرحلة: المواعيد + التذكيرات + المدن + الأماكن
  on('[data-edit-flight]', e => openFlightEdit(t, e.currentTarget.dataset.editFlight));
  on('[data-act="add-check"]', () => openAddCheck(t));
  on('[data-check]', e => { db.toggleCheck(t.id, e.currentTarget.dataset.check); render(); });
  on('[data-del-check]', e => { db.removeCheck(t.id, e.currentTarget.dataset.delCheck); render(); });
  on('[data-act="add-city"]', () => openCity(t));
  on('[data-edit-city]', e => openCity(t, e.currentTarget.dataset.editCity));
  on('[data-del-city]', e => { db.removeCity(t.id, e.currentTarget.dataset.delCity); toast('تم حذف المدينة'); render(); });
  on('[data-city-hotel]', e => openHotel(t, e.currentTarget.dataset.cityHotel));
  on('[data-add-place-city]', e => openPlace(t, e.currentTarget.dataset.addPlaceCity));
  on('[data-visited]', e => { db.togglePlaceVisited(t.id, e.currentTarget.dataset.visited); render(); });
  on('[data-del-place]', e => { db.removePlace(t.id, e.currentTarget.dataset.delPlace); render(); });
  on('[data-add-review]', e => openReview(t, e.currentTarget.dataset.addReview));
  on('[data-del-review]', e => {
    const [pid, rid] = e.currentTarget.dataset.delReview.split('|');
    db.removeReview(t.id, pid, rid); render();
  });
  on('[data-add-mem]', e => { const [pid, cid] = e.currentTarget.dataset.addMem.split('|'); openAddMemory(t, { placeId: pid, cityId: cid }); });

  // ذكريات
  on('[data-act="add-memory"]', () => openAddMemory(t));
  on('[data-mem]', e => openMemory(t, e.currentTarget.dataset.mem));
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
  const st = { homeCode: 'SA', homeAr: 'السعودية', homeCur: 'SAR', destCode: '', destAr: '', destCur: '', rate: null };

  openModal({
    title: 'رحلة جديدة',
    body: `
      <p class="muted-text" style="margin-bottom:14px">أنت أمير الرحلة — تنشئها وتضيف القروب وتحدّد القطة.</p>
      <div class="field"><label>اسمك (أمير الرحلة)</label>
        <input class="input" id="f-amir" placeholder="اسمك" autocomplete="off" value="${esc(authState.user?.user_metadata?.name || (authState.user?.email ? authState.user.email.split('@')[0] : ''))}"></div>
      <div class="field"><label>جوالك <span class="hint">اختياري — لطلبات القطة</span></label>
        <input class="input" id="f-amir-phone" placeholder="مثال: 9665xxxxxxxx" dir="ltr" inputmode="tel" autocomplete="off"></div>
      <div class="field"><label>بلد الوجهة <span class="hint">ابحث</span></label>
        <div class="ac-wrap"><span class="ac-icon">${icons.search}</span>
          <input class="input ac-input" id="f-destc" placeholder="اكتب اسم الدولة" autocomplete="off">
          <div class="ac-list" id="f-destc-list"></div></div></div>
      <div class="field"><label>المدينة / الوجهة <span class="hint">اختياري</span></label>
        <input class="input" id="f-dest" placeholder="مثال: طرابزون" autocomplete="off"></div>
      <div class="field"><label>بلدكم <span class="hint">لتحديد عملتكم</span></label>
        <div class="ac-wrap"><span class="ac-icon">${icons.search}</span>
          <input class="input ac-input" id="f-homec" value="السعودية" autocomplete="off">
          <div class="ac-list" id="f-homec-list"></div></div></div>
      <div class="rate-box" id="f-rate-box"><span class="muted-text">اختر بلد الوجهة ليظهر سعر الصرف تلقائيًا.</span></div>`,
    footer: `<button class="btn btn-primary btn-block" id="f-save">${icons.check} إنشاء الرحلة</button>`,
  });

  const rateBox = $('#f-rate-box');
  async function refreshRate() {
    if (!st.destCur || !st.homeCur) return;
    if (st.destCur === st.homeCur) { st.rate = 1; rateBox.innerHTML = `<span>نفس العملة (${curLabel(st.homeCur)})</span>`; return; }
    rateBox.innerHTML = `<span class="muted-text">جارٍ جلب سعر الصرف…</span>`;
    try {
      st.rate = await fetchRate(st.homeCur, st.destCur);
      rateBox.innerHTML = `<span class="rate-ok">${icons.check} 1 ${curLabel(st.homeCur)} = <b>${st.rate}</b> ${curLabel(st.destCur)}</span><small>تلقائي</small>`;
    } catch {
      st.rate = null;
      rateBox.innerHTML = `<span class="muted-text">تعذّر جلب السعر تلقائيًا — اكتبه:</span>
        <div class="rate-row" style="margin-top:6px">1 ${curLabel(st.homeCur)} = <input class="input" id="f-rate-manual" type="number" step="0.0001" min="0" dir="ltr" style="max-width:120px"> ${curLabel(st.destCur)}</div>`;
    }
  }

  wireCountryPicker($('#f-destc'), $('#f-destc-list'), (c) => {
    st.destCode = c.code; st.destAr = c.ar; st.destCur = c.cur; refreshRate();
  });
  wireCountryPicker($('#f-homec'), $('#f-homec-list'), (c) => {
    st.homeCode = c.code; st.homeAr = c.ar; st.homeCur = c.cur; refreshRate();
  });
  $('#f-amir').focus();

  $('#f-save').onclick = () => {
    const amirName = $('#f-amir').value.trim();
    if (!amirName) { toast('اكتب اسمك'); return; }
    if (!st.destCode) { toast('اختر بلد الوجهة'); return; }
    const city = $('#f-dest').value.trim();
    let rate = st.rate;
    if (rate == null) { rate = parseFloat($('#f-rate-manual')?.value) || 1; }
    const trip = db.createTrip({
      destination: city || st.destAr, country: st.destAr, flag: flagOf(st.destCode),
      destCurrency: st.destCur, homeCurrency: st.homeCur, rate,
      amirName, amirPhone: $('#f-amir-phone').value,
    });
    closeModal(); go(trip.id, 'pool'); toast('تم إنشاء الرحلة ✓');
  };
}

/* إعدادات الرحلة */
function openSettings(t) {
  const st = { homeCur: t.homeCurrency, destCur: t.destCurrency, rate: t.rate };
  openModal({
    title: 'إعدادات الرحلة',
    body: `
      <div class="field"><label>المدينة / الوجهة</label><input class="input" id="s-dest" value="${esc(t.destination)}"></div>
      <div class="field"><label>بلد الوجهة <span class="hint">لتغيير العملة</span></label>
        <div class="ac-wrap"><span class="ac-icon">${icons.search}</span>
          <input class="input ac-input" id="s-destc" value="${esc(t.country)}" placeholder="ابحث عن الدولة" autocomplete="off">
          <div class="ac-list" id="s-destc-list"></div></div></div>
      <div class="rate-box" id="s-rate-box"></div>
      <div class="divider"></div>
      <div class="field"><label>مفتاح خرائط قوقل <span class="hint">للبحث السريع داخل التطبيق</span></label>
        <input class="input" id="s-mapskey" value="${esc(getMapsKey())}" placeholder="AIza..." dir="ltr" autocomplete="off">
        <span class="hint">مدمج مفتاح افتراضي. قيّده بنطاق موقعك من Google Cloud. يُحفظ على جهازك فقط.</span></div>
      <div class="field"><label>مفتاح AeroDataBox <span class="hint">لجلب تفاصيل الرحلة برقمها</span></label>
        <input class="input" id="s-flightkey" value="${esc(getFlightKey())}" placeholder="RapidAPI Key" dir="ltr" autocomplete="off">
        <span class="hint">اشترك في AeroDataBox عبر RapidAPI (فيه باقة مجانية) والصق المفتاح. بدونه استخدم FlightAware والإدخال اليدوي.</span></div>
      <div class="divider"></div>
      <div class="field"><label>المزامنة السحابية (Supabase) <span class="hint">لمشاركة الرحلة مع القروب</span></label>
        <input class="input" id="s-sburl" value="${esc(sync.sbUrl())}" placeholder="https://xxx.supabase.co" dir="ltr" autocomplete="off" style="margin-bottom:8px">
        <input class="input" id="s-sbkey" value="${esc(sync.sbKey())}" placeholder="المفتاح العام (anon key)" dir="ltr" autocomplete="off">
        <span class="hint">${sync.syncEnabled() ? '✓ المزامنة مفعّلة' : 'الصق المفتاح العام لتفعيل المزامنة.'}</span></div>
      <div class="divider"></div>
      <button class="btn btn-danger-ghost btn-block" id="s-del">${icons.trash} حذف الرحلة</button>`,
    footer: `<button class="btn btn-primary btn-block" id="s-save">${icons.check} حفظ</button>`,
  });

  const rateBox = $('#s-rate-box');
  function showRate() {
    if (st.destCur === st.homeCur) { rateBox.innerHTML = `<span>نفس العملة (${curLabel(st.homeCur)})</span>`; return; }
    rateBox.innerHTML = `<span class="rate-ok">1 ${curLabel(st.homeCur)} = <b>${st.rate}</b> ${curLabel(st.destCur)}</span>
      <button type="button" class="btn btn-ghost btn-sm" id="s-rate-refresh">${icons.search} تحديث السعر</button>`;
    $('#s-rate-refresh').onclick = async () => {
      rateBox.querySelector('.rate-ok').textContent = 'جارٍ التحديث…';
      try { st.rate = await fetchRate(st.homeCur, st.destCur); toast('تم تحديث السعر ✓'); }
      catch { toast('تعذّر جلب السعر'); }
      showRate();
    };
  }
  showRate();

  wireCountryPicker($('#s-destc'), $('#s-destc-list'), async (c) => {
    st.destCur = c.cur;
    db.updateTrip(t.id, { country: c.ar, flag: flagOf(c.code) });
    rateBox.innerHTML = `<span class="muted-text">جارٍ جلب سعر الصرف…</span>`;
    try { st.rate = await fetchRate(st.homeCur, st.destCur); } catch {}
    showRate();
  });

  $('#s-save').onclick = () => {
    setMapsKey($('#s-mapskey').value);
    setFlightKey($('#s-flightkey').value);
    sync.setSb($('#s-sburl').value, $('#s-sbkey').value);
    db.updateTrip(t.id, {
      destination: $('#s-dest').value.trim() || t.destination,
      country: $('#s-destc').value.trim() || t.country,
      destCurrency: st.destCur, homeCurrency: st.homeCur,
      rate: Number(st.rate) || t.rate,
    });
    closeModal(); render(); toast('تم الحفظ ✓');
    ensureSubscriptions();
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
      <div class="field"><label>إجمالي القطة <span class="hint">اختر العملة</span></label>
        <div class="amount-row">
          <input class="input" id="q-total" type="number" inputmode="decimal" min="0" step="0.01" value="${t.pool.total || ''}" placeholder="0" dir="ltr">
          <div class="seg cur-seg" id="q-cur">
            <button type="button" class="seg-opt sel" data-qcur="${t.homeCurrency}">${curLabel(t.homeCurrency)}<small>الديار</small></button>
            <button type="button" class="seg-opt" data-qcur="${t.destCurrency}">${curLabel(t.destCurrency)}<small>الوجهة</small></button>
          </div>
        </div></div>
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
  let qCur = t.homeCurrency;
  const partsField = $('#q-parts-field');
  const preview = $('#q-preview');

  const totalHome = () => {
    const v = parseFloat($('#q-total').value) || 0;
    return qCur === t.destCurrency && t.rate ? v / t.rate : v;
  };
  function currentParts() {
    if (scope === 'all') return t.members.map(m => m.id);
    return [...selected];
  }
  function refresh() {
    partsField.style.display = scope === 'some' ? 'block' : 'none';
    const total = totalHome();
    const n = currentParts().length;
    preview.innerHTML = n && total
      ? `الإجمالي ${money(total, t)} · نصيب الفرد: <b>${money(total / n, t)}</b> ≈ ${inDest(total / n, t)} <span class="muted-text">(${n} مشاركين)</span>`
      : '';
  }
  modalRoot.querySelectorAll('[data-qcur]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-qcur]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); qCur = b.dataset.qcur; refresh();
  });
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
    const total = totalHome();
    if (!(total > 0)) { toast('اكتب إجمالي القطة'); return; }
    const parts = currentParts();
    if (!parts.length) { toast('اختر المشاركين'); return; }
    db.setPool(t.id, { total, participantIds: parts, covers: $('#q-covers').value, poolAll: scope === 'all' });
    closeModal(); render(); toast('تم حفظ القطة ✓');
  };
}

/* تحديد الميزانية */
function openSetBudget(t) {
  const me = db.memberById(t, getMyId(t));
  const b = memberBudget(t, me.id);
  openModal({
    title: `ميزانية ${esc(me.name)}`,
    body: `
      <div class="field"><label>ميزانيتك الكاملة <span class="hint">اختر العملة</span></label>
        <div class="amount-row">
          <input class="input" id="bd" type="number" inputmode="decimal" min="0" step="0.01" value="${me.budget ?? ''}" placeholder="0" dir="ltr">
          <div class="seg cur-seg" id="bd-cur">
            <button type="button" class="seg-opt sel" data-bcur="${t.homeCurrency}">${curLabel(t.homeCurrency)}<small>الديار</small></button>
            <button type="button" class="seg-opt" data-bcur="${t.destCurrency}">${curLabel(t.destCurrency)}<small>الوجهة</small></button>
          </div>
        </div>
        <div class="conv-preview" id="bd-conv"></div></div>
      ${b.isParticipant ? `<div class="pay-note" style="background:var(--teal-050);color:var(--teal-800)">${icons.info}
        <span>قطة الرحلة <b>${money(b.qattahShare, t)}</b> بتنخصم تلقائيًا من ميزانيتك، والباقي مصاريفك الشخصية.</span></div>` : ''}`,
    footer: `<button class="btn btn-primary btn-block" id="bd-save">${icons.check} حفظ</button>`,
  });
  let bCur = t.homeCurrency;
  const bdHome = () => { const v = parseFloat($('#bd').value) || 0; return bCur === t.destCurrency && t.rate ? v / t.rate : v; };
  const bdConv = () => { const v = parseFloat($('#bd').value) || 0; $('#bd-conv').innerHTML = v ? `≈ ${bCur === t.destCurrency ? money(bdHome(), t) : inDest(bdHome(), t)}` : ''; };
  modalRoot.querySelectorAll('[data-bcur]').forEach(b2 => b2.onclick = () => {
    modalRoot.querySelectorAll('[data-bcur]').forEach(x => x.classList.remove('sel')); b2.classList.add('sel'); bCur = b2.dataset.bcur; bdConv();
  });
  $('#bd').oninput = bdConv; $('#bd').focus(); bdConv();
  $('#bd-save').onclick = () => {
    const v = bdHome();
    if (!(v >= 0) || !($('#bd').value)) { toast('اكتب مبلغًا صحيحًا'); return; }
    db.setMemberBudget(t.id, me.id, v);
    closeModal(); render(); toast('تم حفظ الميزانية ✓');
  };
}

/* مين أنت؟ (هوية محلية) */
function openWhoAmI(t) {
  openModal({
    title: 'مين أنت؟',
    body: `<p class="muted-text" style="margin-bottom:12px">اختر اسمك في القروب — يُحفظ على جهازك فقط، ويُظهر مصاريفك الشخصية.</p>
      <div class="picker" id="wai">${t.members.map(m => `
        <button type="button" class="pick ${m.id === getMyId(t) ? 'sel' : ''}" data-me="${m.id}">
          <span class="dot" style="background:${m.color}">${esc(initials(m.name))}</span>${esc(m.name)}</button>`).join('')}</div>`,
  });
  modalRoot.querySelectorAll('[data-me]').forEach(b => b.onclick = () => { setMyId(t, b.dataset.me); closeModal(); render(); toast('حدّثنا هويتك ✓'); });
}

/* مصروف (group | personal | shared) */
function openExpense(t, kind) {
  const meId = getMyId(t);
  const state = {
    category: 'food', enteredCur: t.destCurrency,
    paidBy: meId,
    parts: new Set([meId]),   // للقطة المشتركة
  };
  const titles = { group: 'صرف من القطة', personal: 'مصروف شخصي', shared: 'قطة مشتركة' };

  const sharedFields = kind === 'shared' ? `
    <div class="field"><label>مين دفع؟</label>
      <div class="picker" id="e-payer">${t.members.map(m => `
        <button type="button" class="pick ${m.id === state.paidBy ? 'sel' : ''}" data-payer="${m.id}">
          <span class="dot" style="background:${m.color}">${esc(initials(m.name))}</span>${esc(m.name)}</button>`).join('')}</div></div>
    <div class="field"><label>المشاركون <span class="hint">مين يتقاسمها (٢ أو أكثر)</span></label>
      <div class="picker" id="e-parts">${t.members.map(m => `
        <button type="button" class="pick ${state.parts.has(m.id) ? 'sel' : ''}" data-part="${m.id}">
          <span class="dot" style="background:${m.color}">${esc(initials(m.name))}</span>${esc(m.name)}</button>`).join('')}</div>
      <div class="share-preview" id="e-share" style="margin-top:10px"></div></div>` : '';

  openModal({
    title: titles[kind],
    body: `
      <div class="field"><label>الوصف</label>
        <input class="input" id="e-title" placeholder="مثال: ${kind === 'group' ? 'عشاء القروب' : kind === 'shared' ? 'تكسي مشترك' : 'قهوة'}" autocomplete="off"></div>
      <div class="field"><label>المبلغ <span class="hint">اختر العملة</span></label>
        <div class="amount-row">
          <input class="input" id="e-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" dir="ltr">
          <div class="seg cur-seg" id="e-cur">
            <button type="button" class="seg-opt sel" data-cur="${t.destCurrency}">${curLabel(t.destCurrency)}<small>الوجهة</small></button>
            <button type="button" class="seg-opt" data-cur="${t.homeCurrency}">${curLabel(t.homeCurrency)}<small>الديار</small></button>
          </div>
        </div>
        <div class="conv-preview" id="e-conv"></div></div>
      <div class="field"><label>الفئة</label>
        <div class="cat-grid" id="e-cats">${catList.map(cc => `
          <button type="button" class="cat-opt ${cc.key === 'food' ? 'sel' : ''}" data-cat="${cc.key}">${cc.icon}<span>${cc.label}</span></button>`).join('')}</div></div>
      ${sharedFields}`,
    footer: `<button class="btn btn-primary btn-block" id="e-save">${icons.check} حفظ</button>`,
  });

  const homeOf = (v) => state.enteredCur === t.destCurrency && t.rate ? v / t.rate : v;
  function refreshConv() {
    const v = parseFloat($('#e-amount').value) || 0;
    const other = state.enteredCur === t.destCurrency ? money(homeOf(v), t) : inDest(homeOf(v), t);
    $('#e-conv').innerHTML = v ? `≈ ${other}` : '';
    const share = $('#e-share');
    if (share) {
      const n = new Set([state.paidBy, ...state.parts]).size;
      share.innerHTML = v && n ? `نصيب كل شخص: <b>${money(homeOf(v) / n, t)}</b> ≈ ${inDest(homeOf(v) / n, t)} <span class="muted-text">(${n})</span>` : '';
    }
  }

  modalRoot.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-cat]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); state.category = b.dataset.cat;
  });
  modalRoot.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-cur]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); state.enteredCur = b.dataset.cur; refreshConv();
  });
  if (kind === 'shared') {
    modalRoot.querySelectorAll('[data-payer]').forEach(b => b.onclick = () => {
      modalRoot.querySelectorAll('[data-payer]').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
      state.paidBy = b.dataset.payer; refreshConv();
    });
    modalRoot.querySelectorAll('[data-part]').forEach(b => b.onclick = () => {
      const id = b.dataset.part;
      if (state.parts.has(id)) { state.parts.delete(id); b.classList.remove('sel'); }
      else { state.parts.add(id); b.classList.add('sel'); }
      refreshConv();
    });
  }
  $('#e-amount').oninput = refreshConv;
  $('#e-title').focus();

  $('#e-save').onclick = () => {
    const title = $('#e-title').value.trim();
    const amount = parseFloat($('#e-amount').value);
    if (!title) { toast('اكتب الوصف'); return; }
    if (!(amount > 0)) { toast('اكتب مبلغًا صحيحًا'); return; }
    const payload = { title, amount, category: state.category, enteredCur: state.enteredCur };
    if (kind === 'group') db.addGroupExpense(t.id, payload);
    else if (kind === 'personal') db.addPersonalExpense(t.id, getMyId(t), payload);
    else {
      const parts = new Set([state.paidBy, ...state.parts]);
      if (parts.size < 2) { toast('اختر شخصين على الأقل'); return; }
      db.addSharedExpense(t.id, { ...payload, paidBy: state.paidBy, participants: [...parts] });
    }
    closeModal(); render(); toast('تم الحفظ ✓');
  };
}

/* بحث الأماكن داخل التطبيق: قوقل Places (إن توفّر) ← OpenStreetMap ← قوقل ماب فقط لو ما لقى */
async function osmSearch(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ar&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('osm');
  return res.json();
}

function openPlace(t, cityId) {
  const cityName = t.cities.find(c => c.id === cityId)?.name || '';
  openModal({
    title: cityName ? `إضافة مكان · ${cityName}` : 'إضافة مكان',
    body: `
      <div class="field"><label>ابحث عن المكان</label>
        <div class="ac-wrap">
          <span class="ac-icon">${icons.search}</span>
          <input class="input ac-input" id="p-name" placeholder="مثال: بحيرة أوزنجول" autocomplete="off">
          <div class="ac-list" id="p-ac"></div>
        </div>
        <span class="hint" id="p-hint">اكتب اسم المكان وتظهر النتائج هنا داخل التطبيق.</span></div>
      <div class="field"><label>ملاحظة <span class="hint">اختياري</span></label>
        <input class="input" id="p-note" placeholder="مثال: أفضل وقت الزيارة الصباح" autocomplete="off"></div>
      <a class="btn btn-ghost btn-block" id="p-open" target="_blank" rel="noopener" href="#" style="display:none">${icons.map} ما لقيته؟ ابحث في قوقل ماب</a>`,
    footer: `<button class="btn btn-primary btn-block" id="p-save">${icons.plus} إضافة</button>`,
  });

  const name = $('#p-name'), acList = $('#p-ac'), hint = $('#p-hint'), openBtn = $('#p-open');
  const picked = { placeId: '', mapUrl: '', lat: null, lng: null, address: '' };
  const clearPick = () => { picked.placeId = ''; picked.mapUrl = ''; picked.lat = picked.lng = null; picked.address = ''; };
  let gsvc = null, placesSvc = null, debounce, reqId = 0;

  // حمّل خرائط قوقل بصمت (إن توفّر مفتاح صالح)
  loadMaps().then(() => {
    gsvc = new google.maps.places.AutocompleteService();
    placesSvc = new google.maps.places.PlacesService(document.createElement('div'));
  }).catch(() => {});

  const showOpenBtn = (show) => {
    openBtn.style.display = show && name.value.trim() ? 'flex' : 'none';
    if (show) openBtn.href = mapsSearchUrl((name.value.trim() + ' ' + (t.destination || '')).trim());
  };
  const clearList = () => { acList.innerHTML = ''; acList.classList.remove('open'); };

  // نتائج قوقل
  function renderGoogle(preds) {
    acList.innerHTML = preds.slice(0, 6).map(pr => `
      <button type="button" class="ac-item" data-pid="${esc(pr.place_id)}" data-main="${esc(pr.structured_formatting?.main_text || pr.description)}">
        <span class="ac-pin">${icons.pin}</span>
        <span class="ac-txt"><b>${esc(pr.structured_formatting?.main_text || pr.description)}</b>
          <small>${esc(pr.structured_formatting?.secondary_text || '')}</small></span></button>`).join('');
    acList.classList.add('open'); showOpenBtn(false);
    acList.querySelectorAll('.ac-item').forEach(b => b.onclick = () => chooseGoogle(b.dataset.pid, b.dataset.main));
  }
  function chooseGoogle(placeId, mainText) {
    clearList(); name.value = mainText; showOpenBtn(false);
    if (!placesSvc) return;
    placesSvc.getDetails({ placeId, fields: ['name', 'geometry', 'formatted_address', 'url'] }, (d, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && d) {
        picked.placeId = placeId;
        picked.address = d.formatted_address || '';
        picked.mapUrl = d.url || mapsPlaceUrl(d.name || mainText, placeId);
        picked.lat = d.geometry?.location?.lat?.() ?? null;
        picked.lng = d.geometry?.location?.lng?.() ?? null;
        if (d.name) name.value = d.name;
        hint.textContent = picked.address || 'تم اختيار المكان ✓';
      }
    });
  }

  // نتائج OpenStreetMap
  function renderOSM(results) {
    acList.innerHTML = results.slice(0, 6).map((r, i) => {
      const main = (r.name && r.name.trim()) || r.display_name.split('،')[0].split(',')[0];
      return `<button type="button" class="ac-item" data-i="${i}">
        <span class="ac-pin">${icons.pin}</span>
        <span class="ac-txt"><b>${esc(main)}</b><small>${esc(r.display_name)}</small></span></button>`;
    }).join('');
    acList.classList.add('open'); showOpenBtn(false);
    acList.querySelectorAll('.ac-item').forEach(b => b.onclick = () => {
      const r = results[+b.dataset.i];
      const main = (r.name && r.name.trim()) || r.display_name.split('،')[0].split(',')[0];
      clearList(); name.value = main;
      picked.lat = parseFloat(r.lat); picked.lng = parseFloat(r.lon);
      picked.address = r.display_name;
      picked.mapUrl = `https://www.google.com/maps/search/?api=1&query=${picked.lat},${picked.lng}`;
      hint.textContent = r.display_name;
    });
  }

  name.oninput = () => {
    clearPick();
    const q = name.value.trim();
    if (q.length < 2) { clearList(); showOpenBtn(false); return; }
    const my = ++reqId;
    clearTimeout(debounce);
    hint.textContent = 'جارٍ البحث…';
    debounce = setTimeout(() => {
      const query = q;
      const goOSM = () => osmSearch(query + ' ' + (t.destination || '')).then(rs => {
        if (my !== reqId) return;
        if (rs && rs.length) { renderOSM(rs); hint.textContent = 'اختر من النتائج.'; }
        else { clearList(); hint.textContent = 'ما فيه نتائج داخل التطبيق.'; showOpenBtn(true); }
      }).catch(() => { if (my !== reqId) return; clearList(); hint.textContent = 'تعذّر البحث.'; showOpenBtn(true); });

      if (gsvc) {
        gsvc.getPlacePredictions({ input: query }, (preds, status) => {
          if (my !== reqId) return;
          if (status === google.maps.places.PlacesServiceStatus.OK && preds?.length) { renderGoogle(preds); hint.textContent = 'اختر من النتائج.'; }
          else goOSM();
        });
      } else { goOSM(); }
    }, 300);
  };
  name.focus();

  $('#p-save').onclick = () => {
    const nm = name.value.trim();
    if (!nm) { toast('اكتب اسم المكان'); return; }
    db.addPlace(t.id, {
      name: nm, note: $('#p-note').value,
      mapUrl: picked.mapUrl, placeId: picked.placeId,
      lat: picked.lat, lng: picked.lng, address: picked.address, cityId: cityId || '',
    });
    closeModal(); render(); toast('تمت إضافة المكان ✓');
  };
}

/* تجربة عضو على مكان */
function openReview(t, placeId) {
  const place = t.places.find(p => p.id === placeId);
  if (!place) return;
  const me = db.memberById(t, getMyId(t)) || db.memberById(t, t.amirId);
  const memberOpts = t.members.map(m => `<option value="${m.id}" ${m.id === me?.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  let rating = 5;
  openModal({
    title: `تجربتك · ${esc(place.name)}`,
    body: `
      <div class="field"><label>باسم مين؟</label>
        <div class="select-wrap">${icons.chevron}<select class="select" id="rv-who">${memberOpts}</select></div></div>
      <div class="field"><label>تقييمك</label>
        <div class="star-pick" id="rv-stars">${[1, 2, 3, 4, 5].map(i => `<button type="button" class="star-btn ${i <= rating ? 'on' : ''}" data-star="${i}">${icons.star}</button>`).join('')}</div></div>
      <div class="field"><label>ملاحظتك / تجربتك <span class="hint">اختياري</span></label>
        <textarea class="input" id="rv-note" placeholder="مثال: المكان يستاهل الزيارة، روحوا الصباح وتجنّبوا الزحمة"></textarea></div>`,
    footer: `<button class="btn btn-primary btn-block" id="rv-save">${icons.check} نشر التجربة</button>`,
  });
  modalRoot.querySelectorAll('[data-star]').forEach(b => b.onclick = () => {
    rating = +b.dataset.star;
    modalRoot.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', +x.dataset.star <= rating));
  });
  $('#rv-save').onclick = () => {
    db.addReview(t.id, placeId, { memberId: $('#rv-who').value, rating, note: $('#rv-note').value });
    closeModal(); render(); toast('تم نشر تجربتك ✓');
  };
}

/* تعديل رحلة (المغادرة أو العودة) — نوعان: برقم الرحلة أو يدوي */
function openFlightEdit(t, leg) {
  const f = { ...(t.itinerary[leg] || {}) };
  const title = leg === 'inbound' ? 'رحلة العودة 🛬' : 'رحلة المغادرة ✈️';
  const hasKey = !!getFlightKey();

  openModal({
    title,
    body: `
      <div class="seg" id="fl-mode" style="margin-bottom:16px">
        <button type="button" class="seg-opt sel" data-fmode="auto">برقم الرحلة<small>جلب التفاصيل</small></button>
        <button type="button" class="seg-opt" data-fmode="manual">يدوي<small>أدخلها بنفسك</small></button>
      </div>

      <div id="fl-auto">
        <div class="field"><label>رقم الرحلة</label>
          <div class="input-group">
            <input class="input" id="fl-no" value="${esc(f.flightNo || '')}" placeholder="مثال: MS647" dir="ltr" autocomplete="off">
            <button type="button" class="btn btn-sand" id="fl-fetch">${icons.search} جلب</button>
          </div>
          <div class="conv-preview" id="fl-air"></div></div>
        <div class="field"><label>تاريخ الرحلة</label>
          <input class="input" id="fl-date" type="date" value="${esc((f.depAt || '').slice(0, 10))}" dir="ltr"></div>
        <div class="fl-status" id="fl-status"></div>
        <a class="btn btn-ghost btn-block" id="fl-fa" href="${flightawareUrl(f.flightNo || '')}" target="_blank" rel="noopener">${icons.external} افتح في FlightAware</a>
        ${hasKey ? '' : `<p class="hint" style="margin-top:8px">للجلب التلقائي أضِف مفتاح AeroDataBox من ${icons.gear} الإعدادات. أو افتح FlightAware واملأ يدويًا.</p>`}
      </div>

      <div id="fl-manual" style="display:none">
        <div class="two-col">
          <div class="field"><label>من مطار</label>
            <div class="ac-wrap"><span class="ac-icon">${icons.plane}</span>
              <input class="input ac-input" id="fl-from" value="${esc(f.from || '')}" placeholder="رمز/مدينة" autocomplete="off">
              <div class="ac-list" id="fl-from-list"></div></div></div>
          <div class="field"><label>إلى مطار</label>
            <div class="ac-wrap"><span class="ac-icon">${icons.plane}</span>
              <input class="input ac-input" id="fl-to" value="${esc(f.to || '')}" placeholder="رمز/مدينة" autocomplete="off">
              <div class="ac-list" id="fl-to-list"></div></div></div>
        </div>
        <div class="two-col">
          <div class="field"><label>الإقلاع</label><input class="input" id="fl-depat" type="datetime-local" value="${esc(f.depAt || '')}" dir="ltr"></div>
          <div class="field"><label>الوصول</label><input class="input" id="fl-arrat" type="datetime-local" value="${esc(f.arrAt || '')}" dir="ltr"></div>
        </div>
        <div class="two-col">
          <div class="field"><label>الصالة</label><input class="input" id="fl-term" value="${esc(f.terminal || '')}" placeholder="مثال: 2" dir="ltr"></div>
          <div class="field"><label>البوابة</label><input class="input" id="fl-gate" value="${esc(f.gate || '')}" placeholder="مثال: A12" dir="ltr"></div>
        </div>
        <div class="field"><label>الطائرة <span class="hint">اختياري</span></label><input class="input" id="fl-ac" value="${esc(f.aircraft || '')}" placeholder="مثال: Boeing 737" dir="ltr"></div>
        <div class="field"><label>الحالة <span class="hint">اختياري</span></label><input class="input" id="fl-st" value="${esc(f.status || '')}" placeholder="مثال: في الموعد" autocomplete="off"></div>
      </div>`,
    footer: `<button class="btn btn-primary btn-block" id="fl-save">${icons.check} حفظ الرحلة</button>`,
  });

  // فروع النوع
  const autoBox = $('#fl-auto'), manualBox = $('#fl-manual');
  modalRoot.querySelectorAll('[data-fmode]').forEach(b => b.onclick = () => {
    modalRoot.querySelectorAll('[data-fmode]').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
    const auto = b.dataset.fmode === 'auto';
    autoBox.style.display = auto ? 'block' : 'none';
    manualBox.style.display = auto ? 'none' : 'block';
  });

  wireAirportPicker($('#fl-from'), $('#fl-from-list'));
  wireAirportPicker($('#fl-to'), $('#fl-to-list'));

  const showAir = () => { const n = airlineName($('#fl-no').value); $('#fl-air').innerHTML = n ? '✈️ ' + n : ''; $('#fl-fa').href = flightawareUrl($('#fl-no').value); };
  $('#fl-no').oninput = showAir; showAir();

  // جلب التفاصيل
  $('#fl-fetch').onclick = async () => {
    const no = $('#fl-no').value.trim();
    if (!no) { toast('اكتب رقم الرحلة'); return; }
    const date = $('#fl-date').value || new Date().toISOString().slice(0, 10);
    const st = $('#fl-status');
    if (!getFlightKey()) { st.innerHTML = `<span style="color:var(--sand-600)">أضِف مفتاح AeroDataBox من الإعدادات — أو استخدم FlightAware والإدخال اليدوي.</span>`; return; }
    st.innerHTML = 'جارٍ الجلب…'; $('#fl-fetch').disabled = true;
    try {
      const d = await fetchFlight(no, date);
      // عبّئ الحقول اليدوية
      $('#fl-from').value = d.from || $('#fl-from').value;
      $('#fl-to').value = d.to || $('#fl-to').value;
      $('#fl-depat').value = d.depAt || $('#fl-depat').value;
      $('#fl-arrat').value = d.arrAt || $('#fl-arrat').value;
      $('#fl-term').value = d.terminal || '';
      $('#fl-gate').value = d.gate || '';
      $('#fl-ac').value = d.aircraft || '';
      $('#fl-st').value = d.status || '';
      $('#fl-no').value = d.flightNo || no;
      st.innerHTML = `<span style="color:var(--green)">${icons.check} تم الجلب — راجع التفاصيل بتبويب «يدوي» واحفظ.</span>`;
      showAir();
    } catch (e) {
      const m = e?.message || '';
      st.innerHTML = `<span style="color:var(--red)">${/not-found/.test(m) ? 'ما لقينا الرحلة بهذا التاريخ' : /no-key/.test(m) ? 'أضِف مفتاح AeroDataBox' : 'تعذّر الجلب — جرّب FlightAware يدويًا'}</span>`;
    } finally { $('#fl-fetch').disabled = false; }
  };

  $('#fl-save').onclick = () => {
    db.setFlight(t.id, leg, {
      flightNo: $('#fl-no').value.trim(),
      from: $('#fl-from').value.trim(), to: $('#fl-to').value.trim(),
      depAt: $('#fl-depat').value, arrAt: $('#fl-arrat').value,
      terminal: $('#fl-term').value.trim(), gate: $('#fl-gate').value.trim(),
      aircraft: $('#fl-ac').value.trim(), status: $('#fl-st').value.trim(),
    });
    closeModal(); render(); toast('تم حفظ الرحلة ✓');
  };
}

/* إضافة/تعديل مدينة */
function openCity(t, cityId) {
  const c = cityId ? t.cities.find(x => x.id === cityId) : null;
  openModal({
    title: c ? 'تعديل المدينة' : 'إضافة مدينة',
    body: `
      <div class="field"><label>اسم المدينة</label>
        <input class="input" id="ct-name" value="${c ? esc(c.name) : ''}" placeholder="مثال: إسطنبول" autocomplete="off"></div>
      <div class="two-col">
        <div class="field"><label>من <span class="hint">اختياري</span></label>
          <input class="input" id="ct-from" type="date" value="${c ? esc(c.fromDate || '') : ''}" dir="ltr"></div>
        <div class="field"><label>إلى <span class="hint">اختياري</span></label>
          <input class="input" id="ct-to" type="date" value="${c ? esc(c.toDate || '') : ''}" dir="ltr"></div>
      </div>`,
    footer: `<button class="btn btn-primary btn-block" id="ct-save">${c ? icons.check + ' حفظ' : icons.plus + ' إضافة'}</button>`,
  });
  $('#ct-name').focus();
  $('#ct-save').onclick = () => {
    const name = $('#ct-name').value.trim();
    if (!name) { toast('اكتب اسم المدينة'); return; }
    const data = { name, fromDate: $('#ct-from').value, toDate: $('#ct-to').value };
    if (c) db.updateCity(t.id, c.id, data); else db.addCity(t.id, data);
    closeModal(); render(); toast(c ? 'تم الحفظ ✓' : 'تمت إضافة المدينة ✓');
  };
}

/* السكن لمدينة */
function openHotel(t, cityId) {
  const c = t.cities.find(x => x.id === cityId);
  if (!c) return;
  const h = c.hotel || {};
  openModal({
    title: `السكن · ${esc(c.name)}`,
    body: `
      <div class="field"><label>اسم السكن / الفندق</label>
        <input class="input" id="ho-name" value="${esc(h.name || '')}" placeholder="مثال: فندق تقسيم" autocomplete="off"></div>
      <div class="field"><label>ملاحظة <span class="hint">اختياري</span></label>
        <input class="input" id="ho-note" value="${esc(h.note || '')}" placeholder="مثال: تسجيل الدخول ٣ عصرًا" autocomplete="off"></div>
      <div class="field"><label>رابط الخريطة <span class="hint">اختياري</span></label>
        <input class="input" id="ho-map" value="${esc(h.mapUrl || '')}" placeholder="الصق رابط الموقع" dir="ltr" autocomplete="off"></div>
      ${h.name ? `<button class="btn btn-danger-ghost btn-block" id="ho-del">${icons.trash} إزالة السكن</button>` : ''}`,
    footer: `<button class="btn btn-primary btn-block" id="ho-save">${icons.check} حفظ</button>`,
  });
  $('#ho-name').focus();
  $('#ho-save').onclick = () => {
    const name = $('#ho-name').value.trim();
    if (!name) { toast('اكتب اسم السكن'); return; }
    db.updateCity(t.id, cityId, { hotel: { name, note: $('#ho-note').value.trim(), mapUrl: $('#ho-map').value.trim() } });
    closeModal(); render(); toast('تم حفظ السكن ✓');
  };
  const del = $('#ho-del');
  if (del) del.onclick = () => { db.updateCity(t.id, cityId, { hotel: null }); closeModal(); render(); toast('تمت الإزالة'); };
}

/* إضافة تذكير */
function openAddCheck(t) {
  openModal({
    title: 'تذكير جديد',
    body: `<div class="field"><label>التذكير</label>
      <input class="input" id="ck-text" placeholder="مثال: شحن باور بانك" autocomplete="off"></div>`,
    footer: `<button class="btn btn-primary btn-block" id="ck-save">${icons.plus} إضافة</button>`,
  });
  const inp = $('#ck-text'); inp.focus();
  const save = () => { const v = inp.value.trim(); if (!v) { toast('اكتب التذكير'); return; } db.addCheck(t.id, v); closeModal(); render(); };
  $('#ck-save').onclick = save;
  inp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
}

/* =========================================================
   المزامنة السحابية
   ========================================================= */
const shareUrl = (id) => `${location.origin}${location.pathname}?t=${id}`;

function openShare(t) {
  if (!sync.syncEnabled()) {
    openModal({
      title: 'مشاركة ومزامنة',
      body: `<div class="pay-note">${icons.info}<span>لتفعيل مشاركة الرحلة مع القروب والمزامنة اللحظية، أضِف إعدادات <b>Supabase</b> (الرابط + المفتاح العام) من إعدادات الرحلة.</span></div>`,
      footer: `<button class="btn btn-primary btn-block" id="sh-go">${icons.gear} فتح الإعدادات</button>`,
    });
    $('#sh-go').onclick = () => { closeModal(); openSettings(t); };
    return;
  }
  const link = shareUrl(t.id);
  const waText = `انضم لرحلة ${t.destination} على بوردنق:\n${link}`;
  openModal({
    title: 'مشاركة ومزامنة',
    body: t.cloud
      ? `<div class="pay-note" style="background:var(--green-bg);color:var(--green)">${icons.cloud}<span>هذه الرحلة <b>مُزامَنة</b> — أي تعديل يظهر لكل من عنده الرابط لحظيًا.</span></div>
         <div class="field" style="margin-top:14px"><label>رابط الرحلة</label>
           <input class="input" id="sh-link" value="${esc(link)}" readonly dir="ltr"></div>`
      : `<div class="pay-note">${icons.info}<span>فعّل المزامنة لهذه الرحلة، ويصير لها رابط تشاركه مع القروب فيدخلونها ويتحدّثون لحظيًا.</span></div>`,
    footer: t.cloud
      ? `<div style="display:flex;gap:10px">
           <button class="btn btn-ghost btn-block" id="sh-copy">${icons.receipt} نسخ الرابط</button>
           <a class="btn btn-sand btn-block" href="${waLink('', waText)}" target="_blank" rel="noopener">${icons.send} واتساب</a></div>`
      : `<button class="btn btn-primary btn-block" id="sh-enable">${icons.cloud} تفعيل المزامنة والمشاركة</button>`,
  });
  if (t.cloud) {
    $('#sh-copy').onclick = () => { copyText(link); toast('تم نسخ الرابط ✓'); };
  } else {
    $('#sh-enable').onclick = async () => {
      db.updateTrip(t.id, { cloud: true });
      try {
        await sync.pushTrip(db.getTrip(t.id));
        ensureSubscriptions();
        toast('تم تفعيل المزامنة ✓');
        closeModal(); render(); openShare(db.getTrip(t.id));
      } catch (e) {
        db.updateTrip(t.id, { cloud: false });
        toast('تعذّرت المزامنة — تأكد من الإعدادات وجدول قاعدة البيانات');
        console.warn(e);
      }
    };
  }
}

let syncTimer;
const subs = {};
function scheduleSync() {
  if (!sync.syncEnabled()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    for (const t of db.getTrips()) {
      if (t.cloud) { try { await sync.pushTrip(t); } catch (e) { console.warn('push', e); } }
    }
  }, 700);
}
function ensureSubscriptions() {
  if (!sync.syncEnabled()) return;
  db.getTrips().forEach(t => {
    if (t.cloud && !subs[t.id]) {
      subs[t.id] = true;
      sync.subscribeTrip(t.id, (data) => {
        db.upsertTripFromCloud({ ...data, cloud: true });
        if (!R.tripId || R.tripId === t.id) render();
      }).then(unsub => { subs[t.id] = unsub; }).catch(() => { subs[t.id] = null; });
    }
  });
}
async function checkJoin() {
  const id = new URLSearchParams(location.search).get('t');
  if (!id) return;
  if (db.getTrip(id)) { go(id); return; }
  if (!sync.syncEnabled()) { toast('أضِف إعدادات Supabase لفتح الرحلة المشتركة'); return; }
  toast('جارٍ فتح الرحلة المشتركة…');
  try {
    const data = await sync.fetchTrip(id);
    if (data) { db.upsertTripFromCloud({ ...data, cloud: true }); ensureSubscriptions(); go(id); toast('انضممت للرحلة ✓'); }
    else toast('الرحلة غير موجودة');
  } catch (e) { toast('تعذّر فتح الرحلة'); console.warn(e); }
}

db.onChange(scheduleSync);

/* ---------------- إقلاع ---------------- */
async function boot() {
  pendingJoin = new URLSearchParams(location.search).get('t') || null;
  if (pendingJoin) authState.guest = false; // رابط مشترك يتطلب تسجيل الدخول
  render(); // شاشة انتظار

  if (sync.syncEnabled()) {
    try {
      authState.user = await sync.currentUser();
      sync.onAuth((u) => { const was = !!authState.user; authState.user = u; if (!!u !== was) render(); }).catch(() => {});
    } catch { /* المزامنة غير متاحة الآن */ }
  }
  authState.checked = true;
  render();

  ensureSubscriptions();
  if (authState.user || (authState.guest && !pendingJoin)) checkJoin();
}
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
