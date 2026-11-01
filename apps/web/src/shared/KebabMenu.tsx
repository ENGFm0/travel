import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface KebabItem {
  key: string;
  label: string;
  /** Material Symbols icon name. */
  icon?: string;
  /** Destructive styling (red). */
  danger?: boolean;
  /** When set, selecting the item first shows this confirmation text inside
   *  the menu with Confirm / Cancel — the action runs only on Confirm. */
  confirm?: string;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
}

/** "⋮" overflow menu for secondary and destructive actions. Keeps deletes out
 *  of the main layout (away from navigation controls) and always behind a
 *  confirmation step when `confirm` is set. Closes on outside click / Escape. */
export function KebabMenu({ items, label, size = 'sm', className = '' }: {
  items: KebabItem[]; label: string; size?: 'sm' | 'xs' | 'md'; className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<KebabItem | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function close() { setOpen(false); setConfirming(null); }

  async function run(item: KebabItem) {
    setBusy(true);
    try { await item.onSelect(); } finally { setBusy(false); close(); }
  }

  function pick(item: KebabItem) {
    if (item.confirm) { setConfirming(item); return; }
    void run(item);
  }

  const btnSize = size === 'xs' ? 'bp-icon-btn--xs' : size === 'md' ? '' : 'bp-icon-btn--sm';
  return (
    <div className={`bp-kebab ${className}`} ref={ref} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`bp-icon-btn ${btnSize}`} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onClick={() => (open ? close() : setOpen(true))}>
        <span className="material-symbols-outlined" aria-hidden="true">more_vert</span>
      </button>
      {open && (
        <div className="bp-kebab__pop" id={id} role={confirming ? 'alertdialog' : 'menu'} aria-label={label}>
          {confirming ? (
            <div className="bp-kebab__confirm">
              <p>{confirming.confirm}</p>
              <div className="bp-kebab__confirm-row">
                <button type="button" className={`bp-btn bp-btn--sm ${confirming.danger ? 'bp-btn--danger' : 'bp-btn--primary'}`} disabled={busy} onClick={() => void run(confirming)}>
                  {busy ? '…' : t('menu.confirm')}
                </button>
                <button type="button" className="bp-btn bp-btn--outline bp-btn--sm" disabled={busy} onClick={() => setConfirming(null)}>{t('menu.cancel')}</button>
              </div>
            </div>
          ) : items.map((it) => (
            <button key={it.key} type="button" role="menuitem" className={`bp-kebab__item ${it.danger ? 'bp-kebab__item--danger' : ''}`} disabled={it.disabled || busy} onClick={() => pick(it)}>
              {it.icon && <span className="material-symbols-outlined" aria-hidden="true">{it.icon}</span>}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
