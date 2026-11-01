import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Logo } from '@/shared/ui/Logo';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bp-footer">
      <div className="bp-footer__inner">
        <Logo />
        <nav className="bp-footer__links" aria-label={t('footer.help')}>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <Link to="/terms">{t('footer.terms')}</Link>
          <Link to="/help">{t('footer.help')}</Link>
        </nav>
        <div className="bp-footer__cp">{t('footer.copyright')}</div>
      </div>
    </footer>
  );
}
