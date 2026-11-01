import { useTranslation } from 'react-i18next';
import { bankFromIban } from './saudiBanks';

/** Brand-coloured chip naming the bank an IBAN belongs to ("🟦 مصرف الراجحي").
 *  Renders nothing until the IBAN has a readable bank code (6+ chars). */
export function BankBadge({ iban, compact = false }: { iban: string; compact?: boolean }) {
  const { i18n } = useTranslation();
  const b = bankFromIban(iban);
  if (!b) return null;
  const name = i18n.language.startsWith('ar') ? b.ar : b.en;
  return (
    <span className={`bp-bank ${compact ? 'bp-bank--compact' : ''} ${b.known ? '' : 'bp-bank--unknown'}`}
      style={{ background: `${b.color}1a`, color: b.color, borderColor: `${b.color}55` }}
      data-bank={b.code} title={name}>
      <span className="bp-bank__emoji" aria-hidden="true">{b.emoji}</span>
      <span className="bp-bank__name">{name}</span>
    </span>
  );
}
