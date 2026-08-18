import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { deepLinkFor, iconFor, unreadCount, type AppNotification } from './notificationsModel';
import { notificationsActions, useNotifications } from './notificationsStore';

export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const locale = useUIStore((s) => s.locale);
  const { items } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { void notificationsActions.load(); }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const list = items ?? [];
  const unread = unreadCount(list);

  function openItem(n: AppNotification) {
    void notificationsActions.markRead(n.id);
    setOpen(false);
    navigate(deepLinkFor(n));
  }

  return (
    <div className="bp-notif" ref={ref}>
      <button type="button" className="bp-icon-btn bp-notif__bell" aria-haspopup="true" aria-expanded={open}
        aria-label={unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.bell')}
        onClick={() => setOpen((v) => !v)}>
        <span className="material-symbols-outlined" aria-hidden="true">notifications</span>
        {unread > 0 && <span className="bp-notif__badge" aria-hidden="true">{unread}</span>}
      </button>

      {open && (
        <div className="bp-notif__panel" role="dialog" aria-label={t('notifications.title')}>
          <div className="bp-notif__head">
            <strong>{t('notifications.title')}</strong>
            {unread > 0 && <button className="bp-link-btn" onClick={() => notificationsActions.markAllRead()}>{t('notifications.markAll')}</button>}
          </div>
          {list.length === 0 ? (
            <p className="bp-notif__empty">{t('notifications.empty')}</p>
          ) : (
            <ul className="bp-notif__list" role="list">
              {list.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`bp-notif__item ${n.read ? '' : 'is-unread'}`} onClick={() => openItem(n)}>
                    <span className="material-symbols-outlined bp-notif__icon" aria-hidden="true">{iconFor(n.type)}</span>
                    <span className="bp-notif__body">
                      <span className="bp-notif__msg">{t(`notifications.msg.${n.type}`, { actor: n.actor ?? '' })}</span>
                      <span className="bp-notif__time">{formatDate(n.ts, locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                    {!n.read && <span className="bp-notif__dot" aria-label={t('notifications.unread')} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
