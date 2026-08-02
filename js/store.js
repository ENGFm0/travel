/* =========================================================
   store.js — طبقة البيانات + الحفظ المحلي (localStorage)
   ========================================================= */

const KEY = 'rifqa.data.v1';

const AVATAR_COLORS = [
  '#0e4d54', '#c8873f', '#2f8f5b', '#5b6ec8', '#b0568f',
  '#3f8fc8', '#c0453b', '#7a8f2f', '#8f5b3f', '#4a6572'
];

/* توليد معرّف بسيط بدون تكرار */
function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* الحالة الافتراضية */
function emptyState() {
  return { trips: [], activeTripId: null };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.trips)) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('تعذّر الحفظ المحلي', e);
  }
}

/* ---------------- الرحلات ---------------- */

export function getTrips() {
  return state.trips.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function getTrip(id) {
  return state.trips.find(t => t.id === id) || null;
}

export function createTrip({ destination, country, flag, currency }) {
  const trip = {
    id: uid('trip'),
    destination: destination.trim(),
    country: (country || '').trim(),
    flag: flag || '🧳',
    currency: currency || 'SAR',
    members: [],
    amirId: null,
    places: [],
    expenses: [],
    stageState: {},         // { stageKey: true } للمراحل المكتملة يدويًا
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

/* ---------------- الأعضاء ---------------- */

export function addMember(tripId, name) {
  const t = getTrip(tripId);
  if (!t) return null;
  const idx = t.members.length % AVATAR_COLORS.length;
  const m = { id: uid('m'), name: name.trim(), color: AVATAR_COLORS[idx] };
  t.members.push(m);
  if (!t.amirId) t.amirId = m.id; // أول عضو يصير أمير مؤقتًا
  persist();
  return m;
}

export function removeMember(tripId, memberId) {
  const t = getTrip(tripId);
  if (!t) return;
  // لا نحذف عضوًا مرتبطًا بمصروف كدافع
  const usedAsPayer = t.expenses.some(e => e.paidBy === memberId);
  if (usedAsPayer) throw new Error('لا يمكن حذف عضو دفع قطّة. احذف قطّاته أولًا.');
  t.members = t.members.filter(m => m.id !== memberId);
  // نظّف المشاركين
  t.expenses.forEach(e => { e.sharedAmong = e.sharedAmong.filter(id => id !== memberId); });
  if (t.amirId === memberId) t.amirId = t.members[0]?.id || null;
  persist();
}

export function setAmir(tripId, memberId) {
  const t = getTrip(tripId);
  if (!t) return;
  t.amirId = memberId;
  persist();
}

export function memberName(trip, id) {
  return trip.members.find(m => m.id === id)?.name || 'غير معروف';
}

/* ---------------- الأماكن ---------------- */

export function addPlace(tripId, { name, note, mapUrl }) {
  const t = getTrip(tripId);
  if (!t) return null;
  const p = { id: uid('pl'), name: name.trim(), note: (note || '').trim(), mapUrl: (mapUrl || '').trim(), visited: false };
  t.places.push(p);
  persist();
  return p;
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

/* ---------------- القطّات / المصاريف ----------------
   type: 'group'    -> على القروب كله
         'some'     -> بين أشخاص محددين
         'personal' -> شخصي خارج القطة (شخص واحد)
------------------------------------------------------ */

export function addExpense(tripId, data) {
  const t = getTrip(tripId);
  if (!t) return null;
  const e = {
    id: uid('exp'),
    title: data.title.trim(),
    amount: Number(data.amount),
    category: data.category || 'other',
    type: data.type,                    // group | some | personal
    paidBy: data.paidBy,                // memberId
    sharedAmong: data.sharedAmong || [],// memberIds
    stage: data.stage || 'trip',        // مرحلة الرحلة المرتبطة
    createdAt: Date.now(),
  };
  t.expenses.push(e);
  persist();
  return e;
}

export function removeExpense(tripId, expId) {
  const t = getTrip(tripId);
  if (!t) return;
  t.expenses = t.expenses.filter(e => e.id !== expId);
  persist();
}

/* ---------------- إعادة الضبط (للتجربة) ---------------- */
export function _resetAll() {
  state = emptyState();
  persist();
}
