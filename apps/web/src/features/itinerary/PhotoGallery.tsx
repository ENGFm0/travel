import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { fetchPlacePhotos, resolvePlacePhotos, mapsEnabled } from '@/shared/googleMaps';

/** A place's photos: a large hero image + thumbnail strip, opening a
 *  full-screen lightbox you can browse (prev/next, keyboard, swipe-friendly).
 *  When we don't already hold a full set, it pulls all photos (up to ~10) live
 *  from Google — by `placeId`, or by resolving `query` (name + city) — so even
 *  old entries fill up like Google Maps. */
export function PhotoGallery({ photos, alt, size = 'md', placeId, query }: { photos: string[]; alt: string; size?: 'sm' | 'md'; placeId?: string; query?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [live, setLive] = useState<string[] | null>(null);

  // Enrich when we don't already hold a full set. Query-by-name is used only
  // when a photo already exists (proof it's a real place) — never for a plain
  // hand-typed entry, so we don't waste calls or pull unrelated photos.
  useEffect(() => {
    let alive = true;
    const stored = photos.filter(Boolean).length;
    if (mapsEnabled() && stored <= 1) {
      const p = placeId ? fetchPlacePhotos(placeId) : (query && stored >= 1) ? resolvePlacePhotos(query) : null;
      p?.then((urls) => { if (alive && urls.length > 1) setLive(urls); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [placeId, query, photos]);

  const list = (live ?? photos).filter(Boolean);
  const n = list.length;

  const go = useCallback((d: number) => setI((v) => (n ? (v + d + n) % n : 0)), [n]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, go]);

  if (!n) return null;
  const openAt = (idx: number) => { setI(idx); setOpen(true); };

  return (
    <div className={`bp-gallery bp-gallery--${size}`}>
      <button type="button" className="bp-gallery__hero" onClick={() => openAt(0)} aria-label={t('itinerary.viewPhotos')}>
        <img src={list[0]} alt={alt} loading="lazy" />
        {n > 1 && (
          <span className="bp-gallery__count">
            <span className="material-symbols-outlined" aria-hidden="true">photo_library</span>{n}
          </span>
        )}
      </button>
      {n > 1 && (
        <div className="bp-gallery__strip">
          {list.slice(1, 6).map((src, k) => (
            <button type="button" key={src} className="bp-gallery__thumb" onClick={() => openAt(k + 1)} aria-label={t('itinerary.viewPhotos')}>
              <img src={src} alt="" loading="lazy" />
              {k === 4 && n > 6 && <span className="bp-gallery__more">+{n - 6}</span>}
            </button>
          ))}
        </div>
      )}

      {open && createPortal(
        <div className="bp-lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setOpen(false)}>
          <button type="button" className="bp-lightbox__close" aria-label={t('trips.close')} onClick={() => setOpen(false)}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
          <figure className="bp-lightbox__stage" onClick={(e) => e.stopPropagation()}>
            <img className="bp-lightbox__img" src={list[i]} alt={`${alt} — ${i + 1}`} />
            {n > 1 && <figcaption className="bp-lightbox__count">{i + 1} / {n}</figcaption>}
          </figure>
          {n > 1 && (
            <>
              <button type="button" className="bp-lightbox__nav bp-lightbox__nav--prev" aria-label={t('itinerary.photoPrev')}
                onClick={(e) => { e.stopPropagation(); go(-1); }}>
                <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
              </button>
              <button type="button" className="bp-lightbox__nav bp-lightbox__nav--next" aria-label={t('itinerary.photoNext')}
                onClick={(e) => { e.stopPropagation(); go(1); }}>
                <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
