// A batch as a folder in the topic: `project.json` beside a `photos/` folder,
// with the file pointing at the pictures by name instead of carrying them.
//
// The editor's own model keeps a photo as a data URL, and the browser path —
// autosave, the `.json` download — still writes it that way. This module is
// the seam between that and the disk: it takes the pictures out before a file
// is written into a launch folder, and puts them back when one is read, so the
// rest of the code never learns that a photo can be a path.
import type { ProjectFile } from './serialize.ts';

/** The folder beside `project.json` that holds the pictures. */
export const PHOTOS_DIR = 'photos';

/**
 * A batch folder's name. Lower-case, no path separators, not hidden: it is a
 * folder the buyer sees in Finder and a segment of a URL the editor asks for.
 */
const BATCH_NAME = /^[a-z0-9][a-z0-9._-]*$/;

export const isBatchName = (value: unknown): value is string =>
  typeof value === 'string' && BATCH_NAME.test(value) && !value.includes('..');

/** Whether a photo's `image` is a file in the batch folder rather than the picture itself. */
export const isPhotoRef = (image: string): boolean => image.startsWith(PHOTOS_DIR + '/');

/** One picture to write beside the file. */
export interface PhotoFile {
  /** Relative to the batch folder: `photos/airport.jpg`. */
  path: string;
  mime: string;
  base64: string;
}

export interface SplitBatch {
  /** The project with every picture replaced by the path it was written to. */
  file: ProjectFile;
  photos: PhotoFile[];
}

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+);base64,(.*)$/s;

/** The type and the payload of a base64 data URL, or null for anything else. */
export function decodeDataUrl(url: string): { mime: string; base64: string } | null {
  const match = DATA_URL.exec(url);
  return match === null ? null : { mime: match[1]!, base64: match[2]! };
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** The extension the bytes deserve, whatever the original file was called. */
const extensionFor = (mime: string): string => EXTENSIONS[mime] ?? mime.split('/')[1] ?? 'bin';

/**
 * The name the picture is written under: the photo's name made safe, with the
 * extension the bytes say. The same rule `archiveName` uses for creatives, so
 * a photo and its videos read as one thing in Finder.
 */
function safeBase(photoName: string): string {
  const base = photoName.replace(/\.[^.]+$/, '');
  const safe = base.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return safe === '' ? 'photo' : safe;
}

/**
 * Take the pictures out of a file, ready to be written as a folder.
 *
 * Pure: it decides names and hands back bytes, and the caller does the writing.
 * Two photos that share a name and differ in their bytes get two files; two
 * that share both get one, because a file holding the same picture twice is
 * exactly the copy this format exists to avoid. A photo already pointing at a
 * file is passed through with nothing to write.
 */
export function splitPhotos(file: ProjectFile): SplitBatch {
  const photos: PhotoFile[] = [];
  /** Path taken → the payload written there, to reuse or to step around. */
  const taken = new Map<string, string>();

  const place = (name: string, mime: string, base64: string): string => {
    const base = safeBase(name);
    const ext = extensionFor(mime);
    for (let n = 1; ; n++) {
      const path = `${PHOTOS_DIR}/${base}${n === 1 ? '' : '-' + n}.${ext}`;
      const held = taken.get(path);
      if (held === base64) return path;
      if (held === undefined) {
        taken.set(path, base64);
        photos.push({ path, mime, base64 });
        return path;
      }
    }
  };

  const split = file.photos.map(photo => {
    const decoded = decodeDataUrl(photo.image);
    if (decoded === null) return photo;
    return { ...photo, image: place(photo.name, decoded.mime, decoded.base64) };
  });

  return { file: { ...file, photos: split }, photos };
}

export interface JoinedBatch {
  /** The file with its pictures back inside, for `fromFile`. */
  file: unknown;
  /** Paths the folder no longer has. Their photos are left out rather than opened blank. */
  missing: string[];
}

/**
 * Put the pictures back into a file read from a folder.
 *
 * `read` answers a path with the data URL of what is there, or null. A picture
 * that is gone drops its photo from the file and is named in `missing`: the
 * alternative is a batch that refuses to open because one of twelve files was
 * moved, or one that opens with a blank frame and exports it hours later. A
 * file whose pictures are still inside it — the format before folders — asks
 * the disk for nothing and opens as it always did.
 */
export function joinPhotos(data: unknown, read: (path: string) => string | null): JoinedBatch {
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { photos?: unknown }).photos)) {
    return { file: data, missing: [] };
  }
  const missing: string[] = [];
  const photos: unknown[] = [];
  for (const photo of (data as { photos: unknown[] }).photos) {
    const image = (photo as { image?: unknown } | null)?.image;
    if (typeof image !== 'string' || !isPhotoRef(image)) {
      photos.push(photo);
      continue;
    }
    const found = read(image);
    if (found === null) missing.push(image);
    else photos.push({ ...(photo as object), image: found });
  }
  return { file: { ...(data as object), photos }, missing };
}
