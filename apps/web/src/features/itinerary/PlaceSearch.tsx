import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadPlaces } from '@/shared/googleMaps';
import type { ActivityKind } from './itineraryService';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PickedPlace {
  name: string;
  address?: string;
  kind: ActivityKind;
  photoUrl?: string;      // first photo (back-compat)
  photoUrls?: string[];   // all available photos (browsable gallery)
  mapsUrl?: string;
  placeId?: string;
  lat?: number;           // location (used to bias nested searches, e.g. hotels)
  lng?: number;
}

/** Map Google place types to our activity kinds. */
function guessKind(types: string[] = []): ActivityKind {
  const has = (...t: string[]) => t.some((x) => types.includes(x));
  if (has('lodging', 'hotel')) return 'HOTEL';
  if (has('restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway', 'food')) return 'FOOD';
  if (has('shopping_mall', 'store', 'clothing_store', 'supermarket', 'department_store')) return 'SHOPPING';
  if (has('tourist_attraction', 'museum', 'park', 'landmark', 'art_gallery', 'zoo', 'aquarium', 'amusement_park')) return 'SIGHT';
  if (has('airport')) return 'ARRIVAL';
  if (has('transit_station', 'bus_station', 'subway_station', 'train_station', 'car_rental')) return 'TRANSPORT';
  return 'ACTIVITY';
}

/** In-app place search powered by Google Places (new API). Type → suggestions
 *  render in a dropdown → click adds. Bias toward the city when provided.
 *  Controlled mode: pass `value`/`onValueChange` to bind the input to an
 *  external field (e.g. the hotel name), so the field IS the search box. */
export function PlaceSearch({ city, onPick, value, onValueChange, onBlur, placeholder, ariaLabel, citiesOnly, regionCode, biasLat, biasLng }: {
  city?: string; onPick: (p: PickedPlace) => void;
  value?: string; onValueChange?: (v: string) => void; onBlur?: () => void; placeholder?: string; ariaLabel?: string;
  citiesOnly?: boolean; regionCode?: string;
  biasLat?: number; biasLng?: number; // anchor results to a city's coordinates
}) {
  const { t } = useTranslation();
  const controlled = value !== undefined;
  const [q, setQ] = useState('');
  const text = controlled ? (value ?? '') : q;
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const places = useRef<any>(null);
  const token = useRef<any>(null);
  const timer = useRef<number | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function ensure() {
    if (!places.current) {
      places.current = await loadPlaces();
      token.current = new places.current.AutocompleteSessionToken();
    }
    return places.current;
  }

  function change(v: string) {
    if (controlled) onValueChange?.(v); else setQ(v);
    window.clearTimeout(timer.current);
    if (!v.trim()) { setItems([]); setOpen(false); return; }
    timer.current = window.setTimeout(() => void search(v.trim()), 250);
  }

  const hasBias = typeof biasLat === 'number' && typeof biasLng === 'number';

  async function search(input: string) {
    try {
      setBusy(true); setErr(false);
      const p = await ensure();
      const fetchFor = async (q: string) => {
        const req: any = { input: q, sessionToken: token.current };
        if (citiesOnly) req.includedPrimaryTypes = ['(cities)']; // world cities only
        // Anchor to the city's actual coordinates when we have them (works for
        // any city worldwide, unlike a country code). Else keep results in the
        // destination country so a fallback never defaults to the home region.
        else if (hasBias) req.locationBias = { center: { lat: biasLat, lng: biasLng }, radius: 40000 };
        else if (regionCode) req.includedRegionCodes = [regionCode.toLowerCase()];
        const { suggestions } = await p.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        return (suggestions ?? []) as any[];
      };
      // With coordinates, the bias does the locating — search the raw text. Else
      // append the city name; if that yields nothing, fall back to raw text.
      const cityMain = city ? city.split(/[،,]/)[0].trim() : '';
      const primary = hasBias ? input : cityMain ? `${input} ${cityMain}` : input;
      let items = await fetchFor(primary);
      if (items.length === 0 && primary !== input) items = await fetchFor(input);
      setItems(items);
      setOpen(true);
    } catch {
      setErr(true); setItems([]); setOpen(true);
    } finally { setBusy(false); }
  }

  async function pick(s: any) {
    // Cities: use the prediction text directly (City، Country) — no place details.
    if (citiesOnly) {
      const pred = s.placePrediction;
      const main = pred?.mainText?.text ?? pred?.text?.text ?? text;
      const sec = pred?.secondaryText?.text ?? '';
      const label = sec ? `${main}، ${sec}` : main;
      // Resolve the city's coordinates so a later hotel/place search can be
      // anchored to it (accurate wherever the city is in the world).
      let lat: number | undefined, lng: number | undefined;
      try {
        const place = pred.toPlace();
        await place.fetchFields({ fields: ['location'] });
        const loc = place.location;
        lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat;
        lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng;
      } catch { /* coords optional */ }
      onPick({ name: label, address: sec || undefined, kind: 'OTHER', placeId: pred?.placeId, lat, lng });
      if (controlled) onValueChange?.(label); else setQ('');
      setItems([]); setOpen(false);
      token.current = places.current ? new places.current.AutocompleteSessionToken() : null;
      return;
    }
    try {
      const pred = s.placePrediction;
      const place = pred.toPlace();
      await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'types', 'photos', 'googleMapsURI', 'location'] });
      let photoUrls: string[] | undefined;
      try {
        // Grab all available photos (capped) at a large size so they can be
        // browsed full-screen, not just a tiny thumbnail.
        const photos = (place.photos ?? []).slice(0, 10);
        const urls = photos.map((ph: any) => ph?.getURI?.({ maxWidth: 1280, maxHeight: 960 })).filter(Boolean) as string[];
        if (urls.length) photoUrls = urls;
      } catch { /* photos optional */ }
      const photoUrl = photoUrls?.[0];
      const name = place.displayName ?? pred.text?.text ?? text;
      const mapsUrl: string | undefined = place.googleMapsURI
        ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
      const loc = place.location;
      onPick({
        name,
        address: place.formattedAddress ?? undefined,
        kind: guessKind(place.types ?? []),
        photoUrl,
        photoUrls,
        mapsUrl,
        placeId: place.id ?? pred.placeId ?? undefined,
        lat: typeof loc?.lat === 'function' ? loc.lat() : loc?.lat,
        lng: typeof loc?.lng === 'function' ? loc.lng() : loc?.lng,
      });
    } catch {
      // fall back to the prediction's text
      onPick({ name: s.placePrediction?.text?.text ?? text, kind: 'ACTIVITY' });
    } finally {
      // Uncontrolled clears the box; controlled keeps the value (parent's onPick
      // sets it from the picked place).
      if (!controlled) setQ('');
      setItems([]); setOpen(false);
      token.current = places.current ? new places.current.AutocompleteSessionToken() : null;
    }
  }

  return (
    <div className="bp-placesearch" ref={boxRef}>
      <span className="material-symbols-outlined bp-placesearch__icon" aria-hidden="true">search</span>
      <input
        className="bp-input bp-placesearch__input"
        value={text}
        placeholder={placeholder ?? t('itinerary.placeSearchPh')}
        aria-label={ariaLabel ?? t('itinerary.placeSearch')}
        onChange={(e) => change(e.target.value)}
        onBlur={onBlur}
        onFocus={() => items.length && setOpen(true)}
      />
      {busy && <span className="bp-placesearch__busy" aria-hidden="true">…</span>}
      {open && (
        <ul className="bp-placesearch__list" role="listbox">
          {err ? (
            <li className="bp-placesearch__msg">{t('itinerary.placeSearchErr')}</li>
          ) : items.length === 0 ? (
            <li className="bp-placesearch__msg">{t('itinerary.placeSearchNone')}</li>
          ) : (
            items.map((s, i) => {
              const pred = s.placePrediction;
              const main = pred?.mainText?.text ?? pred?.text?.text ?? '';
              const sub = pred?.secondaryText?.text ?? '';
              return (
                <li key={pred?.placeId ?? i}>
                  <button type="button" className="bp-placesearch__opt" onClick={() => void pick(s)}>
                    <span className="material-symbols-outlined" aria-hidden="true">location_on</span>
                    <span className="bp-placesearch__opt-txt">
                      <span className="bp-placesearch__main">{main}</span>
                      {sub && <span className="bp-placesearch__sub">{sub}</span>}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
