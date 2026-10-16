// On-device PDF export for the trip report.
//
// Printing the report from mobile Safari produces a PDF with no hyperlinks and
// with below-the-fold images missing, so we build the PDF ourselves: the
// report HTML is laid out in a hidden same-origin iframe at phone width, waited
// on (fonts + every image decoded), rasterised with html2canvas in modest
// chunks, sliced into booklet pages at "smart" cut points that never run
// through a card / row / photo, and written with jsPDF — with a real link
// annotation for every <a> so places open Google Maps straight from the PDF.
//
// Memory: iOS Safari has a hard cap on live canvas memory and silently returns
// blank canvases past it (which showed up as "photos missing" at the end of
// long reports). So chunks are streamed: each chunk is rasterised, drawn into
// the page canvases it overlaps, finished pages are flushed to the PDF, and the
// chunk canvas is released before the next one is rendered. At most one chunk
// and two pages are alive at a time.
//
// jspdf + html2canvas are imported lazily (only when the user exports).

export interface PdfExportResult {
  blob: Blob;
  pages: number;
  /** JPEG data URL per page — for the in-app preview before saving. */
  pageImages: string[];
}
export interface PdfExportOpts {
  /** Progress 0..1 (coarse). */
  onProgress?: (p: number) => void;
  /** Debug hook: receives each finished page canvas. */
  onPage?: (canvas: HTMLCanvasElement, index: number) => void;
}

// Page: a 5×8 in "booklet" (phone-like 1.6 ratio) laid out at a mobile CSS
// width, so the report keeps its responsive single-column design and reads
// 1:1 on a phone instead of a shrunken desktop A4.
const PAGE_W_MM = 127, PAGE_H_MM = 203.2;
const PAGE_W = 480;                 // CSS px — the report's phone layout
const PAGE_H = Math.round(PAGE_W * (PAGE_H_MM / PAGE_W_MM)); // 768
const MARGIN_Y = 22;                // top/bottom page margin (CSS px)
const CONTENT_H = PAGE_H - MARGIN_Y * 2;
const MIN_CUT_ADVANCE = 40;         // never produce a strip shorter than this (except the last)
const CHUNK_TARGET = 1200;          // raster chunk height (CSS px) — small, to stay far below iOS canvas limits
const MAX_CANVAS_PX = 8_000_000;    // per-canvas budget (iOS caps ~16.7M px; stay well under)
const TARGET_SCALE = 3;             // ~290 dpi on the 127mm page
const JPEG_QUALITY = 0.92;

/** Elements that must never be cut by a page break (if they fit on a page). */
const ATOMS = [
  '.hero', '.tile', '.card', '.settle', '.member', '.allok', '.kpi', '.tl-city',
  '.city-h', '.chips', '.day-h', '.act', '.transport li', 'tr', 'figure', '.hb', '.db',
  '.legend li', 'h2', 'h3', 'h4', '.hint', '.ph-day', 'footer',
].join(',');

/** Headings that must stay with what follows them (never last on a page). */
const KEEP_WITH_NEXT = 'h2, h3, h4, .ph-day, .day-h, .city-h';

interface Rect { top: number; bottom: number; left: number; width: number }
interface Strip { a: number; b: number }

async function waitReady(doc: Document): Promise<void> {
  try { await (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* ignore */ }
  const imgs = Array.from(doc.images);
  await Promise.all(imgs.map(async (img) => {
    if (!img.complete) await new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); });
    try { await img.decode(); } catch { /* broken image — leave it */ }
  }));
  // Two frames so layout settles after fonts/images.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function rectIn(el: Element, origin: DOMRect): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top - origin.top, bottom: r.bottom - origin.top, left: r.left - origin.left, width: r.width };
}

/** Choose where to end the current page: the furthest position ≤ `target` that
 *  doesn't fall strictly inside any atom that could fit on a page. */
function chooseCut(y: number, target: number, atoms: Rect[], total: number): number {
  if (target >= total) return total;
  const blocking = atoms.filter((a) => a.bottom - a.top <= CONTENT_H && a.top < target && a.bottom > target);
  if (blocking.length === 0) return target;
  let best = y;
  for (const a of atoms) {
    const h = a.bottom - a.top;
    if (h > CONTENT_H) continue;
    for (const cand of [a.top, a.bottom]) {
      if (cand <= y + MIN_CUT_ADVANCE || cand > target) continue;
      const inside = atoms.some((b) => b.bottom - b.top <= CONTENT_H && b.top < cand && b.bottom > cand);
      if (!inside && cand > best) best = cand;
    }
  }
  return best > y + MIN_CUT_ADVANCE ? best : target; // forced cut when nothing fits
}

/** Pull a cut back above any heading that would otherwise end the page. */
function keepHeadingsWithNext(y: number, cut: number, headings: Rect[], total: number): number {
  if (cut >= total) return cut;
  for (let guard = 0; guard < 4; guard++) {
    const h = headings.find((r) => r.bottom <= cut && r.top > y + MIN_CUT_ADVANCE && cut - r.bottom < 36);
    if (!h) break;
    cut = h.top;
  }
  return cut;
}

/** Release a canvas's backing store immediately (GC on iOS is too lazy). */
function freeCanvas(c: HTMLCanvasElement): void {
  c.width = 0; c.height = 0;
}

export async function renderReportPdf(html: string, opts: PdfExportOpts = {}): Promise<PdfExportResult> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  opts.onProgress?.(0.05);

  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    position: 'fixed', left: '0', top: '0', width: `${PAGE_W}px`, height: `${PAGE_H}px`,
    border: '0', opacity: '0', pointerEvents: 'none', zIndex: '-1',
  });
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    // PDF mode: hide the sticky bar, pin the sheet to the page width, drop
    // shadows, uniform photo grid.
    const st = doc.createElement('style');
    st.textContent = `html,body{background:#fff!important;margin:0;overflow:visible}
      .bar{display:none!important}
      .sheet{max-width:none!important;width:${PAGE_W}px;padding:0 14px 10px!important;margin:0!important}
      .hero,.card,.tile,.city,.settle,.member{box-shadow:none!important}
      .timeline{overflow:visible!important;flex-wrap:wrap}
      .photos{grid-template-columns:repeat(3,1fr)!important;grid-auto-rows:148px!important}
      figure.big{grid-column:auto!important;grid-row:auto!important}`;
    doc.head.appendChild(st);
    await waitReady(doc);

    const sheet = doc.querySelector('.sheet') as HTMLElement;
    const origin = sheet.getBoundingClientRect();
    const total = Math.ceil(sheet.scrollHeight);
    const atoms = Array.from(sheet.querySelectorAll(ATOMS)).map((el) => rectIn(el, origin));
    const headings = Array.from(sheet.querySelectorAll(KEEP_WITH_NEXT)).map((el) => rectIn(el, origin));
    const links = Array.from(sheet.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((a) => ({ href: a.href, ...rectIn(a, origin) }))
      .filter((l) => l.width > 0 && l.bottom > l.top);

    // Group consecutive top-level blocks into chunks of ~CHUNK_TARGET px by
    // wrapping them in plain divs (no visual change in a block container).
    const children = Array.from(sheet.children) as HTMLElement[];
    const groups: HTMLElement[] = [];
    let wrap: HTMLElement | null = null;
    let wrapTop = 0;
    for (const ch of children) {
      const r = rectIn(ch, origin);
      if (!wrap || r.bottom - wrapTop > CHUNK_TARGET) {
        wrap = doc.createElement('div');
        sheet.insertBefore(wrap, ch);
        groups.push(wrap);
        wrapTop = r.top;
      }
      wrap.appendChild(ch);
    }
    const groupRects = groups.map((g) => rectIn(g, origin));
    const tallest = Math.max(1, ...groupRects.map((r) => r.bottom - r.top));
    // One output scale for every page; chunks taller than the budget allows
    // render softer rather than failing.
    const outScale = Math.min(TARGET_SCALE, Math.sqrt(MAX_CANVAS_PX / (PAGE_W * Math.min(tallest, PAGE_H))));

    // Paginate up front (pure DOM measurements).
    const strips: Strip[] = [];
    let y = 0;
    while (y < total - 1) {
      const b = keepHeadingsWithNext(y, chooseCut(y, y + CONTENT_H, atoms, total), headings, total);
      strips.push({ a: y, b });
      y = b;
    }

    const pdf = new jsPDF({ unit: 'mm', format: [PAGE_W_MM, PAGE_H_MM], compress: true });
    const mm = PAGE_W_MM / PAGE_W; // mm per CSS px
    const pageW = Math.round(PAGE_W * outScale), pageH = Math.round(PAGE_H * outScale);
    const pageImages: string[] = [];
    const live = new Map<number, HTMLCanvasElement>(); // page index → canvas in progress
    let nextToFlush = 0;

    const pageCanvas = (i: number): HTMLCanvasElement => {
      let c = live.get(i);
      if (!c) {
        c = document.createElement('canvas');
        c.width = pageW; c.height = pageH;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pageW, pageH);
        live.set(i, c);
      }
      return c;
    };
    const flush = (i: number) => {
      const c = pageCanvas(i);
      const { a, b } = strips[i];
      if (i > 0) pdf.addPage();
      const dataUrl = c.toDataURL('image/jpeg', JPEG_QUALITY);
      pageImages.push(dataUrl);
      pdf.addImage(dataUrl, 'JPEG', 0, 0, PAGE_W_MM, PAGE_H_MM, undefined, 'FAST');
      // Page number (digits only — the default font has no Arabic).
      pdf.setFontSize(7); pdf.setTextColor(150);
      pdf.text(`${i + 1} / ${strips.length}`, PAGE_W_MM / 2, PAGE_H_MM - 3.5, { align: 'center' });
      // Link annotations for anchors on this page.
      for (const l of links) {
        const top = Math.max(l.top, a), bottom = Math.min(l.bottom, b);
        if (bottom - top < 4) continue;
        pdf.link(l.left * mm, (MARGIN_Y + (top - a)) * mm, l.width * mm, (bottom - top) * mm, { url: l.href });
      }
      opts.onPage?.(c, i);
      freeCanvas(c);
      live.delete(i);
    };

    for (let gi = 0; gi < groups.length; gi++) {
      const r = groupRects[gi];
      const h = Math.max(1, Math.ceil(r.bottom - r.top));
      const scale = Math.min(outScale, Math.sqrt(MAX_CANVAS_PX / (PAGE_W * h)));
      const chunk = await html2canvas(groups[gi], {
        scale, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false,
        windowWidth: PAGE_W, scrollX: 0, scrollY: 0,
      });
      const cTop = r.top, cBottom = r.top + h;
      // Draw this chunk into every page it overlaps.
      for (let i = nextToFlush; i < strips.length; i++) {
        const { a, b } = strips[i];
        if (a >= cBottom) break;
        const from = Math.max(a, cTop), to = Math.min(b, cBottom);
        if (to <= from) continue;
        const ctx = pageCanvas(i).getContext('2d')!;
        const sy = (from - cTop) * scale, sh = (to - from) * scale;
        const dy = (MARGIN_Y + (from - a)) * outScale, dh = (to - from) * outScale;
        ctx.drawImage(chunk, 0, sy, chunk.width, sh, 0, dy, pageW, dh);
      }
      freeCanvas(chunk);
      // Flush every page that is now fully covered.
      while (nextToFlush < strips.length && strips[nextToFlush].b <= cBottom + 0.5) flush(nextToFlush++);
      opts.onProgress?.(0.1 + 0.85 * ((gi + 1) / groups.length));
    }
    while (nextToFlush < strips.length) flush(nextToFlush++);
    opts.onProgress?.(1);

    return { blob: pdf.output('blob'), pages: strips.length, pageImages };
  } finally {
    iframe.remove();
  }
}

/** Hand the PDF to the user: the native share sheet when files are shareable
 *  (iOS/Android → "Save to Files", AirDrop, WhatsApp…), else a download. */
export async function saveOrSharePdf(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: filename }); return; }
    catch (e) { if ((e as Error).name === 'AbortError') return; /* else fall through to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
