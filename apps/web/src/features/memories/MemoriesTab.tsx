import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CURRENT_UID } from '@/features/members/membersService';
import {
  canDelete, groupMedia, mediaTypeOf, validateFile, type Grouping,
} from './memoriesModel';
import { memoriesActions, useMemories } from './memoriesStore';

interface Props {
  tripId: string;
  canEdit: boolean;
  isOwner: boolean;
  places: string[];
  tripTitle: string;
  memberCount: number;
}

export function MemoriesTab({ tripId, canEdit, isOwner, places, tripTitle, memberCount }: Props) {
  const { t } = useTranslation();
  const { media, loading } = useMemories();
  const [group, setGroup] = useState<Grouping>('day');
  const [day, setDay] = useState('1');
  const [place, setPlace] = useState(places[0] ?? '—');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void memoriesActions.load(tripId);
    return () => memoriesActions.reset();
  }, [tripId]);

  const groups = useMemo(() => groupMedia(media ?? [], group), [media, group]);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    const err = validateFile(file.type, file.size);
    if (err) { setUploadError(err); return; }
    setUploadError(null);
    setBusy(true);
    let src = '';
    try { src = URL.createObjectURL(file); } catch { /* jsdom: no object URLs */ }
    await memoriesActions.upload(
      { type: mediaTypeOf(file.type), src, name: file.name, day: t('memories.dayN', { n: day }), place },
      CURRENT_UID,
    );
    setBusy(false);
  }

  async function share() {
    const url = await memoriesActions.shareLink(tripId);
    try { await navigator.clipboard?.writeText(url); } catch { /* clipboard may be unavailable */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function exportReport() {
    const lines = [
      `${t('memories.report')} — ${tripTitle}`,
      `${t('tripDetail.tabItinerary')}: ${places.join('، ') || '—'}`,
      `${t('tripDetail.tabMembers')}: ${memberCount}`,
      `${t('memories.mediaCount', { count: media?.length ?? 0 })}`,
      t('memories.reportFinanceNote'),
    ];
    setReport(lines.join('\n'));
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
          <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={exportReport}>{t('memories.export')}</button>
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
          <input ref={fileRef} type="file" accept="image/*,video/*" className="bp-vh" onChange={onPick} aria-label={t('memories.upload')} />
          <button className="bp-btn bp-btn--primary bp-btn--sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <span className="material-symbols-outlined" aria-hidden="true">add_a_photo</span>
            {busy ? t('memories.uploading') : t('memories.upload')}
          </button>
        </div>
      )}

      {errText && <div className="bp-banner" role="alert">{errText}</div>}

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
                    : <img className="bp-mem-media" src={m.src} alt={m.name} loading="lazy" />}
                  {canDelete(m, CURRENT_UID, isOwner) && (
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
