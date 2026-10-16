// On-device PDF export for the trip report.
//
// Printing the report from mobile Safari produces a PDF with no hyperlinks and
// with below-the-fold images missing, so we build the PDF ourselves: the
// report HTML is laid out in a hidden same-origin iframe at A4 width, waited on
// (fonts + every image decoded), rasterised with html2canvas in a few tall
// chunks, sliced into A4 pages at "smart" cut points that never run through a
// card / row / photo, and written with jsPDF — with a real link annotation for
// every <a> so places open Google Maps straight from the PDF.
//
// jspdf + html2canvas are imported lazily (only when the user exports).

export interface PdfExportResult { blob: Blob; pages: number }
export interface PdfExportOpts {
  /** Progress 0..1 (coarse). */
  onProgress?: (p: number) => void;
  /** Debug hook: receives each finished page canvas. */
  onPage?: (canvas: HTMLCanvasElement, index: number) => void;
}

const A4_W_MM = 210, A4_H_MM = 297;
const PAGE_W = 794;                 // A4 width in CSS px at 96dpi
const PAGE_H = Math.round(PAGE_W * (A4_H_MM / A4_W_MM)); // 1123
const MARGIN_Y = 34;                // top/bottom page margin (CSS px)
const CONTENT_H = PAGE_H - MARGIN_Y * 2;
const MIN_CUT_ADVANCE = 48;         // never produce a strip shorter than this (except the last)
const CHUNK_TARGET = 2400;          // raster chunk height (CSS px) — keeps canvases well under mobile limits
const MAX_CANVAS_PX = 14_000_000;   // iOS Safari caps canvases around 16.7M px

/** Elements that must never be cut by a page break (if they fit on a page). */
const ATOMS = [
  '.hero', '.tile', '.card', '.settle', '.member', '.allok', '.kpi', '.tl-city',
  '.city-h', '.chips', '.day-h', '.act', '.transport li', 'tr', 'figure', '.hb', '.db',
  '.legend li', 'h2', 'h3', 'h4', '.hint', '.ph-day', 'footer',
].join(',');

interface Rect { top: number; bottom: number; left: number; width: number }
interface Chunk { top: number; height: number; canvas: HTMLCanvasElement; scale: number }

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
  // Try the tops of the blocking atoms (and their ancestors' tops, which are also in `atoms`).
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
    // PDF mode: hide the sticky bar, pin the sheet to A4 width, drop shadows.
    const st = doc.createElement('style');
    st.textContent = `html,body{background:#fff!important;margin:0;overflow:visible}
      .bar{display:none!important}
      .sheet{max-width:none!important;width:${PAGE_W}px;padding:0 30px 12px!important;margin:0!important}
      .hero,.card,.tile,.city,.settle,.member{box-shadow:none!important}
      .timeline{overflow:visible!important;flex-wrap:wrap}`;
    doc.head.appendChild(st);
    await waitReady(doc);

    const sheet = doc.querySelector('.sheet') as HTMLElement;
    const origin = sheet.getBoundingClientRect();
    const total = Math.ceil(sheet.scrollHeight);
    const atoms = Array.from(sheet.querySelectorAll(ATOMS)).map((el) => rectIn(el, origin));
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

    const chunks: Chunk[] = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const r = rectIn(g, origin);
      const h = Math.max(1, Math.ceil(r.bottom - r.top));
      const scale = Math.min(2, Math.sqrt(MAX_CANVAS_PX / (PAGE_W * h)));
      const canvas = await html2canvas(g, {
        scale, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false,
        windowWidth: PAGE_W, scrollX: 0, scrollY: 0,
      });
      chunks.push({ top: r.top, height: h, canvas, scale });
      opts.onProgress?.(0.1 + 0.6 * ((i + 1) / groups.length));
    }

    // Paginate.
    const strips: { a: number; b: number }[] = [];
    let y = 0;
    while (y < total - 1) {
      const b = chooseCut(y, y + CONTENT_H, atoms, total);
      strips.push({ a: y, b });
      y = b;
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const mm = A4_W_MM / PAGE_W; // mm per CSS px
    const outScale = Math.max(...chunks.map((c) => c.scale));
    const page = document.createElement('canvas');
    page.width = Math.round(PAGE_W * outScale);
    page.height = Math.round(PAGE_H * outScale);
    const ctx = page.getContext('2d')!;

    strips.forEach(({ a, b }, i) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, page.width, page.height);
      for (const c of chunks) {
        const from = Math.max(a, c.top), to = Math.min(b, c.top + c.height);
        if (to <= from) continue;
        const sy = (from - c.top) * c.scale, sh = (to - from) * c.scale;
        const dy = (MARGIN_Y + (from - a)) * outScale, dh = (to - from) * outScale;
        ctx.drawImage(c.canvas, 0, sy, c.canvas.width, sh, 0, dy, page.width, dh);
      }
      if (i > 0) pdf.addPage();
      pdf.addImage(page.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, A4_W_MM, A4_H_MM, undefined, 'FAST');
      // Page number (digits only — the default font has no Arabic).
      pdf.setFontSize(8); pdf.setTextColor(150);
      pdf.text(`${i + 1} / ${strips.length}`, A4_W_MM / 2, A4_H_MM - 5, { align: 'center' });
      // Link annotations for anchors on this page.
      for (const l of links) {
        const top = Math.max(l.top, a), bottom = Math.min(l.bottom, b);
        if (bottom - top < 4) continue;
        pdf.link(l.left * mm, (MARGIN_Y + (top - a)) * mm, l.width * mm, (bottom - top) * mm, { url: l.href });
      }
      opts.onPage?.(page, i);
      opts.onProgress?.(0.7 + 0.3 * ((i + 1) / strips.length));
    });

    return { blob: pdf.output('blob'), pages: strips.length };
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
