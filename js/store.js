/* =========================================================
   store.js — طبقة البيانات + الحفظ المحلي (localStorage)
   نموذج: قطة القروب (صندوق مشترك) + ميزانية شخصية + قطة بين شخصين
   ========================================================= */

const KEY = 'rifqa.data.v2'; // مفتاح التخزين — يبقى ثابتًا للحفاظ على البيانات المحفوظة

const AVATAR_COLORS = [
  '#0e4d54', '#c8873f', '#2f8f5b', '#5b6ec8', '#b0568f',
  '#3f8fc8', '#c0453b', '#7a8f2f', '#8f5b3f', '#4a6572'
];

function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function emptyState() {
  return { trips: [], version: 2 };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.trips)) return emptyState();
    return migrate(parsed);
  } catch {
    return emptyState();
  }
}

function defaultChecklist() {
  return ['حجز التذاكر', 'الجوازات سارية', 'حجز السكن', 'تأمين السفر', 'تحويل العملة', 'باقة الجوال / الإنترنت']
    .map(t => ({ id: uid('ck'), text: t, done: false }));
}

/* ترحيل البيانات القديمة للشكل الجديد */
function migrate(st) {
  st.trips.forEach(t => {
    if (!t.sharedExpenses) {
      t.sharedExpenses = (t.pairExpenses || []).map(e => ({
        id: e.id, title: e.title, amount: e.amount, category: e.category,
        paidBy: e.paidBy,
        participants: [e.paidBy, e.withId].filter(Boolean),
        createdAt: e.createdAt,
      }));
      delete t.pairExpenses;
    }
    (t.places || []).forEach(p => { if (!p.reviews) p.reviews = []; });

    // الرحلة (خط الرحلة) — رحلتان بكل التفاصيل
    if (!t.itinerary) t.itinerary = {};
    const it = t.itinerary;
    if (!it.outbound) {
      it.outbound = { flightNo: it.departFlight || '', from: it.depAirport || '', to: it.arrAirport || '', depAt: it.departAt || '', arrAt: '', terminal: '', gate: '', aircraft: '', status: '' };
      it.inbound = { flightNo: it.returnFlight || '', from: it.arrAirport || '', to: it.depAirport || '', depAt: it.returnAt || '', arrAt: '', terminal: '', gate: '', aircraft: '', status: '' };
      delete it.departAt; delete it.departFlight; delete it.returnAt; delete it.returnFlight; delete it.depAirport; delete it.arrAirport;
    }
    if (!t.checklist) t.checklist = defaultChecklist();
    if (!t.cities) {
      t.cities = [];
      if ((t.places || []).length) { // ضع الأماكن القديمة داخل مدينة من الوجهة
        const c = { id: uid('ct'), name: t.destination || t.country || 'المدينة', order: 0, hotel: null, fromDate: '', toDate: '' };
        t.cities.push(c);
        t.places.forEach(p => { if (!p.cityId) p.cityId = c.id; });
      }
    }
    (t.places || []).forEach(p => { if (p.cityId === undefined) p.cityId = ''; });
    if (!t.memories) t.memories = [];
  });
  return st;
}

let changeCb = null;
export function onChange(fn) { changeCb = fn; }

function persist(opts) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn('تعذّر الحفظ المحلي', e); }
  // إشعار طبقة المزامنة (ما لم يكن التغيير قادمًا من السحابة)
  if (changeCb && !(opts && opts.fromCloud)) changeCb();
}

/* استبدال/إدراج رحلة قادمة من السحابة (بدون إعادة رفعها) */
export function upsertTripFromCloud(trip) {
  const i = state.trips.findIndex(t => t.id === trip.id);
  if (i >= 0) state.trips[i] = trip; else state.trips.push(trip);
  persist({ fromCloud: true });
}

/* ---------------- الرحلات ---------------- */

export function getTrips() {
  return state.trips.slice().sort((a, b) => b.createdAt - a.createdAt);
}
export function getTrip(id) {
  return state.trips.find(t => t.id === id) || null;
}

export function createTrip({ destination, country, flag, destCurrency, homeCurrency, rate, amirName, amirPhone }) {
  const amir = { id: uid('m'), name: amirName.trim(), phone: (amirPhone || '').trim(), username: '', color: AVATAR_COLORS[0], budget: null, qattahPaid: true };
  const trip = {
    id: uid('trip'),
    destination: destination.trim(),
    country: (country || '').trim(),
    flag: flag || '🧳',
    destCurrency: destCurrency || 'TRY',
    homeCurrency: homeCurrency || 'SAR',
    rate: Number(rate) || 1,            // 1 عملة ديار = rate عملة وجهة
    amirId: amir.id,
    currentMemberId: amir.id,           // «أنا» محليًا
    members: [amir],
    pool: { total: 0, participantIds: [], covers: '' },
    groupExpenses: [],                  // يصرفها الأمير من القطة
    sharedExpenses: [],                 // قطة مشتركة بين أشخاص محددين
    personalExpenses: {},               // { memberId: [ ... ] }
    places: [],
    itinerary: {
      outbound: { flightNo: '', from: '', to: '', depAt: '', arrAt: '', terminal: '', gate: '', aircraft: '', status: '' },
      inbound: { flightNo: '', from: '', to: '', depAt: '', arrAt: '', terminal: '', gate: '', aircraft: '', status: '' },
    },
    cities: [],
    memories: [],
    checklist: defaultChecklist(),
    cloud: false,               // مزامنة سحابية مفعّلة لهذه الرحلة؟
    createdAt: Date.now(),
  };
  state.trips.push(trip);
  persist();
  return trip;
}

export function updateTrip(id, patch) {
  const t = getTrip(id);
  if (!t) return;
  Object.assign(t, patch);
  persist();
}

export function deleteTrip(id) {
  state.trips = state.trips.filter(t => t.id !== id);
  persist();
}

export function setCurrentMember(tripId, memberId) {
  const t = getTrip(tripId);
  if (!t) return;
  t.currentMemberId = memberId;
  persist();
}

/* ---------------- الأعضاء ---------------- */

export function addMember(tripId, { name, phone, username }) {
  const t = getTrip(tripId);
  if (!t) return null;
  const idx = t.members.length % AVATAR_COLORS.length;
  const m = {
    id: uid('m'), name: name.trim(), phone: (phone || '').trim(),
    username: (username || '').trim(), color: AVATAR_COLORS[idx], budget: null, qattahPaid: false,
  };
  t.members.push(m);
  // إذا القطة «على الكل» أضِفه للمشاركين تلقائيًا
  if (t.pool.participantIds.length && t._poolAll) t.pool.participantIds.push(m.id);
  persist();
  return m;
}

export function updateMember(tripId, memberId, patch) {
  const t = getTrip(tripId);
  const m = t?.members.find(x => x.id === memberId);
  if (!m) return;
  Object.assign(m, patch);
  persist();
}

export function removeMember(tripId, memberId) {
  const t = getTrip(tripId);
  if (!t) return;
  if (memberId === t.amirId) throw new Error('لا يمكن حذف أمير الرحلة.');
  const usedInShared = t.sharedExpenses.some(e => e.paidBy === memberId || e.participants.includes(memberId));
  if (usedInShared) throw new Error('لا يمكن حذف عضو مرتبط بقطة مشتركة. احذفها أولًا.');
  t.members = t.members.filter(m => m.id !== memberId);
  t.pool.participantIds = t.pool.participantIds.filter(id => id !== memberId);
  delete t.personalExpenses[memberId];
  if (t.currentMemberId === memberId) t.currentMemberId = t.amirId;
  persist();
}

export function setAmir(tripId, memberId) {
  const t = getTrip(tripId);
  if (!t) return;
  t.amirId = memberId;
  persist();
}

export function memberById(trip, id) {
  return trip.members.find(m => m.id === id) || null;
}

/* ---------------- القطة (الصندوق المشترك) ---------------- */

export function setPool(tripId, { total, participantIds, covers, poolAll }) {
  const t = getTrip(tripId);
  if (!t) return;
  t.pool = {
    total: Number(total) || 0,
    participantIds: participantIds.slice(),
    covers: (covers || '').trim(),
  };
  t._poolAll = !!poolAll;
  persist();
}

export function toggleQattahPaid(tripId, memberId) {
  const t = getTrip(tripId);
  const m = memberById(t, memberId);
  if (!m) return;
  m.qattahPaid = !m.qattahPaid;
  persist();
}

/* ---------------- الميزانية الشخصية ---------------- */

export function setMemberBudget(tripId, memberId, budget) {
  const t = getTrip(tripId);
  const m = memberById(t, memberId);
  if (!m) return;
  m.budget = budget === null || budget === '' ? null : Number(budget);
  persist();
}

/* ---------------- المصاريف (ثلاثة أنواع) ----------------
   كل المبالغ تُخزَّن بعملة الديار (home).
--------------------------------------------------------- */

function toHome(trip, amount, enteredCur) {
  const a = Number(amount);
  if (enteredCur === trip.destCurrency && trip.rate) return a / trip.rate;
  return a; // مُدخل بعملة الديار
}

export function addGroupExpense(tripId, { title, amount, category, enteredCur }) {
  const t = getTrip(tripId);
  if (!t) return null;
  const e = { id: uid('g'), title: title.trim(), amount: toHome(t, amount, enteredCur), category: category || 'other', createdAt: Date.now() };
  t.groupExpenses.push(e);
  persist();
  return e;
}
export function removeGroupExpense(tripId, id) {
  const t = getTrip(tripId);
  if (!t) return;
  t.groupExpenses = t.groupExpenses.filter(e => e.id !== id);
  persist();
}

export function addPersonalExpense(tripId, memberId, { title, amount, category, enteredCur }) {
  const t = getTrip(tripId);
  if (!t) return null;
  if (!t.personalExpenses[memberId]) t.personalExpenses[memberId] = [];
  const e = { id: uid('p'), title: title.trim(), amount: toHome(t, amount, enteredCur), category: category || 'other', createdAt: Date.now() };
  t.personalExpenses[memberId].push(e);
  persist();
  return e;
}
export function removePersonalExpense(tripId, memberId, id) {
  const t = getTrip(tripId);
  if (!t || !t.personalExpenses[memberId]) return;
  t.personalExpenses[memberId] = t.personalExpenses[memberId].filter(e => e.id !== id);
  persist();
}

export function addSharedExpense(tripId, { title, amount, category, paidBy, participants, enteredCur }) {
  const t = getTrip(tripId);
  if (!t) return null;
  const parts = Array.from(new Set([paidBy, ...(participants || [])])); // الدافع مشارك دائمًا
  const e = {
    id: uid('sh'), title: title.trim(), amount: toHome(t, amount, enteredCur),
    category: category || 'other', paidBy, participants: parts, createdAt: Date.now(),
  };
  t.sharedExpenses.push(e);
  persist();
  return e;
}
export function removeSharedExpense(tripId, id) {
  const t = getTrip(tripId);
  if (!t) return;
  t.sharedExpenses = t.sharedExpenses.filter(e => e.id !== id);
  persist();
}

/* ---------------- الأماكن ---------------- */

export function addPlace(tripId, data) {
  const t = getTrip(tripId);
  if (!t) return null;
  const { name, note, mapUrl, placeId, lat, lng, address, cityId,
          rating, ratingsTotal, photos, priceLevel, phone, website } = data;
  const p = {
    id: uid('pl'), name: name.trim(), note: (note || '').trim(),
    mapUrl: (mapUrl || '').trim(), placeId: placeId || '', address: (address || '').trim(),
    lat: lat ?? null, lng: lng ?? null, cityId: cityId || '', visited: false, reviews: [],
    rating: rating ?? null, ratingsTotal: ratingsTotal ?? null,
    photos: Array.isArray(photos) ? photos : [], priceLevel: priceLevel ?? null,
    phone: phone || '', website: website || '',
  };
  t.places.push(p);
  persist();
  return p;
}

/* ---------------- الرحلة: المواعيد والمدن والتذكيرات ---------------- */
export function setFlight(tripId, leg, patch) {
  const t = getTrip(tripId);
  if (!t) return;
  if (!t.itinerary[leg]) t.itinerary[leg] = {};
  t.itinerary[leg] = { ...t.itinerary[leg], ...patch };
  persist();
}

export function addCity(tripId, { name, fromDate, toDate }) {
  const t = getTrip(tripId);
  if (!t) return null;
  const c = { id: uid('ct'), name: name.trim(), order: t.cities.length, hotel: null, fromDate: fromDate || '', toDate: toDate || '' };
  t.cities.push(c);
  persist();
  return c;
}
export function updateCity(tripId, cityId, patch) {
  const t = getTrip(tripId);
  const c = t?.cities.find(x => x.id === cityId);
  if (!c) return;
  Object.assign(c, patch);
  persist();
}
export function removeCity(tripId, cityId) {
  const t = getTrip(tripId);
  if (!t) return;
  t.cities = t.cities.filter(c => c.id !== cityId);
  t.places.forEach(p => { if (p.cityId === cityId) p.cityId = ''; }); // لا تُحذف الأماكن
  persist();
}

/* ---------------- الذكريات (صور/فيديو) ---------------- */
export function addMemory(tripId, { url, path, type, caption, placeId, cityId, memberId }) {
  const t = getTrip(tripId);
  if (!t) return null;
  const m = {
    id: uid('mem'), url, path: path || '', type: type || 'image',
    caption: (caption || '').trim(), placeId: placeId || '', cityId: cityId || '',
    memberId: memberId || '', createdAt: Date.now(),
  };
  t.memories.push(m);
  persist();
  return m;
}
export function removeMemory(tripId, id) {
  const t = getTrip(tripId);
  if (!t) return null;
  const mem = t.memories.find(m => m.id === id);
  t.memories = t.memories.filter(m => m.id !== id);
  persist();
  return mem || null;
}

export function toggleCheck(tripId, id) {
  const t = getTrip(tripId);
  const c = t?.checklist.find(x => x.id === id);
  if (!c) return;
  c.done = !c.done;
  persist();
}
export function addCheck(tripId, text) {
  const t = getTrip(tripId);
  if (!t) return;
  t.checklist.push({ id: uid('ck'), text: text.trim(), done: false });
  persist();
}
export function removeCheck(tripId, id) {
  const t = getTrip(tripId);
  if (!t) return;
  t.checklist = t.checklist.filter(x => x.id !== id);
  persist();
}
export function togglePlaceVisited(tripId, placeId) {
  const t = getTrip(tripId);
  const p = t?.places.find(x => x.id === placeId);
  if (!p) return;
  p.visited = !p.visited;
  persist();
}
export function removePlace(tripId, placeId) {
  const t = getTrip(tripId);
  if (!t) return;
  t.places = t.places.filter(p => p.id !== placeId);
  persist();
}

/* تجارب الأعضاء على الأماكن */
export function addReview(tripId, placeId, { memberId, rating, note }) {
  const t = getTrip(tripId);
  const p = t?.places.find(x => x.id === placeId);
  if (!p) return null;
  const r = { id: uid('rv'), memberId, rating: Number(rating) || 0, note: (note || '').trim(), createdAt: Date.now() };
  p.reviews.push(r);
  if (memberId) p.visited = true; // من كتب تجربة فقد زارها
  persist();
  return r;
}
export function removeReview(tripId, placeId, reviewId) {
  const t = getTrip(tripId);
  const p = t?.places.find(x => x.id === placeId);
  if (!p) return;
  p.reviews = p.reviews.filter(r => r.id !== reviewId);
  persist();
}

export function _resetAll() { state = emptyState(); persist(); }
