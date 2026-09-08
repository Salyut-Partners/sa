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
  warning: 'low-resolution' | null;
}

export interface RejectedPhoto extends FileRef {
  reason: 'unreadable' | 'ratio' | 'no-room';
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
      plan.rejected.push({ index, name: candidate.name, reason: 'ratio' });
      return;
    }
    if (plan.accepted.length >= room) {
      plan.rejected.push({ index, name: candidate.name, reason: 'no-room' });
      return;
    }
    plan.accepted.push({ index, name: candidate.name, warning: check.warning });
  });

  return plan;
}
