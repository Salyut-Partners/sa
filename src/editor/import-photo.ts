// Turning a picked file into a photo the project will accept. The check is the
// core's; this only reads the file and reports the outcome in words.
import { checkImage } from '../core/image.ts';

export interface ImportedPhoto {
  ok: true;
  id: string;
  name: string;
  image: string;
  warning: string | null;
}

export interface RejectedPhoto {
  ok: false;
  name: string;
  reason: string;
}

export type ImportResult = ImportedPhoto | RejectedPhoto;

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
    img.onerror = () => reject(new Error('файл не є зображенням'));
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = src;
  });

export async function importPhoto(file: File): Promise<ImportResult> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, name: file.name, reason: 'не зображення' };
  }
  try {
    const image = await readAsDataUrl(file);
    const { width, height } = await measure(image);
    const check = checkImage(width, height);
    if (!check.ok) {
      return {
        ok: false,
        name: file.name,
        reason: `потрібне вертикальне 9:16, а тут ${width}×${height}`,
      };
    }
    return {
      ok: true,
      id: crypto.randomUUID(),
      name: file.name,
      image,
      warning: check.warning === 'low-resolution'
        ? `${width}×${height} — менше за 1080×1920, відео буде м'яким`
        : null,
    };
  } catch (e) {
    return { ok: false, name: file.name, reason: (e as Error).message };
  }
}
