/* =========================================================
   sync.js — مزامنة سحابية عبر Supabase
   نموذج: كل رحلة صف واحد { id, data(jsonb), updated_at }
   المزامنة: آخر كتابة تفوز (last-write-wins) + تحديث لحظي (Realtime).
   ========================================================= */

const URL_LS = 'boarding.sbUrl';
const KEY_LS = 'boarding.sbKey';

// افتراضيات مدمجة ليعمل التشارك للقروب كله مباشرة.
// المفتاح العام (publishable) آمن للنشر مع تفعيل Row Level Security.
const DEFAULT_URL = 'https://qujjhxfubspmeprtgjew.supabase.co';
const DEFAULT_KEY = 'sb_publishable_Ul4ReYqY6HhbILPjJ9iQkg_JpMuhQ2e';

export function sbUrl() { try { return localStorage.getItem(URL_LS) || DEFAULT_URL; } catch { return DEFAULT_URL; } }
export function sbKey() { try { return localStorage.getItem(KEY_LS) || DEFAULT_KEY; } catch { return DEFAULT_KEY; } }
export function setSb(url, key) {
  try {
    url && url.trim() ? localStorage.setItem(URL_LS, url.trim()) : localStorage.removeItem(URL_LS);
    key && key.trim() ? localStorage.setItem(KEY_LS, key.trim()) : localStorage.removeItem(KEY_LS);
  } catch {}
  _client = null; // إعادة التهيئة عند تغيير الإعدادات
}
export function syncEnabled() { return !!(sbUrl() && sbKey()); }

let _client = null, _loading = null;
async function client() {
  if (_client) return _client;
  if (!syncEnabled()) throw new Error('sync-not-configured');
  if (!_loading) _loading = import('https://esm.sh/@supabase/supabase-js@2');
  const { createClient } = await _loading;
  _client = createClient(sbUrl(), sbKey(), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return _client;
}
export const getClient = client;

/* ---------------- المصادقة (Supabase Auth) ---------------- */
const redirectTo = () => location.origin + location.pathname;

export async function currentUser() {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}
export async function onAuth(cb) {
  const sb = await client();
  return sb.auth.onAuthStateChange((_e, session) => cb(session ? session.user : null));
}
export async function signUpEmail(email, password, name) {
  const sb = await client();
  return sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirectTo() } });
}
export async function signInEmail(email, password) {
  const sb = await client();
  return sb.auth.signInWithPassword({ email, password });
}
export async function signInMagic(email) {
  const sb = await client();
  return sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
}
export async function signInOAuth(provider) {
  const sb = await client();
  return sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
}
export async function signOut() {
  const sb = await client();
  return sb.auth.signOut();
}

/* ---------------- التخزين (الذكريات: صور/فيديو) ---------------- */
const MEM_BUCKET = 'memories';
export async function uploadFile(tripId, file, onProgress) {
  const sb = await client();
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${tripId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(MEM_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = sb.storage.from(MEM_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
export async function deleteFile(path) {
  if (!path) return;
  try { const sb = await client(); await sb.storage.from(MEM_BUCKET).remove([path]); } catch {}
}

/* رفع رحلة (upsert) */
export async function pushTrip(trip) {
  const sb = await client();
  const { error } = await sb.from('trips').upsert(
    { id: trip.id, data: trip, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

/* جلب رحلة بالمعرّف */
export async function fetchTrip(id) {
  const sb = await client();
  const { data, error } = await sb.from('trips').select('data').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? data.data : null;
}

/* اشتراك لحظي على رحلة */
export async function subscribeTrip(id, onRemote) {
  const sb = await client();
  const ch = sb.channel('trip-' + id)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'trips', filter: 'id=eq.' + id },
      (payload) => { if (payload.new && payload.new.data) onRemote(payload.new.data); })
    .subscribe();
  return () => { try { sb.removeChannel(ch); } catch {} };
}
