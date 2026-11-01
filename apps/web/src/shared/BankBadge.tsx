import { useTranslation } from 'react-i18next';
import { bankFromIban } from './saudiBanks';

/** Logo-style badge for the bank an IBAN belongs to: a solid brand-coloured
 *  pill with the bank's wordmark in white (and an accent stripe), followed by
 *  the full name. Renders nothing until the IBAN has a readable bank code. */
export function BankBadge({ iban, compact = false }: { iban: string; compact?: boolean }) {
  const { i18n } = useTranslation();
  const b = bankFromIban(iban);
  if (!b) return null;
  const name = i18n.language.startsWith('ar') ? b.ar : b.en;
  return (
    <span className={`bp-bank ${compact ? 'bp-bank--compact' : ''} ${b.known ? '' : 'bp-bank--unknown'}`} data-bank={b.code} title={name}>
      <span className="bp-bank__mark" style={{ background: b.color, boxShadow: b.accent ? `inset 0 -3px 0 ${b.accent}` : undefined }} aria-hidden="true">{b.short}</span>
      {!compact && <span className="bp-bank__name">{name}</span>}
      {compact && <span className="bp-vh">{name}</span>}
    </span>
  );
}
