// Trip report: a self-contained, print-friendly HTML document built entirely
// on the device (no server). Opened in a new tab where the user taps
// "Print / Save as PDF" — the browser's print dialog produces the PDF, which
// handles Arabic shaping + RTL properly (unlike client-side PDF libraries).

import { formatCurrency, formatDate } from '@boardingpass/core';
import { getItineraryBoard, type Board, type CitySeed, type FlightLeg } from '@/features/itinerary/itineraryService';
import { activitySortKey, formatTime12 } from '@/features/itinerary/itineraryService';
import { createExpensesService } from '@/features/expenses/expensesService';
import type { Member } from '@/features/members/membersService';
import { distribution, netByMember, settlements, type Finance } from '@/features/expenses/finance';
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

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function legLine(leg: FlightLeg | undefined, locale: Locale): string {
  if (!leg) return '';
  const bits = [leg.airline, leg.no, leg.from && leg.to ? `${leg.from} → ${leg.to}` : (leg.from || leg.to)].filter(Boolean);
  const when = [leg.date ? formatDate(leg.date, locale) : '', leg.time ? formatTime12(leg.time, locale) : ''].filter(Boolean).join(' · ');
  return [bits.join(' · '), when].filter(Boolean).map(esc).join(' — ');
}

/** Build the full report document (pure; unit-testable). */
export function buildTripReportHtml(d: ReportData): string {
  const { trip, board, members, finance, media, locale, t } = d;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const cur = trip.currency || 'SAR';
  const money = (n: number) => formatCurrency(n, cur, locale);
  const active = members.filter((m) => m.status === 'ACTIVE');
  const nameOf = (uid: string) => active.find((m) => m.uid === uid)?.displayName ?? members.find((m) => m.uid === uid)?.displayName ?? uid;
  const range = trip.dateTo ? `${formatDate(trip.dateFrom, locale)} – ${formatDate(trip.dateTo, locale)}` : formatDate(trip.dateFrom, locale);
  const cities = board.cities.map((c) => c.name).filter(Boolean);

  // ---- Itinerary ---------------------------------------------------------
  const itinerary = board.cities.map((c) => {
    const dates = c.dateFrom ? `${formatDate(c.dateFrom, locale)}${c.dateTo ? ` – ${formatDate(c.dateTo, locale)}` : ''}` : '';
    const stays = (c.stays ?? []).map((s) => `<li>${esc(s.name)}${s.note ? ` <span class="muted">— ${esc(s.note)}</span>` : ''}</li>`).join('')
      || (c.hotel ? `<li>${esc(c.hotel)}</li>` : '');
    const transport: string[] = [];
    if (c.flightOut) transport.push(`<li>✈️ ${legLine(c.flightOut, locale)}</li>`);
    if (c.flightReturn) transport.push(`<li>✈️ ${legLine(c.flightReturn, locale)}</li>`);
    for (const l of c.legs ?? []) transport.push(`<li>✈️ ${legLine(l, locale)}</li>`);
    if (c.car) transport.push(`<li>🚗 ${c.carKind ? esc(t(`itinerary.carKind.${c.carKind}`)) + ' · ' : ''}${legLine(c.car, locale)}</li>`);
    if (c.cruise) transport.push(`<li>🚢 ${legLine(c.cruise, locale)}</li>`);
    const days = c.days.map((day, i) => {
      const acts = [...day.activities].sort((a, b) => activitySortKey(a).localeCompare(activitySortKey(b)));
      const rows = acts.map((a) => {
        const when = a.time ? formatTime12(a.time, locale) : (a.period ? t(`itinerary.period.${a.period}`) : '');
        return `<tr><td class="when">${esc(when)}</td><td>${a.kind ? `<span class="tag">${esc(t(`itinerary.kind.${a.kind}`))}</span> ` : ''}<strong>${esc(a.title)}</strong>${a.note ? `<div class="muted">${esc(a.note)}</div>` : ''}</td><td class="num">${a.cost ? esc(money(a.cost)) : ''}</td></tr>`;
      }).join('');
      const label = day.date ? formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'short' }) : '';
      return `<div class="day"><h4>${esc(t('memories.dayN', { n: i + 1 }))}${label ? ` <span class="muted">· ${esc(label)}</span>` : ''}</h4>${rows ? `<table>${rows}</table>` : `<p class="muted">${esc(t('itinerary.noActivities'))}</p>`}</div>`;
    }).join('');
    return `<section class="city"><h3>${esc(c.name)}${dates ? ` <span class="muted">· ${esc(dates)}</span>` : ''}</h3>
      ${stays ? `<p class="lbl">🏨 ${esc(t('itinerary.stays'))}</p><ul>${stays}</ul>` : ''}
      ${transport.length ? `<p class="lbl">${esc(t('tripDetail.tabTravel'))}</p><ul>${transport.join('')}</ul>` : ''}
      ${days}</section>`;
  }).join('');

  // ---- Expenses -----------------------------------------------------------
  let expenses = `<p class="muted">${esc(t('expenses.noGroup'))}</p>`;
  if (finance) {
    const uids = active.map((m) => m.uid);
    const groupTotal = finance.group.reduce((a, e) => a + e.amount, 0);
    const sideTotal = finance.sides.reduce((a, s) => a + s.total, 0);
    const grand = groupTotal + sideTotal;
    const perHead = uids.length ? grand / uids.length : 0;
    const nets = netByMember(finance, uids);
    const transfers = settlements(nets);
    const dist = distribution(finance.group);

    const groupRows = finance.group.map((e) =>
      `<tr><td>${esc(e.desc)}</td><td><span class="tag">${esc(t(`expenses.cat.${e.category}`))}</span></td><td>${esc(nameOf(e.payerUid))}</td><td class="num">${esc(money(e.amount))}</td></tr>`).join('');
    const sideRows = finance.sides.map((s) =>
      `<tr><td>${esc(s.title)}${s.settled ? ` <span class="tag ok">${esc(t('expenses.settled'))}</span>` : ''}</td><td>${s.participantUids.map(nameOf).map(esc).join('، ')}</td><td>${esc(nameOf(s.payerUid))}</td><td class="num">${esc(money(s.total))}</td></tr>`).join('');
    const netRows = uids.map((u) => {
      const v = nets[u] ?? 0;
      const settled = Math.abs(v) < 0.005;
      const cls = settled ? 'ok' : v > 0 ? 'pos' : 'neg';
      const txt = settled ? t('expenses.settledUp') : `${v > 0 ? t('expenses.owedShort') : t('expenses.owesShort')} ${money(Math.abs(v))}`;
      return `<tr><td>${esc(nameOf(u))}</td><td class="num ${cls}">${esc(txt)}</td></tr>`;
    }).join('');
    const transferRows = transfers.length
      ? transfers.map((tr) => `<tr><td>${esc(nameOf(tr.from))}</td><td class="muted">${esc(t('expenses.paysTo'))}</td><td>${esc(nameOf(tr.to))}</td><td class="num">${esc(money(tr.amount))}</td></tr>`).join('')
      : `<tr><td colspan="4" class="muted">${esc(t('expenses.allSettled'))}</td></tr>`;
    const distRows = (Object.keys(dist) as (keyof typeof dist)[]).filter((k) => dist[k] > 0)
      .map((k) => `<tr><td>${esc(t(`expenses.cat.${k}`))}</td><td class="num">${esc(money(dist[k]))}</td></tr>`).join('');

    expenses = `
      <div class="stats">
        <div class="stat"><span>${esc(t('expenses.groupSpend'))}</span><strong>${esc(money(groupTotal))}</strong></div>
        <div class="stat"><span>${esc(t('expenses.sideSpend'))}</span><strong>${esc(money(sideTotal))}</strong></div>
        <div class="stat"><span>${esc(t('expenses.grandTotal'))}</span><strong>${esc(money(grand))}</strong></div>
        <div class="stat"><span>${esc(t('expenses.perHead'))}</span><strong>${esc(money(perHead))}</strong></div>
      </div>
      ${groupRows ? `<h4>${esc(t('expenses.groupLog'))}</h4><table class="grid"><thead><tr><th>${esc(t('expenses.desc'))}</th><th>${esc(t('expenses.category'))}</th><th>${esc(t('expenses.payer'))}</th><th class="num">${esc(t('expenses.amount'))}</th></tr></thead><tbody>${groupRows}</tbody></table>` : ''}
      ${sideRows ? `<h4>${esc(t('expenses.side'))}</h4><table class="grid"><thead><tr><th>${esc(t('expenses.sideTitle'))}</th><th>${esc(t('expenses.participants'))}</th><th>${esc(t('expenses.payer'))}</th><th class="num">${esc(t('expenses.amount'))}</th></tr></thead><tbody>${sideRows}</tbody></table>` : ''}
      ${distRows ? `<h4>${esc(t('expenses.distribution'))}</h4><table class="grid half"><tbody>${distRows}</tbody></table>` : ''}
      <h4>${esc(t('expenses.perPerson'))}</h4><table class="grid half"><tbody>${netRows}</tbody></table>
      <h4>${esc(t('expenses.whoPaysWhom'))}</h4><table class="grid"><tbody>${transferRows}</tbody></table>`;
  }

  // ---- Memories -----------------------------------------------------------
  const images = media.filter((m) => m.type === 'image' && m.src);
  const videos = media.filter((m) => m.type === 'video');
  const byDay = new Map<string, Media[]>();
  for (const m of images) { const k = m.day || '—'; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k)!.push(m); }
  const memories = images.length === 0 && videos.length === 0
    ? `<p class="muted">${esc(t('memories.empty'))}</p>`
    : [...byDay.entries()].map(([day, items]) =>
        `<h4>${esc(day)}</h4><div class="photos">${items.map((m) => `<figure><img src="${esc(m.src)}" alt="${esc(m.name)}" loading="lazy">${m.place ? `<figcaption>${esc(m.place)}</figcaption>` : ''}</figure>`).join('')}</div>`).join('')
      + (videos.length ? `<p class="muted">🎬 ${esc(t('memories.videosNotIncluded', { count: videos.length }))}</p>` : '');

  // ---- Document -------------------------------------------------------------
  const generated = formatDate(new Date(), locale, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t('memories.report'))} — ${esc(trip.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Noto Kufi Arabic","IBM Plex Sans Arabic","Segoe UI",system-ui,-apple-system,sans-serif; color: #14213d; background: #f6f7fb; line-height: 1.5; }
  .bar { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 10px 16px; background: #14213d; color: #fff; }
  .bar button { font: inherit; font-weight: 700; border: 0; border-radius: 10px; padding: 10px 16px; cursor: pointer; background: #f26b3a; color: #fff; }
  .bar button.ghost { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.5); }
  .sheet { max-width: 820px; margin: 0 auto; padding: 20px 16px 60px; }
  .hero { background: linear-gradient(135deg,#14213d,${trip.domestic ? '#1f6a52' : '#2a5a8c'}); color: #fff; border-radius: 18px; padding: 22px 20px; margin-bottom: 18px; }
  .hero h1 { margin: 6px 0 8px; font-size: 26px; }
  .hero .badge { display: inline-block; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,.18); }
  .hero p { margin: 0; opacity: .9; font-size: 14px; }
  h2 { font-size: 20px; margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #f26b3a; break-after: avoid; }
  h3 { font-size: 17px; margin: 18px 0 6px; break-after: avoid; }
  h4 { font-size: 14px; margin: 14px 0 6px; color: #3a4a6b; break-after: avoid; }
  .lbl { margin: 8px 0 2px; font-weight: 700; font-size: 13px; color: #3a4a6b; }
  .muted { color: #6b7590; font-weight: 400; font-size: 13px; }
  ul { margin: 2px 0 8px; padding-inline-start: 20px; }
  .city, .block { background: #fff; border: 1px solid #e3e6ef; border-radius: 14px; padding: 14px 16px; margin: 10px 0; break-inside: avoid; }
  .day { margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  td, th { padding: 7px 8px; border-bottom: 1px solid #edf0f6; vertical-align: top; text-align: start; }
  th { font-size: 12px; color: #6b7590; font-weight: 700; }
  td.when { white-space: nowrap; color: #3a4a6b; width: 1%; }
  .num { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .grid.half { max-width: 460px; }
  .tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: #eef1f8; color: #3a4a6b; }
  .tag.ok { background: #e3f6ec; color: #1f6a52; }
  .pos { color: #1f6a52; font-weight: 700; } .neg { color: #b4232c; font-weight: 700; } .ok { color: #1f6a52; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 8px 0 4px; }
  .stat { background: #fff; border: 1px solid #e3e6ef; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
  .stat span { font-size: 12px; color: #6b7590; } .stat strong { font-size: 17px; }
  .members { display: flex; flex-wrap: wrap; gap: 8px; }
  .members span { background: #fff; border: 1px solid #e3e6ef; border-radius: 999px; padding: 5px 12px; font-size: 13px; }
  .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  figure { margin: 0; break-inside: avoid; } figure img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; display: block; }
  figcaption { font-size: 11px; color: #6b7590; margin-top: 3px; }
  footer { margin-top: 30px; font-size: 12px; color: #6b7590; text-align: center; }
  @media print {
    body { background: #fff; } .bar { display: none; } .sheet { max-width: none; padding: 0; }
    .city, .block, .stat, .members span { border-color: #ccd; }
    @page { margin: 14mm; }
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
    <span class="badge">${esc(t(trip.domestic ? 'trips.domestic' : 'trips.international'))}</span>
    <h1>${esc(trip.title)}</h1>
    <p>📍 ${esc(cities.join('، ') || '—')} &nbsp;·&nbsp; 📅 ${esc(range)} &nbsp;·&nbsp; 👥 ${esc(t('tripDetail.memberCount', { count: active.length }))}</p>
  </header>

  <h2>${esc(t('tripDetail.tabMembers'))}</h2>
  <div class="members">${active.map((m) => `<span>${esc(m.displayName)}${m.role === 'OWNER' ? ' ★' : ''}</span>`).join('') || `<span class="muted">—</span>`}</div>

  <h2>${esc(t('tripDetail.tabItinerary'))}</h2>
  ${itinerary || `<p class="muted">—</p>`}

  <h2>${esc(t('tripDetail.tabExpenses'))}</h2>
  <div class="block">${expenses}</div>

  <h2>${esc(t('tripDetail.tabMemories'))}</h2>
  ${memories}

  <footer>${esc(t('memories.reportGenerated', { date: generated }))} · BoardingPass</footer>
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
