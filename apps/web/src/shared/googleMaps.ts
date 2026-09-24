// Loads the Google Maps JS API (Places library, new API) once, on demand.
// The key is a public, referrer-restricted client key (VITE_GOOGLE_MAPS_KEY);
// when it's absent the place-search UI is hidden. Typed loosely to avoid adding
// @types/google.maps.
/* eslint-disable @typescript-eslint/no-explicit-any */

type G = any;

export function mapsKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
}
export function mapsEnabled(): boolean {
  return Boolean(mapsKey());
}

let scriptReady: Promise<G> | null = null;
function loadScript(): Promise<G> {
  if (scriptReady) return scriptReady;
  const key = mapsKey();
  if (!key) return Promise.reject(new Error('NO_MAPS_KEY'));
  scriptReady = new Promise<G>((resolve, reject) => {
    const w = window as any;
    if (w.google?.maps) { resolve(w.google); return; }
    const cb = `__bpMaps_${Date.now()}`;
    w[cb] = () => { resolve(w.google); delete w[cb]; };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=ar&region=SA&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => reject(new Error('MAPS_LOAD_FAILED'));
    document.head.appendChild(s);
  });
  return scriptReady;
}

/** The Places library ({ AutocompleteSuggestion, AutocompleteSessionToken, Place }). */
export async function loadPlaces(): Promise<G> {
  const g = await loadScript();
  return g.maps.importLibrary('places');
}
