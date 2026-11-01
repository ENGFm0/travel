import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface Section { h: string; p: string }

/** Static content pages (privacy, terms, help). The copy lives in i18n under
 *  `legal.<page>` as an ordered list of {h, p} sections so both languages stay
 *  in step (the completeness test compares key sets). */
function LegalPage({ page }: { page: 'privacy' | 'terms' | 'help' }) {
  const { t } = useTranslation();
  const sections = t(`legal.${page}.sections`, { returnObjects: true }) as Section[];
  const list = Array.isArray(sections) ? sections : [];
  return (
    <section className="bp-page bp-legal">
      <h1>{t(`legal.${page}.title`)}</h1>
      <p className="bp-page__lead">{t(`legal.${page}.lead`)}</p>
      <p className="bp-legal__meta">{t('legal.updated')}</p>
      <div className="bp-card bp-legal__card">
        {list.map((s, i) => (
          <section key={i} className="bp-legal__sec">
            <h2>{s.h}</h2>
            <p>{s.p}</p>
          </section>
        ))}
      </div>
      <p className="bp-legal__contact">
        {t('legal.contact')} <a href={`mailto:${t('legal.email')}`}>{t('legal.email')}</a>
      </p>
      <nav className="bp-legal__nav" aria-label={t('footer.help')}>
        {page !== 'privacy' && <Link to="/privacy">{t('footer.privacy')}</Link>}
        {page !== 'terms' && <Link to="/terms">{t('footer.terms')}</Link>}
        {page !== 'help' && <Link to="/help">{t('footer.help')}</Link>}
      </nav>
    </section>
  );
}

export const PrivacyPage = () => <LegalPage page="privacy" />;
export const TermsPage = () => <LegalPage page="terms" />;
export const HelpPage = () => <LegalPage page="help" />;
