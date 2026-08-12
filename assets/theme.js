/* هوية بوردنق الموحّدة لإعداد Tailwind (تُحمّل بعد سكربت CDN) */
if (window.tailwind) {
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          'brand-surface': '#FDF6EC',
          'brand-navy': '#14213D',
          'brand-orange': '#E85D3D',
          'brand-gold': '#F4A950',
          'brand-teal': '#2A9D8F',
          'brand-violet': '#7C5CBF',
          'brand-blue': '#3A6EA5',
          'surface-variant': '#e6e2d8',
          'ok': '#2A9D8F',
          'error': '#ba1a1a'
        },
        fontFamily: {
          sans: ['IBM Plex Sans Arabic', 'system-ui', 'sans-serif']
        },
        borderRadius: { xl: '0.75rem', '2xl': '1rem', '3xl': '1.5rem' },
        boxShadow: { card: '0 4px 12px rgba(20,33,61,0.06)', pop: '0 12px 28px rgba(20,33,61,0.14)' }
      }
    }
  };
}
