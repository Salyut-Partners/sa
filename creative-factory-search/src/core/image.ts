// Photos of any shape are accepted, and each creative is rendered at the shape
// of its own photo — a square photo makes a square video, a landscape one a
// landscape video. Nothing is cropped to 9:16 and nothing is letterboxed.
import type { CanvasSize } from './types.ts';

/** The short side of a frame, as long as the long side fits under `LONG_SIDE`. */
export const SHORT_SIDE = 1080;
/** The long side of a frame never goes past this — 1080x1920 for 9:16. */
export const LONG_SIDE = 1920;

export type ImageWarning = 'low-resolution';

export type ImageCheck =
  | { ok: true; canvas: CanvasSize; warning: ImageWarning | null }
  | { ok: false; reason: 'unreadable' };

/**
 * The frame a photo of this size is rendered at: its own proportions, the short
 * side at 1080 — 1080x1920, 1080x1080, 1080x1350, 1920x1080 for the usual four —
 * unless that would take the long side past 1920, in which case the long side
 * is 1920. Both sides even, because H.264 at 4:2:0 refuses an odd one.
 */
export function frameFor(width: number, height: number): CanvasSize {
  const scale = Math.min(SHORT_SIDE / Math.min(width, height), LONG_SIDE / Math.max(width, height));
  const even = (n: number): number => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

export function checkImage(width: number, height: number): ImageCheck {
  if (!(width > 0) || !(height > 0)) return { ok: false, reason: 'unreadable' };

  const canvas = frameFor(width, height);
  // A frame larger than the photo is the photo upscaled; past a pixel or so of
  // rounding the video goes soft.
  const small = width < canvas.width * 0.99 || height < canvas.height * 0.99;
  return { ok: true, canvas, warning: small ? 'low-resolution' : null };
}

// --------------------------------------------------------- importing a batch --

/**
 * One picked file, reduced to what the decision needs. `size: null` is a file
 * that could not be measured as an image — reading it is the caller's job, the
 * verdict is this module's.
 */
export interface Candidate {
  name: string;
  size: { width: number; height: number } | null;
}

/** Which candidate a verdict is about — the position lets the caller pair it up. */
interface FileRef {
  index: number;
  name: string;
}

export interface AcceptedPhoto extends FileRef {
  canvas: CanvasSize;
  warning: ImageWarning | null;
}

export interface RejectedPhoto extends FileRef {
  reason: 'unreadable' | 'no-room';
}

export interface ImportPlan {
  accepted: AcceptedPhoto[];
  rejected: RejectedPhoto[];
}

/**
 * Split a picked batch into what the project takes and what it turns away, with
 * a reason per file. One bad photo must not cost the user the other eleven, and
 * a photo that never made it in must not eat one of the remaining places.
 */
export function planImport(candidates: readonly Candidate[], room: number): ImportPlan {
  const plan: ImportPlan = { accepted: [], rejected: [] };

  candidates.forEach((candidate, index) => {
    if (candidate.size === null) {
      plan.rejected.push({ index, name: candidate.name, reason: 'unreadable' });
      return;
    }
    const check = checkImage(candidate.size.width, candidate.size.height);
    if (!check.ok) {
      plan.rejected.push({ index, name: candidate.name, reason: check.reason });
      return;
    }
    if (plan.accepted.length >= room) {
      plan.rejected.push({ index, name: candidate.name, reason: 'no-room' });
      return;
    }
    plan.accepted.push({ index, name: candidate.name, canvas: check.canvas, warning: check.warning });
  });

  return plan;
}
