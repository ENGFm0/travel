/** Single source of truth for navigation (shared shape web + mobile).
 *  Bottom nav = 5 items with a centered "New Trip" CTA (per US-014 FR-014-002). */
export interface NavItem {
  key: string;
  path: string;
  icon: string; // Material Symbols name
  labelKey: string; // i18n key under "nav"
  cta?: boolean;
}

export const BOTTOM_NAV: NavItem[] = [
  { key: 'home', path: '/', icon: 'home', labelKey: 'nav.home' },
  { key: 'explore', path: '/explore', icon: 'explore', labelKey: 'nav.explore' },
  { key: 'new', path: '/planner?new=1', icon: 'add', labelKey: 'nav.newTrip', cta: true },
  { key: 'buddies', path: '/buddies', icon: 'diversity_3', labelKey: 'nav.buddies' },
  { key: 'mytrips', path: '/mytrips', icon: 'luggage', labelKey: 'nav.mytrips' },
];

/** Full route registry (used by the router + for active-state matching). */
export const ROUTES = {
  home: '/',
  planner: '/planner',
  explore: '/explore',
  buddies: '/buddies',
  memories: '/memories',
  mytrips: '/mytrips',
  profile: '/profile',
} as const;
