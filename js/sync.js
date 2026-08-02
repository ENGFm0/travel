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
  _client = createClient(sbUrl(), sbKey(), { auth: { persistSession: false } });
  return _client;
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
