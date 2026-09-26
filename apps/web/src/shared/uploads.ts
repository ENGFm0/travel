import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firebaseEnabled, storage } from './firebase';

export type MediaType = 'image' | 'video';

/** Classify a File as image or video (defaults to image). */
export function mediaTypeOf(mime: string): MediaType {
  return mime.startsWith('video') ? 'video' : 'image';
}

/** Read a File as a base64 data URL (dev/mock fallback when Firebase is off). */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('READ_FAILED'));
    r.readAsDataURL(file);
  });
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

/** Upload a file under `folder` and return a durable URL. Uses Firebase Storage
 *  when configured; otherwise falls back to an inline data URL (dev/tests). */
export async function uploadFile(folder: string, file: File): Promise<string> {
  if (!firebaseEnabled()) return readAsDataUrl(file);
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-60);
  const path = `${folder}/${uid()}-${safe}`;
  const snap = await uploadBytes(ref(storage(), path), file, { contentType: file.type });
  return getDownloadURL(snap.ref);
}
