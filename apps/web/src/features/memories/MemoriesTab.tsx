import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { currentUid, firebaseEnabled } from '@/shared/firebase';
import { CURRENT_UID } from '@/features/members/membersService';
import {
  canDelete, groupMedia, mediaTypeOf, validateFile, type Grouping, type Media,
} from './memoriesModel';
import { memoriesActions, useMemories } from './memoriesStore';
import { loadTripReportHtml, openTripReport, type ReportTrip } from './tripReport';
import { useUIStore } from '@/app/store/uiStore';
import { useMembers } from '@/features/members/membersStore';

interface Props {
  tripId: string;
  canEdit: boolean;
  isOwner: boolean;
  places: string[];
  tripTitle: string;
  memberCount: number;
  /** Everything the on-device trip report needs (itinerary seed, dates, currencies). */
  reportTrip?: ReportTrip;
}

export function MemoriesTab({ tripId, canEdit, isOwner, places, reportTrip }: Props) {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const { members } = useMembers(); // already loaded by the trip page
  const meUid = firebaseEnabled() ? (currentUid() ?? CURRENT_UID) : CURRENT_UID;
  const { media, loading, error } = useMemories();
  const [exporting, setExporting] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfPct, setPdfPct] = useState(0);
  const [pdfPreview, setPdfPreview] = useState<{ blob: Blob; pages: string[]; name: string } | null>(null);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [group, setGroup] = useState<Grouping>('day');
  const [day, setDay] = useState('1');
  const [place, setPlace] = useState(places[0] ?? '—');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Full-screen viewer: index into the flat media list.
  const [viewer, setViewer] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const touchX = useRef<number | null>(null);
  const deepLinked = useRef(false);
  const { search } = useLocation();

  useEffect(() => {
    void memoriesActions.load(tripId);
    return () => memoriesActions.reset();
  }, [tripId]);

  const groups = useMemo(() => groupMedia(media ?? [], group), [media, group]);
  const flat = media ?? [];

  // Deep link from the report (PDF / HTML): /trips/:id?photo=<mediaId>#memories
  // opens that photo full-size once the media list is loaded.
  useEffect(() => {
    if (deepLinked.current || !media) return;
    const id = new URLSearchParams(search).get('photo');
    if (!id) return;
    const i = media.findIndex((m) => m.id === id);
    if (i >= 0) { setViewer(i); deepLinked.current = true; }
  }, [media, search]);

  const current = viewer !== null ? flat[viewer] : undefined;
  const step = (d: 1 | -1) => setViewer((v) => (v === null || flat.length === 0 ? v : (v + d + flat.length) % flat.length));
  function onViewerKey(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') setViewer(null);
    else if (e.key === 'ArrowRight') step(locale === 'ar' ? -1 : 1);
    else if (e.key === 'ArrowLeft') step(locale === 'ar' ? 1 : -1);
  }
  function onTouchStart(e: ReactTouchEvent) { touchX.current = e.touches[0]?.clientX ?? null; }
  function onTouchEnd(e: ReactTouchEvent) {
    const x0 = touchX.current; touchX.current = null;
    const x1 = e.changedTouches[0]?.clientX;
    if (x0 === null || x1 === undefined) return;
    const dx = x1 - x0;
    if (Math.abs(dx) < 50) return;
    // Swipe towards the start of the reading direction = next.
    const next = locale === 'ar' ? dx > 0 : dx < 0;
    step(next ? 1 : -1);
  }

  /** Save / share the current photo or video as a real file (share sheet on
   *  phones → Save Image / Files / WhatsApp…; download elsewhere). */
  async function sharePhoto(m: Media) {
    if (sharing) return;
    setSharing(true);
    try {
      const blob = await (await fetch(m.src)).blob();
      const ext = m.type === 'video' ? 'mp4' : 'jpg';
      const base = (m.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
      const file = new File([blob], `${base}.${ext}`, { type: blob.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg') });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file] }); return; }
        catch (e) { if ((e as Error).name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { /* nothing sensible to do — the viewer stays open */ }
    finally { setSharing(false); }
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-picking the same files
    if (files.length === 0) return;
    setUploadError(null);
    setBusy(true);
    // Upload each selected file; skip (and flag) any that fail validation.
    for (const file of files) {
      const err = validateFile(file.type, file.size);
      if (err) { setUploadError(err); continue; }
      let src = '';
      try { src = URL.createObjectURL(file); } catch { /* jsdom: no object URLs */ }
      await memoriesActions.upload(
        { type: mediaTypeOf(file.type), src, name: file.name, day: t('memories.dayN', { n: day }), place, file },
        meUid,
      );
    }
    setBusy(false);
  }

  async function share() {
    const url = await memoriesActions.shareLink(tripId);
    try { await navigator.clipboard?.writeText(url); } catch { /* clipboard may be unavailable */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  /** Build the PDF on-device (real links + embedded photos) and share/download it. */
  async function downloadPdf() {
    if (!reportTrip || pdfBusy) return;
    setPdfBusy(true);
    setPdfPct(0);
    setReport(null);
    try {
      const html = await loadTripReportHtml(reportTrip, media ?? [], members ?? [], locale, t);
      const { renderReportPdf } = await import('./pdfExport');
      const { blob, pageImages } = await renderReportPdf(html, { onProgress: (p) => setPdfPct(Math.round(p * 100)) });
      const safe = reportTrip.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'trip';
      // Preview in-app first; saving/sharing happens on a fresh tap (iOS needs
      // the share sheet to be opened from a direct user gesture).
      setPdfPreview({ blob, pages: pageImages, name: `${safe}.pdf` });
    } catch (e) {
      setReport(`${t('memories.pdfFailed')} — ${(e as { code?: string; message?: string })?.code ?? (e as Error)?.message ?? ''}`);
    } finally {
      setPdfBusy(false);
    }
  }

  async function savePdf() {
    if (!pdfPreview || pdfSaving) return;
    setPdfSaving(true);
    try {
      const { saveOrSharePdf } = await import('./pdfExport');
      await saveOrSharePdf(pdfPreview.blob, pdfPreview.name);
    } catch (e) {
      setReport(`${t('memories.pdfFailed')} — ${(e as Error)?.message ?? ''}`);
    } finally {
      setPdfSaving(false);
    }
  }

  async function exportReport() {
    if (!reportTrip || exporting) return;
    setExporting(true);
    setReport(null);
    try {
      await openTripReport(reportTrip, media ?? [], members ?? [], locale, t);
    } catch (e) {
      // Surface a readable error in the existing report modal.
      setReport(`${t('memories.reportFailed')} — ${(e as { code?: string; message?: string })?.code ?? (e as Error)?.message ?? ''}`);
    } finally {
      setExporting(false);
    }
  }

  const errText = uploadError ? t(`memories.errors.${uploadError}`) : null;

  return (
    <div className="bp-memories">
      <div className="bp-memories__bar">
        <div className="bp-seg" role="group" aria-label={t('memories.groupBy')}>
          <button className={`bp-seg__btn ${group === 'day' ? 'is-on' : ''}`} aria-pressed={group === 'day'} onClick={() => setGroup('day')}>{t('memories.byDay')}</button>
          <button className={`bp-seg__btn ${group === 'place' ? 'is-on' : ''}`} aria-pressed={group === 'place'} onClick={() => setGroup('place')}>{t('memories.byPlace')}</button>
        </div>
        <div className="bp-memories__actions">
          <button className="bp-btn bp-btn--primary bp-btn--sm" onClick={downloadPdf} disabled={pdfBusy || !reportTrip}>
            {pdfBusy ? t('memories.pdfPreparing', { pct: pdfPct }) : t('memories.downloadPdf')}
          </button>
          <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={exportReport} disabled={exporting || !reportTrip}>
            {exporting ? t('memories.exporting') : t('memories.export')}
          </button>
          {isOwner && <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={share}>{copied ? t('members.copied') : t('memories.share')}</button>}
        </div>
      </div>

      {canEdit && (
        <div className="bp-uploader">
          <div className="bp-inline-field">
            <label className="bp-vh" htmlFor="bp-mem-day">{t('memories.day')}</label>
            <select id="bp-mem-day" className="bp-input bp-input--sm" value={day} onChange={(e) => setDay(e.target.value)} aria-label={t('memories.day')}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{t('memories.dayN', { n })}</option>)}
            </select>
          </div>
          <div className="bp-inline-field">
            <label className="bp-vh" htmlFor="bp-mem-place">{t('memories.place')}</label>
            <select id="bp-mem-place" className="bp-input bp-input--sm" value={place} onChange={(e) => setPlace(e.target.value)} aria-label={t('memories.place')}>
              {(places.length ? places : ['—']).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="bp-vh" onChange={onPick} aria-label={t('memories.upload')} />
          <button className="bp-btn bp-btn--primary bp-btn--sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <span className="material-symbols-outlined" aria-hidden="true">add_a_photo</span>
            {busy ? t('memories.uploading') : t('memories.upload')}
          </button>
        </div>
      )}

      {errText && <div className="bp-banner" role="alert">{errText}</div>}
      {error && <div className="bp-banner" role="alert">{t('memories.uploadFailed')} — {error}</div>}

      {loading && media === null ? (
        <p className="bp-page__lead">…</p>
      ) : (media?.length ?? 0) === 0 ? (
        <div className="bp-empty"><span className="material-symbols-outlined bp-empty__icon" aria-hidden="true">photo_library</span><p>{t('memories.empty')}</p></div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="bp-mem-group">
            <h4 className="bp-panel__h">{g.label}</h4>
            <ul className="bp-mem-grid" role="list">
              {g.items.map((m) => (
                <li key={m.id} className="bp-mem-item">
                  {m.type === 'video'
                    ? <video className="bp-mem-media" src={m.src} controls aria-label={m.name} />
                    : (
                      <button type="button" className="bp-mem-open" aria-label={t('memories.viewPhoto')} onClick={() => setViewer(flat.indexOf(m))}>
                        <img className="bp-mem-media" src={m.src} alt={m.name} loading="lazy" />
                      </button>
                    )}
                  {canDelete(m, meUid, isOwner) && (
                    <button className="bp-mem-del" aria-label={t('memories.delete')} onClick={() => memoriesActions.remove(m.id)}>
                      <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {current && (
        <div className="bp-lightbox" role="dialog" aria-modal="true" aria-label={current.name} tabIndex={-1} autoFocus
          onKeyDown={onViewerKey} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="bp-lightbox__head">
            <span className="bp-lightbox__count">{t('memories.photoOf', { n: (viewer ?? 0) + 1, total: flat.length })}</span>
            <span className="bp-lightbox__meta">{current.place}{current.place && current.day ? ' · ' : ''}{current.day}</span>
            <button className="bp-icon-btn" aria-label={t('trips.close')} onClick={() => setViewer(null)}>
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>
          <div className="bp-lightbox__stage" onClick={(e) => e.target === e.currentTarget && setViewer(null)}>
            {current.type === 'video'
              ? <video key={current.id} className="bp-lightbox__media" src={current.src} controls autoPlay playsInline />
              : <img key={current.id} className="bp-lightbox__media" src={current.src} alt={current.name} />}
          </div>
          <div className="bp-lightbox__actions">
            <button className="bp-icon-btn bp-lightbox__nav" aria-label={t('memories.prev')} onClick={() => step(-1)} disabled={flat.length < 2}>
              <span className="material-symbols-outlined" aria-hidden="true">{locale === 'ar' ? 'chevron_right' : 'chevron_left'}</span>
            </button>
            <button className="bp-btn bp-btn--primary" onClick={() => sharePhoto(current)} disabled={sharing}>
              <span className="material-symbols-outlined" aria-hidden="true">ios_share</span>
              {sharing ? t('memories.saving') : t('memories.sharePhoto')}
            </button>
            <button className="bp-icon-btn bp-lightbox__nav" aria-label={t('memories.next')} onClick={() => step(1)} disabled={flat.length < 2}>
              <span className="material-symbols-outlined" aria-hidden="true">{locale === 'ar' ? 'chevron_left' : 'chevron_right'}</span>
            </button>
          </div>
        </div>
      )}

      {pdfPreview && (
        <div className="bp-pdfprev" role="dialog" aria-modal="true" aria-label={t('memories.pdfPreviewTitle')}>
          <div className="bp-pdfprev__head">
            <strong>{t('memories.pdfPreviewTitle')}</strong>
            <span className="bp-pdfprev__count">{t('memories.pdfPages', { count: pdfPreview.pages.length })}</span>
            <button className="bp-icon-btn" aria-label={t('trips.close')} onClick={() => setPdfPreview(null)}>
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>
          <div className="bp-pdfprev__scroll">
            {pdfPreview.pages.map((src, i) => (
              <img key={i} className="bp-pdfprev__page" src={src} alt={`${i + 1}`} />
            ))}
          </div>
          <div className="bp-pdfprev__actions">
            <button className="bp-btn bp-btn--outline" onClick={() => setPdfPreview(null)}>{t('trips.close')}</button>
            <button className="bp-btn bp-btn--primary" onClick={savePdf} disabled={pdfSaving}>
              {pdfSaving ? t('memories.saving') : t('memories.pdfSave')}
            </button>
          </div>
        </div>
      )}

      {report !== null && (
        <div className="bp-scrim" onMouseDown={(e) => e.target === e.currentTarget && setReport(null)}>
          <div className="bp-modal" role="dialog" aria-modal="true" aria-label={t('memories.report')} onMouseDown={(e) => e.stopPropagation()}>
            <div className="bp-modal__head">
              <h2 className="bp-modal__title">{t('memories.report')}</h2>
              <button className="bp-icon-btn" aria-label={t('trips.close')} onClick={() => setReport(null)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
            </div>
            <pre className="bp-report">{report}</pre>
            <p className="bp-note">{t('memories.reportExportNote')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
