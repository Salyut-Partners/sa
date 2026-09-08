// Turning picked files into photos the project will take. Reading and measuring
// happen here because they need the browser; every decision about what is
// acceptable belongs to the core, so this file makes none of its own.
import { planImport, type Candidate, type RejectedPhoto } from '../core/image.ts';
import { MAX_PHOTOS, type NewPhoto } from '../core/project.ts';

/** What an import has to say for itself, in lines the panel prints as they are. */
export interface ImportReport {
  /** Accepted, but worth saying out loud — low resolution. */
  warnings: string[];
  /** Turned away, one line each, naming the file and why. */
  rejected: string[];
}

export interface BatchImport extends ImportReport {
  photos: NewPhoto[];
}

export const NOTHING_IMPORTED: ImportReport = { warnings: [], rejected: [] };

interface ReadFile {
  candidate: Candidate;
  image: string;
}

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('не вдалось прочитати файл'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

const measure = (src: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('не зображення'));
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = src;
  });

async function read(file: File): Promise<ReadFile> {
  try {
    const image = await readAsDataUrl(file);
    return { candidate: { name: file.name, size: await measure(image) }, image };
  } catch {
    return { candidate: { name: file.name, size: null }, image: '' };
  }
}

function explain(reason: RejectedPhoto['reason'], size: Candidate['size']): string {
  switch (reason) {
    case 'unreadable':
      return 'не вдалось прочитати як зображення';
    case 'ratio':
      return `потрібне вертикальне 9:16, а тут ${size?.width}×${size?.height}`;
    case 'no-room':
      // Not "N places were left": by the time this is read the earlier files of
      // the same batch have taken them, and a number that is already spent reads
      // as free space.
      return `не вмістилось — у проєкті максимум ${MAX_PHOTOS} фото`;
  }
}

/** Read a picked batch and report, per file, what got in and what did not. */
export async function importFiles(files: readonly File[], room: number): Promise<BatchImport> {
  const opened = await Promise.all(files.map(read));
  const plan = planImport(opened.map(o => o.candidate), room);

  return {
    photos: plan.accepted.map(a => ({
      id: crypto.randomUUID(),
      name: a.name,
      image: opened[a.index]!.image,
    })),
    warnings: plan.accepted
      .filter(a => a.warning !== null)
      .map(a => {
        const size = opened[a.index]!.candidate.size;
        return `${a.name}: ${size?.width}×${size?.height} — менше за 1080×1920, відео буде м'яким`;
      }),
    rejected: plan.rejected.map(r =>
      `${r.name}: ${explain(r.reason, opened[r.index]!.candidate.size)}`),
  };
}

/**
 * One file, for swapping the image under a photo that is already set up. It goes
 * through the same plan as a batch so a replacement cannot get in at a shape an
 * import would have turned away.
 */
export async function importReplacement(
  file: File,
): Promise<{ ok: true; image: string; name: string } | { ok: false; reason: string }> {
  const batch = await importFiles([file], 1);
  const photo = batch.photos[0];
  return photo === undefined
    ? { ok: false, reason: batch.rejected[0] ?? file.name }
    : { ok: true, image: photo.image, name: photo.name };
}
