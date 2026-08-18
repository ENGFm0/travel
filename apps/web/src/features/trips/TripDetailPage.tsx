import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { formatDate } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { MembersPanel } from '@/features/members/MembersPanel';
import { CURRENT_UID } from '@/features/members/membersService';
import { membersActions, useMembers } from '@/features/members/membersStore';
import { ItineraryTab } from '@/features/itinerary/ItineraryTab';
import { ExpensesTab } from '@/features/expenses/ExpensesTab';
import { tripsActions } from './tripsStore';
import type { Trip } from './tripsService';

type LoadState = 'loading' | 'ready' | 'missing';

const TABS = [
  { key: 'itinerary', icon: 'map', label: 'tripDetail.tabItinerary' },
  { key: 'expenses', icon: 'payments', label: 'tripDetail.tabExpenses', story: 'US-007' },
  { key: 'tasks', icon: 'checklist', label: 'tripDetail.tabTasks', story: 'US-008' },
  { key: 'members', icon: 'group', label: 'tripDetail.tabMembers' },
  { key: 'memories', icon: 'photo_library', label: 'tripDetail.tabMemories', story: 'US-013' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Trip dashboard shell (US-006): header + tabbed sub-nav. This story owns the
 *  shell + Itinerary tab; Members is US-009; Expenses/Tasks/Memories land with
 *  US-007/008/013. */
export function TripDetailPage() {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const { id = '' } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>('loading');
  const [trip, setTrip] = useState<Trip | null>(null);
  const { members } = useMembers();

  const initialTab = (hash.replace('#', '') as TabKey) || 'itinerary';
  const [tab, setTab] = useState<TabKey>(TABS.some((x) => x.key === initialTab) ? initialTab : 'itinerary');

  useEffect(() => {
    let live = true;
    setState('loading');
    tripsActions.get(id)
      .then((tr) => { if (!live) return; setTrip(tr); setState(tr ? 'ready' : 'missing'); })
      .catch(() => live && setState('missing'));
    return () => { live = false; };
  }, [id]);

  // Load members once at the dashboard level so role-gating works across tabs.
  useEffect(() => {
    if (state === 'ready') void membersActions.load(id);
    return () => membersActions.reset();
  }, [id, state]);

  useEffect(() => {
    const h = hash.replace('#', '');
    if (h && TABS.some((x) => x.key === h)) setTab(h as TabKey);
  }, [hash]);

  function selectTab(key: TabKey) {
    setTab(key);
    navigate({ hash: key }, { replace: true });
  }

  if (state === 'loading') {
    return <section className="bp-page" aria-busy="true"><p className="bp-page__lead">…</p></section>;
  }
  if (state === 'missing' || !trip) {
    return (
      <section className="bp-page">
        <h1>{t('tripDetail.notFoundTitle')}</h1>
        <p className="bp-page__lead">{t('tripDetail.notFoundLead')}</p>
        <Link className="bp-chip" to="/mytrips">{t('tripDetail.backToTrips')}</Link>
      </section>
    );
  }

  const domestic = trip.type === 'DOMESTIC';
  const dest = trip.cities.map((c) => c.name).filter(Boolean).join('، ');
  const range = trip.dateTo
    ? `${formatDate(trip.dateFrom, locale)} – ${formatDate(trip.dateTo, locale)}`
    : formatDate(trip.dateFrom, locale);
  const myRole = members?.find((m) => m.uid === CURRENT_UID)?.role;
  const canEdit = myRole !== 'VIEWER'; // UX gate; server enforces (BR-006-003)
  const activeCount = members?.filter((m) => m.status === 'ACTIVE').length ?? 0;

  return (
    <section className="bp-page bp-trip-detail">
      <Link className="bp-back" to="/mytrips">
        <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        {t('tripDetail.backToTrips')}
      </Link>

      <header className="bp-trip-detail__head">
        <div className="bp-trip-detail__titles">
          <span className={`bp-badge ${domestic ? 'bp-badge--green' : 'bp-badge--blue'}`}>
            {t(domestic ? 'trips.domestic' : 'trips.international')}
          </span>
          <h1>{trip.title}</h1>
          <p className="bp-trip-detail__meta">
            <span className="material-symbols-outlined" aria-hidden="true">location_on</span>{dest || '—'}
            <span className="bp-sep" aria-hidden="true">·</span>
            <span className="material-symbols-outlined" aria-hidden="true">event</span>{range}
            {activeCount > 0 && (<><span className="bp-sep" aria-hidden="true">·</span>
              <span className="material-symbols-outlined" aria-hidden="true">group</span>{t('tripDetail.memberCount', { count: activeCount })}</>)}
          </p>
        </div>
      </header>

      <TabNav tab={tab} onSelect={selectTab} />

      <div className="bp-tabpanel" role="tabpanel">
        {tab === 'itinerary' && (
          <ItineraryTab tripId={trip.id} canEdit={canEdit}
            seed={trip.cities.map((c) => ({ name: c.name, dateFrom: c.dateFrom, dateTo: c.dateTo }))} />
        )}
        {tab === 'expenses' && <ExpensesTab tripId={trip.id} canEdit={canEdit} isOwner={myRole === 'OWNER'} />}
        {tab === 'members' && <MembersPanel tripId={trip.id} />}
        {(tab === 'tasks' || tab === 'memories') && (() => {
          const cur = TABS.find((x) => x.key === tab)!;
          return <TabPlaceholder story={'story' in cur ? cur.story : ''} labelKey={cur.label} />;
        })()}
      </div>
    </section>
  );
}

function TabNav({ tab, onSelect }: { tab: TabKey; onSelect: (k: TabKey) => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex((x) => x.key === tab);
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const next = TABS[(i + delta + TABS.length) % TABS.length];
    onSelect(next.key);
    const btns = ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    btns?.[(i + delta + TABS.length) % TABS.length]?.focus();
  }

  return (
    <div className="bp-tabs" role="tablist" aria-label={t('tripDetail.tabsLabel')} ref={ref} onKeyDown={onKeyDown}>
      {TABS.map((x) => (
        <button key={x.key} role="tab" aria-selected={tab === x.key} tabIndex={tab === x.key ? 0 : -1}
          className={`bp-tabbtn ${tab === x.key ? 'is-on' : ''}`} onClick={() => onSelect(x.key)}>
          <span className="material-symbols-outlined" aria-hidden="true">{x.icon}</span>
          <span>{t(x.label)}</span>
        </button>
      ))}
    </div>
  );
}

function TabPlaceholder({ story, labelKey }: { story: string; labelKey: string }) {
  const { t } = useTranslation();
  return (
    <div className="bp-card">
      <span className="bp-chip">{story}</span>
      <p style={{ marginTop: 12, marginBottom: 0 }}>{t('tripDetail.tabSoon', { tab: t(labelKey) })}</p>
    </div>
  );
}
