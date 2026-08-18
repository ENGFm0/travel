// Pure model + helpers for US-013 (memories). Framework-free so upload
// validation, delete permissions, and grouping can be unit-tested directly.

export type MediaType = 'image' | 'video';

export interface Media {
  id: string;
  type: MediaType;
  src: string; // object URL (mock) or signed URL (real)
  name: string;
  uploaderUid: string;
  day: string; // grouping label, e.g. "Day 1"
  place: string; // grouping label, e.g. "London"
}

export type Grouping = 'day' | 'place';

export type UploadError = 'TYPE' | 'SIZE';

// Documented limits (BR-013-004/006). Real caps also enforced server-side.
export const IMAGE_MAX = 10 * 1024 * 1024; // 10 MB
export const VIDEO_MAX = 100 * 1024 * 1024; // 100 MB

/** Validate a file's MIME + size against the allowlist and caps (VR-013-001,
 *  AC6). Returns an error code or null when acceptable. */
export function validateFile(mime: string, size: number): UploadError | null {
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  if (!isImage && !isVideo) return 'TYPE';
  if (isImage && size > IMAGE_MAX) return 'SIZE';
  if (isVideo && size > VIDEO_MAX) return 'SIZE';
  return null;
}

export function mediaTypeOf(mime: string): MediaType {
  return mime.startsWith('video/') ? 'video' : 'image';
}

/** A member may delete their own media; the owner may delete any (BR-013-002). */
export function canDelete(media: Media, meUid: string, isOwner: boolean): boolean {
  return isOwner || media.uploaderUid === meUid;
}

/** Group media by the chosen dimension, preserving insertion order within a
 *  group and first-seen order of the groups themselves. */
export function groupMedia(media: Media[], by: Grouping): { label: string; items: Media[] }[] {
  const order: string[] = [];
  const map = new Map<string, Media[]>();
  for (const m of media) {
    const key = (by === 'day' ? m.day : m.place) || '—';
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(m);
  }
  return order.map((label) => ({ label, items: map.get(label)! }));
}
