// When a layer is on screen, and how far into its entrance it is. Pure
// arithmetic over the model — the renderer only applies what this returns.
import type { Timing } from './types.ts';

export interface LayerState {
  visible: boolean;
  /** 0 at the first frame of the entrance, 1 once it has finished. */
  enter: number;
}

const HIDDEN: LayerState = { visible: false, enter: 0 };

/**
 * Where a layer stops.
 *
 * An open end is encoded as infinity rather than as the current duration, and
 * that is deliberate on two counts. It is what makes "to the end" follow the
 * duration when a video is stretched to fit a voice-over, instead of freezing
 * against the length the layer was authored at. And it keeps the layer on the
 * frame at exactly `t === duration` — which `posterTime` can return — where
 * clamping to the duration would blank the whole composition.
 */
const endOf = (timing: Timing): number =>
  timing.hideAt === null ? Number.POSITIVE_INFINITY : timing.hideAt;

export function layerStateAt(timing: Timing, t: number, duration: number): LayerState {
  const end = endOf(timing);
  if (t < timing.appearAt || t >= end) return HIDDEN;

  const span = timing.enterDuration;
  if (span <= 0) return { visible: true, enter: 1 };

  // Float division lands a hair under 1 at the nominal end of the entrance
  // ((2.4 - 2) / 0.4 is 0.9999999999999998), which would leave a layer forever
  // one frame short of arrived. Snap it.
  const progress = (t - timing.appearAt) / span;
  return { visible: true, enter: progress >= 1 - 1e-9 ? 1 : progress };
}

/**
 * The frame an unselected preview is frozen on: late enough that the whole
 * composition has arrived. A grid of these reads as a contact sheet instead of
 * a wall of bare photos.
 *
 * "Everything has arrived" is the last entrance to *finish*, not the last one to
 * start: a layer that appears early with a long entrance settles after one that
 * appears late with a short one.
 */
export function posterTime(timings: readonly Timing[], duration: number): number {
  if (timings.length === 0) return duration * 0.6;
  const settled = Math.max(...timings.map(t => t.appearAt + Math.max(0, t.enterDuration)));
  return Math.min(Math.max(0, settled), duration);
}
