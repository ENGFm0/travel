import { useTranslation } from 'react-i18next';
import { Logo } from '@/shared/ui/Logo';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bp-footer">
      <div className="bp-footer__inner">
        <Logo />
        <nav className="bp-footer__links" aria-label={t('footer.help')}>
          <a href="#privacy">{t('footer.privacy')}</a>
          <a href="#terms">{t('footer.terms')}</a>
          <a href="#help">{t('footer.help')}</a>
        </nav>
        <div className="bp-footer__cp">{t('footer.copyright')}</div>
      </div>
    </footer>
  );
}
