// A batch as a folder in the topic: `sources/<batch>/project.json` beside the
// pictures themselves, with the file pointing at them by name instead of
// carrying them. The folder is the buyer's «ісходники»: what the creatives
// were made from, laid flat where Finder shows it.
//
// The editor's own model keeps a photo as a data URL, and the browser path —
// autosave, the `.json` download — still writes it that way. This module is
// the seam between that and the disk: it takes the pictures out before a file
// is written into a launch folder, and puts them back when one is read, so the
// rest of the code never learns that a photo can be a path.
import { safeStem } from './batch.ts';
import type { ProjectFile } from './serialize.ts';

/** The folder under a launch that holds the batches. */
export const SOURCES_DIR = 'sources';

/**
 * The name of a folder inside a launch — a batch, a campaign. Lower-case, no
 * path separators, not hidden: it is a folder the buyer sees in Finder and a
 * segment of a URL the editor asks for.
 */
const FOLDER_NAME = /^[a-z0-9][a-z0-9._-]*$/;

export const isFolderName = (value: unknown): value is string =>
  typeof value === 'string' && FOLDER_NAME.test(value) && !value.includes('..');

/**
 * Whether a photo's `image` is a file in the batch folder rather than the
 * picture itself. Anything that is not a data URL is a path — a flat name
 * today, `photos/<name>` in the batches the format before `sources/` wrote.
 */
export const isPhotoRef = (image: string): boolean => !image.startsWith('data:');

/** One picture to write beside the file. */
export interface PhotoFile {
  /** Relative to the batch folder: `airport.jpg`. */
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

/** The one mapping between what a picture is and what its file is called, both ways. */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** The extension the bytes deserve, whatever the original file was called. */
export const extensionFor = (mime: string): string => EXTENSIONS[mime] ?? mime.split('/')[1] ?? 'bin';

/** The type a picture file is read back as, from its extension (`.jpg`, `jpeg`, `PNG`). */
export function mimeFor(extension: string): string {
  const ext = extension.replace(/^\./, '').toLowerCase();
  const known = Object.entries(EXTENSIONS).find(([, e]) => e === ext || (e === 'jpg' && ext === 'jpeg'));
  return known?.[0] ?? 'application/octet-stream';
}

/** The name the picture is written under: the photo's name made safe, never empty. */
const safeBase = (photoName: string): string => safeStem(photoName) || 'photo';

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
      const path = `${base}${n === 1 ? '' : '-' + n}.${ext}`;
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

/**
 * Whether a file on screen and a file read back from the folder hold the same
 * batch. Pictures are compared by their bytes and not by their type: the
 * folder writes a type as an extension and reads it back from one, so
 * `image/jpg` on the way in is `image/jpeg` on the way out, and a header that
 * said "не збережено" over that would be lying.
 */
export function sameProjectFile(a: unknown, b: unknown): boolean {
  const canon = (data: unknown): string => {
    if (typeof data !== 'object' || data === null || !Array.isArray((data as { photos?: unknown }).photos)) {
      return JSON.stringify(data);
    }
    const photos = (data as { photos: unknown[] }).photos.map(photo => {
      const image = (photo as { image?: unknown } | null)?.image;
      if (typeof image !== 'string') return photo;
      return { ...(photo as object), image: decodeDataUrl(image)?.base64 ?? image };
    });
    return JSON.stringify({ ...(data as object), photos });
  };
  return canon(a) === canon(b);
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
