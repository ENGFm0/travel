// Trip report: a self-contained, print-friendly HTML document built entirely
// on the device (no server). Opened in a new tab where the user taps
// "Print / Save as PDF" — the browser's print dialog produces the PDF, which
// handles Arabic shaping + RTL properly (unlike client-side PDF libraries).
//
// Design: cover hero → dashboard (stat tiles + charts) → timeline strip →
// itinerary (per-city cards with a day timeline) → expenses (tables +
// settlements) → members → photo mosaic. Charts are inline SVG/CSS so the
// document is fully offline and prints with colors.
//
// Color roles follow the data-viz method: a fixed categorical order for
// identity (expense categories, cities, activity kinds), one sequential hue
// for magnitude (who paid), a blue↔red diverging pair for balances, and a
// reserved status green for "settled". Every colored mark is direct-labeled
// so identity never rides on color alone.

import { formatCurrency, formatDate } from '@boardingpass/core';
import {
  activitySortKey, formatTime12, getItineraryBoard,
  type ActivityKind, type Board, type CitySeed, type CityStop, type FlightLeg,
} from '@/features/itinerary/itineraryService';
import { createExpensesService } from '@/features/expenses/expensesService';
import type { Member } from '@/features/members/membersService';
import { CATEGORIES, distribution, netByMember, settlements, type Category, type Finance } from '@/features/expenses/finance';
import type { Media } from './memoriesModel';

type T = (key: string, opts?: Record<string, unknown>) => string;
type Locale = 'ar' | 'en';

export interface ReportTrip {
  id: string;
  title: string;
  domestic: boolean;
  dateFrom: string;
  dateTo?: string;
  currency?: string;
  destCurrency?: string;
  citySeed: CitySeed[];
}

export interface ReportData {
  trip: ReportTrip;
  board: Board;
  members: Member[];
  finance: Finance | null;
  media: Media[];
  locale: Locale;
  t: T;
}

// Validated categorical palette (light surface), fixed order — never cycled.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const NEUTRAL = '#9aa3b8';
const slot = (i: number) => SERIES[i] ?? NEUTRAL;
const CAT_COLOR: Record<Category, string> = { HOUSING: SERIES[0], FOOD: SERIES[1], TRANSPORT: SERIES[2], OTHER: SERIES[3] };
const KIND_COLOR: Record<ActivityKind, string> = {
  ARRIVAL: SERIES[0], FOOD: SERIES[1], SIGHT: SERIES[2], TRANSPORT: SERIES[3],
  SHOPPING: SERIES[4], ACTIVITY: SERIES[5], HOTEL: SERIES[6], OTHER: NEUTRAL,
};
const KIND_ICON: Record<ActivityKind, string> = {
  ARRIVAL: '🛬', FOOD: '🍽️', SIGHT: '🏛️', TRANSPORT: '🚕', SHOPPING: '🛍️', ACTIVITY: '🎯', HOTEL: '🏨', OTHER: '📌',
};
const POS = '#2a78d6'; // diverging: owed (+)
const NEG = '#e34948'; // diverging: owes (−)
const GOOD = '#0ca30c'; // status: settled

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const DAY = 86_400_000;
const dayDiff = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY)) : 0);
const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * DAY).toISOString().slice(0, 10);
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '•';

/** Google Maps link for a place: explicit link → pinned coords → name + city search. */
const mapsUrl = (name: string, city: string, explicit?: string, lat?: number, lng?: number) =>
  explicit || (lat != null && lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${city}`.trim())}`);
/** Clickable place name (label must already be escaped). */
const place = (label: string, href: string) => `<a class="place" href="${esc(href)}" target="_blank" rel="noopener">${label} <span class="pin">📍</span></a>`;

function legLine(leg: FlightLeg | undefined, locale: Locale): string {
  if (!leg) return '';
  const bits = [leg.airline, leg.no, leg.from && leg.to ? `${leg.from} → ${leg.to}` : (leg.from || leg.to)].filter(Boolean);
  const when = [leg.date ? formatDate(leg.date, locale) : '', leg.time ? formatTime12(leg.time, locale) : ''].filter(Boolean).join(' · ');
  return [bits.join(' · '), when].filter(Boolean).map(esc).join(' — ');
}

/** Donut chart (SVG) with 2px surface gaps between segments; direct-labeled legend. */
type DonutPart = { label: string; value: number; color: string; sub?: string };
function donut(parts: DonutPart[], total: number, center: string, sub: string): string {
  const r = 54, cx = 72, cy = 72, C = 2 * Math.PI * r, gap = 3;
  let off = 0;
  const segs = parts.filter((p) => p.value > 0).map((p) => {
    const len = (p.value / total) * C;
    const s = `<circle r="${r}" cx="${cx}" cy="${cy}" fill="none" stroke="${p.color}" stroke-width="20" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += len;
    return s;
  }).join('');
  const legend = parts.filter((p) => p.value > 0).map((p) =>
    `<li><i style="background:${p.color}"></i><span class="lg-name">${esc(p.label)}</span><span class="lg-val">${esc(p.sub ?? '')}</span><span class="lg-pct">${Math.round((p.value / total) * 100)}%</span></li>`).join('');
  return `<div class="donut"><svg viewBox="0 0 144 144" width="144" height="144" role="img" aria-label="${esc(center)}">
      <circle r="${r}" cx="${cx}" cy="${cy}" fill="none" stroke="#eef1f8" stroke-width="20"/>${segs}
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="dn-val">${esc(center)}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="dn-sub">${esc(sub)}</text>
    </svg><ul class="legend">${legend}</ul></div>`;
}

/** Thin stacked bars: group-pot segment (solid) + side-kitty segment (same hue,
 *  hatched) with a 2px surface gap; direct-labeled with the breakdown. */
function hbars(rows: { label: string; a: number; b: number; color: string; text: string; sub?: string }[]): string {
  const max = Math.max(...rows.map((r) => r.a + r.b), 0) || 1;
  return `<div class="hbars">${rows.map((r) => `<div class="hb"><span class="hb-name">${esc(r.label)}</span><span class="hb-track">${r.a > 0 ? `<span class="hb-fill" style="width:${(r.a / max) * 100}%;background:${r.color}"></span>` : ''}${r.b > 0 ? `<span class="hb-fill hb-side" style="width:${(r.b / max) * 100}%;background:${r.color}"></span>` : ''}</span><span class="hb-val">${esc(r.text)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span></div>`).join('')}</div>`;
}

/** Diverging bars around a center baseline: + grows one way (blue), − the other (red). */
function dbars(rows: { label: string; value: number; text: string }[]): string {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;
  return `<div class="dbars">${rows.map((r) => {
    const w = Math.max(2, (Math.abs(r.value) / max) * 100);
    const settled = Math.abs(r.value) < 0.005;
    return `<div class="db"><span class="db-name">${esc(r.label)}</span>
      <span class="db-track"><span class="db-neg">${r.value < 0 && !settled ? `<i style="width:${w}%;background:${NEG}"></i>` : ''}</span><span class="db-pos">${r.value > 0 && !settled ? `<i style="width:${w}%;background:${POS}"></i>` : ''}</span></span>
      <span class="db-val ${settled ? 'ok' : r.value > 0 ? 'pos' : 'neg'}">${esc(r.text)}</span></div>`;
  }).join('')}</div>`;
}

/** Build the full report document (pure; unit-testable). */
export function buildTripReportHtml(d: ReportData): string {
  const { trip, board, members, finance, media, locale, t } = d;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const cur = trip.currency || 'SAR';
  const money = (n: number) => formatCurrency(n, cur, locale);
  const short = (n: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', { maximumFractionDigits: 0 }).format(n);
  const active = members.filter((m) => m.status === 'ACTIVE');
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.displayName ?? uid;
  const range = trip.dateTo ? `${formatDate(trip.dateFrom, locale)} – ${formatDate(trip.dateTo, locale)}` : formatDate(trip.dateFrom, locale);
  const cities = board.cities;
  const cityNames = cities.map((c) => c.name).filter(Boolean);
  const cityColor = (c: CityStop) => slot(cities.indexOf(c));
  const memberColor = (uid: string) => slot(active.findIndex((m) => m.uid === uid));

  // ---- KPIs -------------------------------------------------------------------
  const tripDays = trip.dateTo ? dayDiff(trip.dateFrom, trip.dateTo) + 1 : Math.max(1, cities.reduce((a, c) => a + c.days.length, 0));
  const activities = cities.reduce((a, c) => a + c.days.reduce((b, dd) => b + dd.activities.length, 0), 0);
  const images = media.filter((m) => m.type === 'image' && m.src);
  const videos = media.filter((m) => m.type === 'video');
  const groupTotal = finance?.group.reduce((a, e) => a + e.amount, 0) ?? 0;
  const sideTotal = finance?.sides.reduce((a, s) => a + s.total, 0) ?? 0;
  const grand = groupTotal + sideTotal;
  // Per head is from the GROUP pot only (split across all members). Side kitties
  // are split among their own participants — never across everyone.
  const perHead = active.length ? groupTotal / active.length : 0;

  const kpis = [
    { icon: '📅', label: t('memories.rpt.days'), value: short(tripDays) },
    { icon: '📍', label: t('memories.rpt.cities'), value: short(cityNames.length) },
    { icon: '👥', label: t('tripDetail.tabMembers'), value: short(active.length) },
    { icon: '🎯', label: t('memories.rpt.activities'), value: short(activities) },
    { icon: '📸', label: t('memories.rpt.photos'), value: short(images.length) },
  ];
  const moneyTiles = [
    { label: t('expenses.groupSpend'), value: money(groupTotal), accent: SERIES[0], big: true, sub: t('memories.rpt.groupNote') },
    { label: t('memories.rpt.perHeadGroup'), value: money(perHead), accent: '#f26b3a', big: true, sub: t('memories.rpt.perHeadNote') },
    { label: t('expenses.sideSpend'), value: money(sideTotal), accent: SERIES[2], big: false, sub: t('memories.rpt.sideNote', { count: finance?.sides.length ?? 0 }) },
    { label: t('memories.rpt.grandAll'), value: money(grand), accent: '#14213d', big: false, sub: t('memories.rpt.grandNote') },
  ];

  // ---- Charts -------------------------------------------------------------------
  let charts = '';
  let settleCards = '';
  if (finance && active.length) {
    const uids = active.map((m) => m.uid);
    const dist = distribution(finance.group);
    const catParts: DonutPart[] = CATEGORIES.map((k) => ({ label: t(`expenses.cat.${k}`), value: dist[k], color: CAT_COLOR[k], sub: money(dist[k]) }));
    // Keep group-pot and side-kitty payments apart (they split differently).
    const paidG: Record<string, number> = {};
    const paidS: Record<string, number> = {};
    for (const e of finance.group) paidG[e.payerUid] = (paidG[e.payerUid] ?? 0) + e.amount;
    for (const s of finance.sides) paidS[s.payerUid] = (paidS[s.payerUid] ?? 0) + s.total;
    const nets = netByMember(finance, uids);
    const transfers = settlements(nets);

    const catChart = groupTotal > 0
      ? donut(catParts, groupTotal, short(groupTotal), cur)
      : `<p class="muted">${esc(t('expenses.noGroup'))}</p>`;
    const paidChart = grand > 0
      ? hbars(uids.map((u) => {
          const g = paidG[u] ?? 0, s = paidS[u] ?? 0;
          const sub = s > 0 ? t('memories.rpt.paidSplit', { group: short(g), side: short(s) }) : undefined;
          return { label: nameOf(u), a: g, b: s, color: memberColor(u), text: money(g + s), sub };
        }))
      : `<p class="muted">${esc(t('expenses.noGroup'))}</p>`;
    const balChart = dbars(uids.map((u) => {
      const v = nets[u] ?? 0;
      const settled = Math.abs(v) < 0.005;
      return { label: nameOf(u), value: v, text: settled ? t('expenses.settledUp') : `${v > 0 ? t('expenses.owedShort') : t('expenses.owesShort')} ${money(Math.abs(v))}` };
    }));

    charts = `<div class="charts">
      <div class="card"><h4>🍩 ${esc(t('expenses.distribution'))}</h4><p class="hint">${esc(t('memories.rpt.catNote'))}</p>${catChart}</div>
      <div class="card"><h4>💳 ${esc(t('memories.rpt.paidBy'))}</h4><p class="hint">${esc(t('memories.rpt.paidLegend'))}</p>${paidChart}</div>
      <div class="card wide"><h4>⚖️ ${esc(t('memories.rpt.balance'))}</h4><p class="hint">${esc(t('memories.rpt.balanceHint'))}</p>${balChart}</div>
    </div>`;

    settleCards = transfers.length
      ? `<div class="settles">${transfers.map((tr) => `<div class="settle"><span class="av" style="background:${memberColor(tr.from)}">${esc(initials(nameOf(tr.from)))}</span><span class="st-name">${esc(nameOf(tr.from))}</span><span class="st-arrow">${dir === 'rtl' ? '◀' : '▶'}<b>${esc(money(tr.amount))}</b>${dir === 'rtl' ? '◀' : '▶'}</span><span class="st-name">${esc(nameOf(tr.to))}</span><span class="av" style="background:${memberColor(tr.to)}">${esc(initials(nameOf(tr.to)))}</span></div>`).join('')}</div>`
      : `<p class="allok">✅ ${esc(t('expenses.allSettled'))}</p>`;
  }

  // ---- Timeline strip ------------------------------------------------------------
  let n = 0;
  const strip = cities.map((c) => {
    const dates = c.days.length ? c.days.map((dd) => dd.date) : (c.dateFrom ? Array.from({ length: Math.min(14, dayDiff(c.dateFrom, c.dateTo) + 1) }, (_, i) => addDays(c.dateFrom!, i)) : [undefined]);
    const cells = dates.map((dt) => { n += 1; return `<div class="tl-cell" style="--c:${cityColor(c)}"><b>${short(n)}</b><span>${dt ? esc(formatDate(dt, locale, { weekday: 'short' })) : ''}</span></div>`; }).join('');
    return `<div class="tl-city"><div class="tl-cells">${cells}</div><div class="tl-name" style="color:${cityColor(c)}">${esc(c.name)}</div></div>`;
  }).join('');

  // ---- Itinerary ---------------------------------------------------------------
  const itinerary = cities.map((c) => {
    const nights = dayDiff(c.dateFrom, c.dateTo);
    const dates = c.dateFrom ? `${formatDate(c.dateFrom, locale)}${c.dateTo ? ` – ${formatDate(c.dateTo, locale)}` : ''}` : '';
    const stays = (c.stays ?? []).map((s) => `<span class="chip">🏨 ${place(esc(s.name), mapsUrl(s.name, c.name, s.mapsUrl, s.lat, s.lng))}${s.note ? ` <em>${esc(s.note)}</em>` : ''}</span>`).join('')
      || (c.hotel ? `<span class="chip">🏨 ${place(esc(c.hotel), mapsUrl(c.hotel, c.name, c.hotelUrl))}</span>` : '');
    const transport: string[] = [];
    if (c.flightOut) transport.push(`<li>✈️ ${legLine(c.flightOut, locale)}</li>`);
    if (c.flightReturn) transport.push(`<li>✈️ ${legLine(c.flightReturn, locale)}</li>`);
    for (const l of c.legs ?? []) transport.push(`<li>✈️ ${legLine(l, locale)}</li>`);
    if (c.car) transport.push(`<li>🚗 ${c.carKind ? esc(t(`itinerary.carKind.${c.carKind}`)) + ' · ' : ''}${legLine(c.car, locale)}</li>`);
    if (c.cruise) transport.push(`<li>🚢 ${legLine(c.cruise, locale)}</li>`);
    const days = c.days.map((day, i) => {
      const acts = [...day.activities].sort((a, b) => activitySortKey(a).localeCompare(activitySortKey(b)));
      const items = acts.map((a) => {
        const when = a.time ? formatTime12(a.time, locale) : (a.period ? t(`itinerary.period.${a.period}`) : '');
        const kind = a.kind ?? 'OTHER';
        return `<li class="act"><span class="act-when">${esc(when)}</span><span class="act-dot" style="background:${KIND_COLOR[kind]}"></span>
          <div class="act-body"><div class="act-title">${KIND_ICON[kind]} ${place(esc(a.title), mapsUrl(a.title, c.name, a.mapsUrl))}${a.kind ? ` <span class="tag" style="--c:${KIND_COLOR[kind]}">${esc(t(`itinerary.kind.${a.kind}`))}</span>` : ''}</div>${a.note ? `<div class="muted">${esc(a.note)}</div>` : ''}</div>
          <span class="act-cost">${a.cost ? esc(money(a.cost)) : ''}</span></li>`;
      }).join('');
      const label = day.date ? formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'short' }) : '';
      const dayCost = acts.reduce((s, a) => s + (a.cost ?? 0), 0);
      return `<div class="day"><div class="day-h"><span class="day-n" style="background:${cityColor(c)}">${short(i + 1)}</span><h4>${esc(t('memories.dayN', { n: i + 1 }))}${label ? ` <span class="muted">· ${esc(label)}</span>` : ''}</h4>${dayCost ? `<span class="day-cost">${esc(money(dayCost))}</span>` : ''}</div>
        ${items ? `<ul class="acts">${items}</ul>` : `<p class="muted pad">${esc(t('itinerary.noActivities'))}</p>`}</div>`;
    }).join('');
    return `<section class="city" style="--c:${cityColor(c)}">
      <div class="city-h"><div><h3>${esc(c.name)}</h3>${dates ? `<div class="muted">📅 ${esc(dates)}${nights ? ` · 🌙 ${esc(t('memories.rpt.nights', { count: nights }))}` : ''}</div>` : ''}</div><span class="city-stat">${short(c.days.length)} ${esc(t('memories.rpt.days'))} · ${short(c.days.reduce((a, dd) => a + dd.activities.length, 0))} ${esc(t('memories.rpt.activities'))}</span></div>
      ${stays ? `<div class="chips">${stays}</div>` : ''}
      ${transport.length ? `<ul class="transport">${transport.join('')}</ul>` : ''}
      ${days}</section>`;
  }).join('');

  // ---- Expense tables -----------------------------------------------------------
  let tables = '';
  if (finance) {
    const groupRows = finance.group.map((e) =>
      `<tr><td><i class="sw" style="background:${CAT_COLOR[e.category]}"></i>${esc(e.desc)}</td><td>${esc(t(`expenses.cat.${e.category}`))}</td><td>${esc(nameOf(e.payerUid))}</td><td class="num">${esc(money(e.amount))}</td></tr>`).join('');
    const sideRows = finance.sides.map((s) =>
      `<tr><td>${esc(s.title)}${s.settled ? ` <span class="tag ok">${esc(t('expenses.settled'))}</span>` : ''}</td><td>${s.participantUids.map(nameOf).map(esc).join('، ')}</td><td>${esc(nameOf(s.payerUid))}</td><td class="num">${esc(money(s.total))}</td></tr>`).join('');
    tables = `${groupRows ? `<div class="card"><h4>🧾 ${esc(t('expenses.groupLog'))}</h4><table class="grid"><thead><tr><th>${esc(t('expenses.desc'))}</th><th>${esc(t('expenses.category'))}</th><th>${esc(t('expenses.payer'))}</th><th class="num">${esc(t('expenses.amount'))}</th></tr></thead><tbody>${groupRows}</tbody><tfoot><tr><td colspan="3">${esc(t('expenses.total'))}</td><td class="num">${esc(money(groupTotal))}</td></tr></tfoot></table></div>` : ''}
      ${sideRows ? `<div class="card"><h4>🤝 ${esc(t('expenses.side'))}</h4><table class="grid"><thead><tr><th>${esc(t('expenses.sideTitle'))}</th><th>${esc(t('expenses.participants'))}</th><th>${esc(t('expenses.payer'))}</th><th class="num">${esc(t('expenses.amount'))}</th></tr></thead><tbody>${sideRows}</tbody></table></div>` : ''}`;
  }

  // ---- Members ------------------------------------------------------------------
  const memberCards = active.map((m) => `<div class="member"><span class="av lg" style="background:${memberColor(m.uid)}">${esc(initials(m.displayName))}</span><div><b>${esc(m.displayName)}</b><div class="muted">${m.role === 'OWNER' ? '★ ' + esc(t('members.owner')) : esc(t('members.member'))}${m.handle ? ` · ${esc(m.handle)}` : ''}</div></div></div>`).join('');

  // ---- Memories -----------------------------------------------------------------
  const byDay = new Map<string, Media[]>();
  for (const m of images) { const k = m.day || '—'; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k)!.push(m); }
  const memories = images.length === 0 && videos.length === 0
    ? `<p class="muted">${esc(t('memories.empty'))}</p>`
    : [...byDay.entries()].map(([day, items]) =>
        `<h4 class="ph-day">${esc(day)} <span class="muted">· ${short(items.length)}</span></h4><div class="photos">${items.map((m, i) => `<figure class="${i === 0 && items.length > 2 ? 'big' : ''}"><img src="${esc(m.src)}" alt="${esc(m.name)}" loading="lazy">${m.place ? `<figcaption>📍 ${esc(m.place)}</figcaption>` : ''}</figure>`).join('')}</div>`).join('')
      + (videos.length ? `<p class="muted">🎬 ${esc(t('memories.videosNotIncluded', { count: videos.length }))}</p>` : '');

  // ---- Document -------------------------------------------------------------------
  const generated = formatDate(new Date(), locale, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const heroGrad = trip.domestic ? 'linear-gradient(135deg,#0f1b33 0%,#14213d 45%,#1f6a52 100%)' : 'linear-gradient(135deg,#0f1b33 0%,#14213d 45%,#2a5a8c 100%)';
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t('memories.report'))} — ${esc(trip.title)}</title>
<style>
  :root { color-scheme: light; --ink:#14213d; --ink2:#3a4a6b; --muted:#6b7590; --line:#e3e6ef; --surface:#fff; --page:#f3f5fa; --accent:#f26b3a; --pos:${POS}; --neg:${NEG}; --good:${GOOD}; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Noto Kufi Arabic","IBM Plex Sans Arabic","Segoe UI",system-ui,-apple-system,sans-serif; color: var(--ink); background: var(--page); line-height: 1.5; }
  .bar { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 10px 16px; background: var(--ink); color: #fff; }
  .bar button { font: inherit; font-weight: 700; border: 0; border-radius: 10px; padding: 10px 16px; cursor: pointer; background: var(--accent); color: #fff; }
  .bar button.ghost { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.5); }
  .sheet { max-width: 860px; margin: 0 auto; padding: 18px 16px 60px; }

  /* Cover */
  .hero { position: relative; overflow: hidden; background: ${heroGrad}; color: #fff; border-radius: 22px; padding: 28px 24px 22px; box-shadow: 0 14px 40px rgba(20,33,61,.25); }
  .hero::before { content: "${trip.domestic ? '🗺️' : '✈️'}"; position: absolute; inset-inline-end: -10px; top: -18px; font-size: 150px; opacity: .12; transform: scaleX(${dir === 'rtl' ? '-1' : '1'}); }
  .hero .badge { display: inline-block; font-size: 12px; font-weight: 800; letter-spacing: .3px; padding: 4px 12px; border-radius: 999px; background: rgba(255,255,255,.18); backdrop-filter: blur(4px); }
  .hero h1 { margin: 10px 0 6px; font-size: clamp(28px, 6vw, 40px); line-height: 1.15; }
  .hero .meta { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0 0 18px; opacity: .92; font-size: 14px; }
  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .kpi { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.18); border-radius: 14px; padding: 10px 6px; text-align: center; }
  .kpi b { display: block; font-size: 22px; line-height: 1.1; } .kpi span { font-size: 11px; opacity: .85; }
  @media (max-width: 520px) { .kpis { grid-template-columns: repeat(3, 1fr); } }

  h2 { display: flex; align-items: center; gap: 10px; font-size: 20px; margin: 28px 0 12px; break-after: avoid; }
  h2::after { content: ""; flex: 1; height: 2px; background: linear-gradient(to ${dir === 'rtl' ? 'left' : 'right'}, var(--accent), transparent); border-radius: 2px; }
  h3 { font-size: 18px; margin: 0; } h4 { font-size: 14px; margin: 0 0 10px; color: var(--ink2); break-after: avoid; }
  .muted { color: var(--muted); font-weight: 400; font-size: 13px; } .hint { margin: -6px 0 10px; font-size: 12px; color: var(--muted); }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; margin: 10px 0; break-inside: avoid; box-shadow: 0 2px 10px rgba(20,33,61,.04); }

  /* Dashboard */
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .tile { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px 12px; overflow: hidden; break-inside: avoid; }
  .tile::before { content: ""; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; width: 5px; background: var(--a); }
  .tile span { font-size: 12px; color: var(--muted); } .tile b { display: block; font-size: 18px; margin-top: 2px; } .tile.big b { font-size: 24px; color: var(--a); }
  @media (max-width: 560px) { .tiles { grid-template-columns: repeat(2, 1fr); } }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .charts .wide { grid-column: 1 / -1; }
  @media (max-width: 620px) { .charts { grid-template-columns: 1fr; } }
  .donut { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .dn-val { font-size: 20px; font-weight: 800; fill: var(--ink); } .dn-sub { font-size: 11px; fill: var(--muted); }
  .legend { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 160px; }
  .legend li { display: grid; grid-template-columns: 12px 1fr auto auto; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; border-bottom: 1px dashed var(--line); }
  .legend i { width: 12px; height: 12px; border-radius: 3px; } .lg-val { color: var(--ink2); font-variant-numeric: tabular-nums; } .lg-pct { color: var(--muted); font-size: 12px; min-width: 34px; text-align: end; }
  .hbars, .dbars { display: flex; flex-direction: column; gap: 8px; }
  .hb, .db { display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: 8px; font-size: 13px; }
  .hb-name, .db-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
  .hb-track { height: 14px; background: #eef1f8; border-radius: 4px; overflow: hidden; } .hb-fill { display: block; height: 100%; border-radius: 4px; }
  .hb-val, .db-val { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--ink2); }
  .db-track { display: grid; grid-template-columns: 1fr 1fr; height: 14px; position: relative; }
  .db-track::before { content: ""; position: absolute; inset-inline-start: 50%; top: -4px; bottom: -4px; width: 2px; background: #c3c2b7; }
  .db-neg, .db-pos { position: relative; } .db-neg i, .db-pos i { position: absolute; top: 0; height: 100%; border-radius: 4px; display: block; }
  .db-neg i { inset-inline-end: 1px; } .db-pos i { inset-inline-start: 1px; }
  .pos { color: var(--pos); font-weight: 700; } .neg { color: var(--neg); font-weight: 700; } .ok { color: var(--good); font-weight: 700; }
  .settles { display: grid; gap: 8px; }
  .settle { display: grid; grid-template-columns: auto 1fr auto 1fr auto; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; break-inside: avoid; }
  .st-name { font-weight: 700; } .st-name:last-of-type { text-align: end; }
  .st-arrow { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; } .st-arrow b { background: #fff3ec; color: var(--accent); border: 1px solid #ffd9c4; border-radius: 999px; padding: 3px 12px; font-size: 14px; white-space: nowrap; }
  .allok { background: #e8f7e8; color: #0a5a0a; border-radius: 12px; padding: 12px 14px; font-weight: 700; }
  .av { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: #fff; font-weight: 800; font-size: 13px; flex: none; } .av.lg { width: 44px; height: 44px; font-size: 16px; }

  /* Timeline strip */
  .timeline { display: flex; gap: 10px; overflow-x: auto; padding: 4px 0 6px; }
  .tl-city { flex: none; } .tl-cells { display: flex; gap: 4px; }
  .tl-cell { width: 44px; border-radius: 10px; background: var(--c); color: #fff; text-align: center; padding: 5px 0 4px; }
  .tl-cell b { display: block; font-size: 16px; line-height: 1.1; } .tl-cell span { font-size: 10px; opacity: .9; }
  .tl-name { font-size: 12px; font-weight: 800; margin-top: 4px; text-align: center; }

  /* Itinerary */
  .city { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px 10px; margin: 12px 0; break-inside: avoid; border-inline-start: 6px solid var(--c); }
  .city-h { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
  .city-stat { font-size: 12px; color: var(--c); font-weight: 800; background: color-mix(in srgb, var(--c) 12%, #fff); border-radius: 999px; padding: 4px 10px; white-space: nowrap; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; } .chip { background: #f3f5fa; border-radius: 999px; padding: 4px 10px; font-size: 12.5px; } .chip em { color: var(--muted); font-style: normal; }
  .transport { margin: 6px 0; padding-inline-start: 18px; font-size: 13px; color: var(--ink2); }
  .day { margin-top: 10px; } .day-h { display: flex; align-items: center; gap: 8px; } .day-h h4 { margin: 0; flex: 1; }
  .day-n { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: #fff; font-size: 12px; font-weight: 800; }
  .day-cost { font-size: 12px; font-weight: 700; color: var(--ink2); background: #f3f5fa; border-radius: 999px; padding: 2px 10px; }
  .acts { list-style: none; margin: 6px 0 4px; padding: 0; position: relative; }
  .acts::before { content: ""; position: absolute; inset-inline-start: 78px; top: 8px; bottom: 8px; width: 2px; background: var(--line); }
  .act { display: grid; grid-template-columns: 66px 12px 1fr auto; align-items: start; gap: 8px; padding: 6px 0; }
  .act-when { font-size: 12px; color: var(--muted); white-space: nowrap; padding-top: 2px; text-align: end; }
  .act-dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; box-shadow: 0 0 0 2px #fff; }
  .act-title { font-weight: 700; } .act-cost { font-size: 12.5px; color: var(--ink2); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--c, #9aa3b8) 14%, #fff); color: var(--c, #3a4a6b); vertical-align: middle; }
  .tag.ok { background: #e8f7e8; color: #0a5a0a; } .pad { padding-inline-start: 32px; }
  a.place { color: inherit; text-decoration: none; border-bottom: 1px dashed #b9c2d8; } a.place .pin { font-size: 11px; }
  .tile small { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; line-height: 1.3; }
  .hb-track { display: flex; gap: 2px; min-width: 90px; }
  .hb-val small { display: block; font-size: 10.5px; color: var(--muted); white-space: nowrap; }
  .hb-side { opacity: .6; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.6) 0 3px, transparent 3px 6px) !important; }

  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  td, th { padding: 7px 8px; border-bottom: 1px solid #edf0f6; vertical-align: top; text-align: start; }
  th { font-size: 12px; color: var(--muted); font-weight: 700; } tfoot td { font-weight: 800; border-top: 2px solid var(--line); border-bottom: 0; }
  .num { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-inline-end: 8px; vertical-align: middle; }

  .members { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .member { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; }

  .ph-day { margin: 14px 0 8px; }
  .photos { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 120px; grid-auto-flow: dense; gap: 6px; }
  figure { margin: 0; break-inside: avoid; position: relative; } figure.big { grid-column: span 2; grid-row: span 2; }
  figure img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; display: block; }
  figcaption { position: absolute; inset-inline-start: 6px; bottom: 6px; font-size: 10.5px; background: rgba(20,33,61,.7); color: #fff; padding: 2px 8px; border-radius: 999px; }
  @media (max-width: 560px) { .photos { grid-template-columns: repeat(3, 1fr); grid-auto-rows: 100px; } }

  footer { margin-top: 34px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); text-align: center; }
  footer b { color: var(--accent); }
  @media print {
    body { background: #fff; } .bar { display: none; } .sheet { max-width: none; padding: 0; }
    .hero { box-shadow: none; border-radius: 14px; } .card, .tile, .city, .settle, .member { box-shadow: none; }
    .page { break-before: page; } .timeline { overflow: visible; flex-wrap: wrap; }
    @page { margin: 12mm; }
  }
</style>
</head>
<body>
<div class="bar">
  <strong>${esc(t('memories.report'))}</strong>
  <div>
    <button class="ghost" onclick="window.close()">${esc(t('trips.close'))}</button>
    <button onclick="window.print()">🖨️ ${esc(t('memories.reportPrint'))}</button>
  </div>
</div>
<main class="sheet">
  <header class="hero">
    <span class="badge">${esc(t(trip.domestic ? 'trips.domestic' : 'trips.international'))} · ${esc(t('memories.rpt.coverTag'))}</span>
    <h1>${esc(trip.title)}</h1>
    <p class="meta"><span>📍 ${esc(cityNames.join('، ') || '—')}</span><span>📅 ${esc(range)}</span></p>
    <div class="kpis">${kpis.map((k) => `<div class="kpi"><b>${esc(k.value)}</b><span>${k.icon} ${esc(k.label)}</span></div>`).join('')}</div>
  </header>

  <h2>📊 ${esc(t('memories.rpt.dashboard'))}</h2>
  <div class="tiles">${moneyTiles.map((m) => `<div class="tile ${m.big ? 'big' : ''}" style="--a:${m.accent}"><span>${esc(m.label)}</span><b>${esc(m.value)}</b>${m.sub ? `<small>${esc(m.sub)}</small>` : ''}</div>`).join('')}</div>
  ${charts}
  ${settleCards ? `<h4 style="margin-top:14px">🔁 ${esc(t('expenses.whoPaysWhom'))}</h4>${settleCards}` : ''}

  ${strip ? `<h2>🧭 ${esc(t('memories.rpt.timeline'))}</h2><div class="card"><div class="timeline">${strip}</div></div>` : ''}

  <h2 class="page">🗺️ ${esc(t('tripDetail.tabItinerary'))}</h2>
  ${itinerary || `<p class="muted">—</p>`}

  ${tables ? `<h2 class="page">💰 ${esc(t('tripDetail.tabExpenses'))}</h2>${tables}` : ''}

  <h2>👥 ${esc(t('tripDetail.tabMembers'))}</h2>
  <div class="members">${memberCards || `<p class="muted">—</p>`}</div>

  <h2 class="page">📸 ${esc(t('tripDetail.tabMemories'))}</h2>
  ${memories}

  <footer>${esc(t('memories.reportGenerated', { date: generated }))} · <b>BoardingPass</b> ✈️</footer>
</main>
</body>
</html>`;
}

/** Gather everything for a trip and render the report. Returns the HTML.
 *  `members` are the trip's already-loaded members (from the members store). */
export async function loadTripReportHtml(trip: ReportTrip, media: Media[], members: Member[], locale: Locale, t: T): Promise<string> {
  const active = members.filter((m) => m.status === 'ACTIVE');
  const [board, finance] = await Promise.all([
    getItineraryBoard(trip.id, trip.citySeed).catch(() => ({ tripId: trip.id, cities: [] } as Board)),
    active.length
      ? createExpensesService().getFinance(trip.id, {
          memberUids: active.map((m) => m.uid), base: trip.currency || 'SAR', dest: trip.destCurrency || trip.currency || 'SAR', rate: 0.2122,
        }, active[0].uid).catch(() => null)
      : Promise.resolve(null),
  ]);
  return buildTripReportHtml({ trip, board, members, finance, media, locale, t });
}

/** Open the report in a new tab. The window is opened synchronously (so mobile
 *  pop-up blockers allow it) with a "preparing…" placeholder, then filled once
 *  the data is loaded. Falls back to a same-tab blob navigation if blocked. */
export async function openTripReport(trip: ReportTrip, media: Media[], members: Member[], locale: Locale, t: T): Promise<void> {
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(`<!doctype html><html dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><body style="font-family:system-ui;padding:40px;text-align:center;color:#14213d">${esc(t('memories.reportPreparing'))}</body></html>`);
  }
  const html = await loadTripReportHtml(trip, media, members, locale, t);
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.location.assign(url);
}
