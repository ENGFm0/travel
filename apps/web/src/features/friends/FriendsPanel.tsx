import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useTripsList } from '@/features/trips/tripsStore';
import { filterFriends } from './friendsModel';
import { friendsActions, useFriends } from './friendsStore';

function initialOf(name: string) { return name.trim().charAt(0).toUpperCase() || '?'; }

export function FriendsPanel() {
  const { t } = useTranslation();
  const { graph, loading, error } = useFriends();
  const { trips } = useTripsList();
  const [handle, setHandle] = useState('');
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => { void friendsActions.load(); }, []);

  const ownedTrips = useMemo(() => (trips ?? []).filter((tr) => tr.ownerUid === 'me' && tr.status === 'ACTIVE'), [trips]);
  const shown = useMemo(() => filterFriends(graph?.friends ?? [], query), [graph, query]);

  async function send() {
    if (!handle.trim()) return;
    const ok = await friendsActions.send(handle.trim());
    if (ok) { setHandle(''); setSent(true); window.setTimeout(() => setSent(false), 2000); }
  }

  const errText = error ? t(`friends.errors.${error}`, t('friends.errors.GENERIC')) : null;

  if (loading && graph === null) return <p className="bp-page__lead">…</p>;

  return (
    <div className="bp-friends">
      {/* Incoming requests */}
      {(graph?.incoming.length ?? 0) > 0 && (
        <section className="bp-section">
          <h3 className="bp-section__head">{t('friends.requests')}</h3>
          <ul className="bp-friend-list" role="list">
            {graph!.incoming.map((r) => (
              <li key={r.id} className="bp-friend">
                <span className="bp-avatar bp-avatar--sm" aria-hidden="true">{initialOf(r.name)}</span>
                <div className="bp-friend__info"><span className="bp-friend__name">{r.name}</span><span className="bp-friend__at">@{r.username}</span></div>
                <button className="bp-btn bp-btn--primary bp-btn--sm" onClick={() => friendsActions.accept(r.id)}>{t('friends.accept')}</button>
                <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => friendsActions.reject(r.id)}>{t('friends.reject')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Send request */}
      <section className="bp-section">
        <h3 className="bp-section__head">{t('friends.addFriend')}</h3>
        <div className="bp-add-row">
          <input className="bp-input" value={handle} placeholder={t('friends.handlePh')} aria-label={t('friends.addFriend')}
            onChange={(e) => { setHandle(e.target.value); if (error) friendsActions.clearError(); }}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void send())} />
          <button className="bp-btn bp-btn--primary bp-btn--sm" onClick={send}>{t('friends.send')}</button>
        </div>
        {errText && <div className="bp-banner" role="alert">{errText}</div>}
        {sent && !error && <span className="bp-ok" role="status">{t('friends.sent')}</span>}
      </section>

      {/* Friends list */}
      <section className="bp-section">
        <div className="bp-section__head">
          <h3>{t('friends.myFriends')}</h3>
          <input className="bp-input bp-input--sm" value={query} placeholder={t('friends.search')} aria-label={t('friends.search')} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {(graph?.friends.length ?? 0) === 0 ? (
          <div className="bp-empty">
            <span className="material-symbols-outlined bp-empty__icon" aria-hidden="true">group</span>
            <p>{t('friends.empty')}</p>
            <Link className="bp-chip" to="/buddies">{t('friends.discoverBuddies')}</Link>
          </div>
        ) : (
          <ul className="bp-friend-list" role="list">
            {shown.map((f) => (
              <li key={f.id} className="bp-friend">
                <span className="bp-avatar bp-avatar--sm" aria-hidden="true">{initialOf(f.name)}</span>
                <div className="bp-friend__info"><span className="bp-friend__name">{f.name}</span><span className="bp-friend__at">@{f.username}</span></div>
                {ownedTrips.length > 0 && <InviteToTrip friendId={f.id} trips={ownedTrips} />}
                <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('friends.remove')} onClick={() => friendsActions.remove(f.id)}>
                  <span className="material-symbols-outlined" aria-hidden="true">person_remove</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="bp-members__empty">{t('friends.noMatch')}</li>}
          </ul>
        )}
      </section>
    </div>
  );
}

function InviteToTrip({ friendId, trips }: { friendId: string; trips: { id: string; title: string }[] }) {
  const { t } = useTranslation();
  const [tripId, setTripId] = useState(trips[0]?.id ?? '');
  const [done, setDone] = useState(false);

  async function invite() {
    if (!tripId) return;
    await friendsActions.inviteToTrip(friendId, tripId);
    setDone(true);
    window.setTimeout(() => setDone(false), 2000);
  }

  return (
    <div className="bp-invite-trip">
      <label className="bp-vh" htmlFor={`bp-invtrip-${friendId}`}>{t('friends.inviteToTrip')}</label>
      <select id={`bp-invtrip-${friendId}`} className="bp-input bp-input--sm" value={tripId} onChange={(e) => setTripId(e.target.value)}>
        {trips.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
      </select>
      <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={invite}>{done ? t('friends.invited') : t('friends.inviteToTrip')}</button>
    </div>
  );
}
