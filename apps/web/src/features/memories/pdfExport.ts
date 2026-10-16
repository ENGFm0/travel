// On-device PDF export for the trip report.
//
// Printing the report from mobile Safari produces a PDF with no hyperlinks and
// with below-the-fold images missing, so we build the PDF ourselves: the
// report HTML is laid out in a hidden same-origin iframe at phone width, waited
// on (fonts + every image decoded), rasterised with html2canvas in modest
// chunks, sliced into booklet pages at "smart" cut points that never run
// through a card / row / photo, and written with jsPDF — with a real link
// annotation for every place <a> so they open Google Maps from the PDF.
//
// The PDF is fully self-contained (it may be forwarded to people who have no
// access to the app): after the report pages comes an ALBUM — every photo on
// its own page at full size — and each thumbnail in the memories grid is an
// internal link that jumps to its album page (and the album page's header
// links back). No URL in the PDF points at the app.
//
// Memory: iOS Safari has a hard cap on live canvas memory and silently returns
// blank canvases past it. Chunks are streamed: each chunk is rasterised, drawn
// into the page canvases it overlaps, finished pages are flushed to the PDF,
// and the chunk canvas is released before the next one is rendered.
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
const FONT = '"Noto Kufi Arabic","IBM Plex Sans Arabic","Segoe UI",system-ui,-apple-system,sans-serif';

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
interface Photo extends Rect { src: string; title: string; caption: string }

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

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

interface Box { x: number; y: number; w: number; h: number }

async function loadImage(src: string): Promise<{ img: HTMLImageElement; ok: boolean }> {
  const img = new Image();
  img.decoding = 'async';
  if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
  img.src = src;
  try { await img.decode(); return { img, ok: img.naturalWidth > 0 }; } catch { return { img, ok: false }; }
}

/** Bytes for embedding the photo as its own PDF image object (original JPEG
 *  bytes when we have them — no re-encoding; otherwise a JPEG of the bitmap). */
function photoBytes(img: HTMLImageElement, src: string): { data: string; fmt: 'JPEG' | 'PNG' } {
  if (/^data:image\/jpe?g[;,]/i.test(src)) return { data: src, fmt: 'JPEG' };
  if (/^data:image\/png[;,]/i.test(src)) return { data: src, fmt: 'PNG' };
  const max = 2000;
  const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * r));
  c.height = Math.max(1, Math.round(img.naturalHeight * r));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.92); // throws on a tainted canvas → caller falls back
  freeCanvas(c);
  return { data, fmt: 'JPEG' };
}

/** Draw an album page's chrome: header (title + counter), caption, and return
 *  the box where the photo goes. The photo itself is embedded as a separate
 *  PDF image object (so viewers can offer copy/share/save on it) and is only
 *  painted into this canvas afterwards for the in-app preview. */
function drawAlbumChrome(p: Photo, index: number, count: number, rtl: boolean, pageW: number, pageH: number, s: number, iw: number, ih: number): { c: HTMLCanvasElement; box: Box } {
  const c = document.createElement('canvas');
  c.width = pageW; c.height = pageH;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pageW, pageH);
  const px = (n: number) => n * s;
  const padX = px(16);
  const startX = rtl ? pageW - padX : padX;
  try { (ctx as CanvasRenderingContext2D & { direction: string }).direction = rtl ? 'rtl' : 'ltr'; } catch { /* older engines */ }
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.textBaseline = 'middle';

  // Header band
  ctx.fillStyle = '#14213d';
  ctx.fillRect(0, 0, pageW, px(46));
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${px(14)}px ${FONT}`;
  ctx.fillText(p.title, startX, px(23), pageW - padX * 2 - px(70));
  // Counter is digits + slash: draw it LTR so bidi doesn't reorder "1 / 11".
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = `${px(11)}px ${FONT}`;
  try { (ctx as CanvasRenderingContext2D & { direction: string }).direction = 'ltr'; } catch { /* ignore */ }
  ctx.textAlign = rtl ? 'left' : 'right';
  ctx.fillText(`${index + 1} / ${count}`, rtl ? padX : pageW - padX, px(23));
  try { (ctx as CanvasRenderingContext2D & { direction: string }).direction = rtl ? 'rtl' : 'ltr'; } catch { /* ignore */ }
  ctx.textAlign = rtl ? 'right' : 'left';

  // Photo box, fitted (contain) in the content area; a soft frame behind it.
  const top = px(58), bottomPad = px(54);
  const boxW = pageW - padX * 2, boxH = pageH - top - bottomPad;
  const r = Math.min(boxW / iw, boxH / ih);
  const w = Math.max(1, Math.round(iw * r)), h = Math.max(1, Math.round(ih * r));
  const x = Math.round((pageW - w) / 2), y = Math.round(top + (boxH - h) / 2);
  ctx.fillStyle = '#eef1f8';
  roundRectPath(ctx, x - px(4), y - px(4), w + px(8), h + px(8), px(10));
  ctx.fill();

  // Caption
  ctx.fillStyle = '#3a4a6b';
  ctx.font = `${px(12)}px ${FONT}`;
  ctx.fillText(p.caption, startX, pageH - px(30), pageW - padX * 2);
  return { c, box: { x, y, w, h } };
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
    const rtl = (doc.documentElement.getAttribute('dir') || '').toLowerCase() === 'rtl';
    // PDF mode: hide the sticky bar, pin the sheet to the page width, drop
    // shadows, uniform 2-column photo grid.
    const st = doc.createElement('style');
    st.textContent = `html,body{background:#fff!important;margin:0;overflow:visible}
      .bar,.lb{display:none!important}
      .sheet{max-width:none!important;width:${PAGE_W}px;padding:0 14px 10px!important;margin:0!important}
      .hero,.card,.tile,.city,.settle,.member{box-shadow:none!important}
      .timeline{overflow:visible!important;flex-wrap:wrap}
      .photos{grid-template-columns:repeat(2,1fr)!important;grid-auto-rows:176px!important;gap:8px!important}
      figure.big{grid-column:auto!important;grid-row:auto!important}
      figure{border-radius:12px;overflow:hidden;background-size:cover;background-position:center;background-repeat:no-repeat}`;
    doc.head.appendChild(st);
    await waitReady(doc);
    // html2canvas ignores object-fit and would stretch photos to the cell; paint
    // each photo as a cover-cropped background on its <figure> instead (the
    // <img> stays, invisible, so links/layout are unchanged).
    doc.querySelectorAll<HTMLImageElement>('figure img').forEach((img) => {
      const fig = img.closest('figure') as HTMLElement | null;
      if (!fig || (!img.currentSrc && !img.src)) return;
      fig.style.backgroundImage = `url("${(img.currentSrc || img.src).replace(/"/g, '%22')}")`;
      img.style.visibility = 'hidden';
    });

    const sheet = doc.querySelector('.sheet') as HTMLElement;
    const origin = sheet.getBoundingClientRect();
    const total = Math.ceil(sheet.scrollHeight);
    const atoms = Array.from(sheet.querySelectorAll(ATOMS)).map((el) => rectIn(el, origin));
    const headings = Array.from(sheet.querySelectorAll(KEEP_WITH_NEXT)).map((el) => rectIn(el, origin));
    // External links (places → Google Maps). Internal '#' anchors are handled
    // as album links below.
    const links = Array.from(sheet.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .filter((a) => !(a.getAttribute('href') || '').startsWith('#'))
      .map((a) => ({ href: a.href, ...rectIn(a, origin) }))
      .filter((l) => l.width > 0 && l.bottom > l.top);
    // Photos → album pages (one per photo, in document order).
    const photos: Photo[] = Array.from(sheet.querySelectorAll<HTMLElement>('figure')).flatMap((fig) => {
      const img = fig.querySelector('img');
      const src = img?.currentSrc || img?.src || '';
      if (!src) return [];
      const grid = fig.closest('.photos');
      const dayEl = grid?.previousElementSibling;
      const title = (dayEl?.classList.contains('ph-day') ? dayEl.textContent : '')?.replace(/\s+/g, ' ').trim() || '';
      const caption = (fig.querySelector('figcaption')?.textContent || '').trim();
      return [{ src, title, caption, ...rectIn(fig, origin) }];
    });

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
    const outScale = Math.min(TARGET_SCALE, Math.sqrt(MAX_CANVAS_PX / (PAGE_W * Math.min(tallest, PAGE_H))));

    // Paginate up front (pure DOM measurements).
    const strips: Strip[] = [];
    let y = 0;
    while (y < total - 1) {
      const b = keepHeadingsWithNext(y, chooseCut(y, y + CONTENT_H, atoms, total), headings, total);
      strips.push({ a: y, b });
      y = b;
    }
    const totalPages = strips.length + photos.length;
    const pageOf = (top: number) => Math.max(0, strips.findIndex((s) => top >= s.a && top < s.b));

    const pdf = new jsPDF({ unit: 'mm', format: [PAGE_W_MM, PAGE_H_MM], compress: true });
    const mm = PAGE_W_MM / PAGE_W; // mm per CSS px
    const pageW = Math.round(PAGE_W * outScale), pageH = Math.round(PAGE_H * outScale);
    const pageImages: string[] = [];
    const live = new Map<number, HTMLCanvasElement>(); // page index → canvas in progress
    let nextToFlush = 0;

    const pageNumber = (i: number) => {
      pdf.setFontSize(7); pdf.setTextColor(150);
      pdf.text(`${i + 1} / ${totalPages}`, PAGE_W_MM / 2, PAGE_H_MM - 3.5, { align: 'center' });
    };
    const emit = (c: HTMLCanvasElement, i: number) => {
      if (i > 0) pdf.addPage();
      const dataUrl = c.toDataURL('image/jpeg', JPEG_QUALITY);
      pageImages.push(dataUrl);
      pdf.addImage(dataUrl, 'JPEG', 0, 0, PAGE_W_MM, PAGE_H_MM, undefined, 'FAST');
      pageNumber(i);
    };
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
      emit(c, i);
      // External links (maps) on this page.
      for (const l of links) {
        const top = Math.max(l.top, a), bottom = Math.min(l.bottom, b);
        if (bottom - top < 4) continue;
        pdf.link(l.left * mm, (MARGIN_Y + (top - a)) * mm, l.width * mm, (bottom - top) * mm, { url: l.href });
      }
      // Thumbnails → their album page (internal link).
      photos.forEach((p, pi) => {
        const top = Math.max(p.top, a), bottom = Math.min(p.bottom, b);
        if (bottom - top < 4) return;
        pdf.link(p.left * mm, (MARGIN_Y + (top - a)) * mm, p.width * mm, (bottom - top) * mm, { pageNumber: strips.length + pi + 1 });
      });
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
      while (nextToFlush < strips.length && strips[nextToFlush].b <= cBottom + 0.5) flush(nextToFlush++);
      opts.onProgress?.(0.1 + 0.6 * ((gi + 1) / groups.length));
    }
    while (nextToFlush < strips.length) flush(nextToFlush++);

    // Album: one full-size page per photo. The chrome is a page raster; the
    // photo is embedded as its OWN image object (original bytes) so PDF viewers
    // treat it as an image (copy / share / save) and it keeps full quality.
    const mmPx = PAGE_W_MM / pageW; // mm per device px
    for (let pi = 0; pi < photos.length; pi++) {
      const p = photos[pi];
      const { img, ok } = await loadImage(p.src);
      const iw = ok ? img.naturalWidth : 4, ih = ok ? img.naturalHeight : 3;
      const { c, box } = drawAlbumChrome(p, pi, photos.length, rtl, pageW, pageH, outScale, iw, ih);
      const idx = strips.length + pi;
      if (idx > 0) pdf.addPage();
      pdf.addImage(c.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, PAGE_W_MM, PAGE_H_MM, undefined, 'FAST');
      let embedded = false;
      if (ok) {
        try {
          const b = photoBytes(img, p.src);
          pdf.addImage(b.data, b.fmt, box.x * mmPx, box.y * mmPx, box.w * mmPx, box.h * mmPx, undefined, 'FAST');
          embedded = true;
        } catch { /* tainted / undecodable → baked into the page raster below */ }
      }
      // Paint the photo into the canvas for the in-app preview (and as the
      // on-page fallback when it couldn't be embedded separately).
      const ctx = c.getContext('2d')!;
      if (ok) ctx.drawImage(img, box.x, box.y, box.w, box.h);
      if (!embedded) pdf.addImage(c.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, PAGE_W_MM, PAGE_H_MM, undefined, 'FAST');
      pageNumber(idx);
      pdf.link(0, 0, PAGE_W_MM, 46 * mm, { pageNumber: pageOf(p.top) + 1 });
      pageImages.push(c.toDataURL('image/jpeg', JPEG_QUALITY));
      opts.onPage?.(c, idx);
      freeCanvas(c);
      opts.onProgress?.(0.7 + 0.3 * ((pi + 1) / photos.length));
    }
    opts.onProgress?.(1);

    return { blob: pdf.output('blob'), pages: totalPages, pageImages };
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
