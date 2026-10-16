// Client-side image downscale + JPEG re-encode to a data URL.
//
// Used as a graceful fallback when Firebase Storage isn't available yet (the
// project's default bucket hasn't been provisioned): images are compressed and
// stored inline (e.g. in the Firestore memory/receipt doc) so the feature works
// today, and seamlessly upgrades to real Storage uploads once the bucket exists.
// Firestore docs cap at ~1 MiB, so we keep the encoded result well under that.

export interface CompressOpts {
  /** Longest-edge cap in px (image is scaled down to fit). */
  maxDim?: number;
  /** Initial JPEG quality (0..1); lowered automatically if still too big. */
  quality?: number;
  /** Hard cap on the encoded byte size; throws IMAGE_TOO_LARGE if unmet. */
  maxBytes?: number;
}

/** Approximate decoded byte size of a base64 data URL. */
function dataUrlBytes(url: string): number {
  const comma = url.indexOf(',');
  const b64 = comma >= 0 ? url.slice(comma + 1) : url;
  return Math.floor((b64.length * 3) / 4);
}

async function loadImage(file: File): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; done: () => void }> {
  // Prefer createImageBitmap (fast, no DOM), fall back to an <img> + object URL.
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return {
        w: bmp.width,
        h: bmp.height,
        draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
        done: () => bmp.close?.(),
      };
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
    el.src = url;
  });
  return {
    w: img.naturalWidth,
    h: img.naturalHeight,
    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    done: () => URL.revokeObjectURL(url),
  };
}

/** Downscale + JPEG-encode an image File to a data URL under `maxBytes`. */
export async function compressImageToDataUrl(file: File, opts: CompressOpts = {}): Promise<string> {
  const maxDim = opts.maxDim ?? 1280;
  const maxBytes = opts.maxBytes ?? 700_000;
  let quality = opts.quality ?? 0.72;

  const src = await loadImage(file);
  try {
    const longest = Math.max(src.w, src.h) || 1;
    const scale = Math.min(1, maxDim / longest);
    const w = Math.max(1, Math.round(src.w * scale));
    const h = Math.max(1, Math.round(src.h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
    src.draw(ctx, w, h);

    let url = canvas.toDataURL('image/jpeg', quality);
    while (dataUrlBytes(url) > maxBytes && quality > 0.3) {
      quality = Math.max(0.3, quality - 0.12);
      url = canvas.toDataURL('image/jpeg', quality);
    }
    if (dataUrlBytes(url) > maxBytes) throw new Error('IMAGE_TOO_LARGE');
    return url;
  } finally {
    src.done();
  }
}

/** True when a file is a still image we can compress inline (not video). */
export function isCompressibleImage(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('video')) return false;
  if (t.startsWith('image')) return true;
  // Empty type (iOS) with an image-ish extension — treat as image.
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name || '');
}
