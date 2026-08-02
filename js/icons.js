/* =========================================================
   icons.js — أيقونات SVG بسيطة (خطوط نظيفة، أسلوب سفر واقعي)
   ========================================================= */

const svg = (paths, opts = {}) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${opts.w || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  back: svg('<path d="M9 18l6-6-6-6"/>'), // في RTL يظهر كسهم رجوع مناسب
  trash: svg('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>'),
  check: svg('<path d="M20 6L9 17l-5-5"/>'),
  pin: svg('<path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/>'),
  map: svg('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>'),
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  crown: svg('<path d="M3 7l4 5 5-7 5 7 4-5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"/>'),
  receipt: svg('<path d="M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1Z"/><path d="M9 7h6M9 11h6M9 15h4"/>'),
  wallet: svg('<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M16 12h4v-2a2 2 0 0 0-2 0"/><circle cx="17" cy="12" r="1" fill="currentColor" stroke="none"/>'),
  overview: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  external: svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', { w: 1.8 }),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  luggage: svg('<rect x="6" y="7" width="12" height="14" rx="2"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M10 11v6M14 11v6"/>'),
  edit: svg('<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  phone: svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>', { w: 1.7 }),
  send: svg('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  userplus: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'),
  coins: svg('<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/>', { w: 1.7 }),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  star: svg('<path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 2.5Z"/>', { w: 1.6 }),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  cloud: svg('<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.98A6 6 0 0 0 6.3 9.5 4 4 0 0 0 7 17.9"/><path d="M8 13h8"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  mail: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  wand: svg('<path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18.7 9.7 17 8M18.7 2.3 17 4M4 20l9-9M12.3 6.3 14 8"/>'),
  guest: svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),

  // فئات المصاريف
  cat_flight: svg('<path d="M17.8 19.2 16 11l3.5-3.5a2 2 0 1 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l4.4 3.9-2 2.3-2.6-.4-.9 1.1 3 1.4 1.4 3 1.1-.9-.4-2.6 2.3-2 3.9 4.4a1 1 0 0 0 1.7-.9Z"/>'),
  cat_hotel: svg('<path d="M3 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M14 9h6a1 1 0 0 1 1 1v11M2 21h20M7 8h.01M7 12h.01M7 16h.01M18 13h.01M18 17h.01"/>'),
  cat_food: svg('<path d="M4 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M6 3v18M14 3c-1.5 1-2 3-2 5s.5 3 2 3v10"/>'),
  cat_car: svg('<path d="M5 17h14M5 17a2 2 0 1 1-4 0M23 17a2 2 0 1 1-4 0M3 17v-4l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v4M6 8h12"/>', { w: 1.8 }),
  cat_shop: svg('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>'),
  cat_gift: svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/><path d="M12 8S10 3 7.5 3 5 6 7 8M12 8s2-5 4.5-5S19 6 17 8"/>'),
  cat_ticket: svg('<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z"/><path d="M13 6v2M13 11v2M13 16v2"/>'),
  cat_other: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3M12 17h.01"/>'),
};

export const catList = [
  { key: 'flight', label: 'طيران', icon: icons.cat_flight },
  { key: 'hotel', label: 'سكن', icon: icons.cat_hotel },
  { key: 'food', label: 'أكل', icon: icons.cat_food },
  { key: 'car', label: 'مواصلات', icon: icons.cat_car },
  { key: 'ticket', label: 'تذاكر', icon: icons.cat_ticket },
  { key: 'shop', label: 'تسوّق', icon: icons.cat_shop },
  { key: 'gift', label: 'هدايا', icon: icons.cat_gift },
  { key: 'other', label: 'أخرى', icon: icons.cat_other },
];

export function catIcon(key) {
  return (catList.find(c => c.key === key) || catList[catList.length - 1]).icon;
}
export function catLabel(key) {
  return (catList.find(c => c.key === key) || catList[catList.length - 1]).label;
}
