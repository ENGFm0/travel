import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/** Boarding-pass mark (orange tilted ticket + plane, notches + perforation),
 *  vectorized to match the brand. Theme-adaptive text (ink) + orange latin. */
export function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <svg
      className="bp-logo__mark"
      style={{ height: size }}
      viewBox="0 0 56 42"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="bpMarkG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F6AE55" />
          <stop offset="1" stopColor="#E85D3D" />
        </linearGradient>
        <mask id="bpMarkM">
          <rect x="7" y="11" width="42" height="20" rx="5" fill="#fff" />
          <circle cx="35" cy="11" r="2.6" fill="#000" />
          <circle cx="35" cy="31" r="2.6" fill="#000" />
        </mask>
      </defs>
      <g transform="rotate(-22 28 21)">
        <rect x="7" y="11" width="42" height="20" rx="5" fill="url(#bpMarkG)" mask="url(#bpMarkM)" />
        <line
          x1="35"
          y1="14"
          x2="35"
          y2="28"
          stroke="#FFF7EE"
          strokeOpacity="0.8"
          strokeWidth="1.6"
          strokeDasharray="1.4 2.4"
          strokeLinecap="round"
        />
        <g transform="translate(13.8,13.8) scale(.6) rotate(-12 12 12)" fill="#FFF7EE">
          <path d="M21 16v-2l-8-5V3.5C13 2.67 12.33 2 11.5 2S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </g>
      </g>
    </svg>
  );
}

export function Logo() {
  const { t } = useTranslation();
  return (
    <Link className="bp-logo" to="/" aria-label={t('app.name')}>
      <LogoMark />
      <span className="bp-logo__text">
        <span className="bp-logo__ar">{t('app.name')}</span>
        <span className="bp-logo__en">{t('app.brandEn')}</span>
      </span>
    </Link>
  );
}
