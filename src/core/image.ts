// Photos are accepted only at the aspect ratio the templates are built for.
// Cropping is deliberately not offered: a silently re-framed photo is worse
// than a rejected one, because it reaches the export looking almost right.
export const TARGET_RATIO = 9 / 16;
export const RATIO_TOLERANCE = 0.01;
export const FULL_WIDTH = 1080;
export const FULL_HEIGHT = 1920;

export type ImageCheck =
  | { ok: true; warning: 'low-resolution' | null }
  | { ok: false; reason: 'ratio' };

export function checkImage(width: number, height: number): ImageCheck {
  if (!(width > 0) || !(height > 0)) return { ok: false, reason: 'ratio' };

  const drift = Math.abs(width / height / TARGET_RATIO - 1);
  if (drift > RATIO_TOLERANCE) return { ok: false, reason: 'ratio' };

  const small = width < FULL_WIDTH || height < FULL_HEIGHT;
  return { ok: true, warning: small ? 'low-resolution' : null };
}
