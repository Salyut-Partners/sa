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

/**
 * What is wrong with a layer's window, in the words the panel uses. Timings are
 * warned about rather than corrected: a layer set to arrive at the twelfth
 * second of a ten-second video is usually a video about to be stretched to fit
 * a voice-over, not a mistake to undo on the user's behalf.
 */
export type TimingIssue =
  | 'appears-after-end'
  | 'never-visible'
  | 'hides-after-end'
  | 'entrance-cut-off';

export function timingIssues(timing: Timing, duration: number): TimingIssue[] {
  // The last frame rendered sits at duration - 1/fps, so a layer that opens on
  // the duration itself is in no frame at all.
  if (timing.appearAt >= duration) return ['appears-after-end'];
  if (timing.hideAt !== null && timing.hideAt <= timing.appearAt) return ['never-visible'];

  const issues: TimingIssue[] = [];
  if (timing.hideAt !== null && timing.hideAt > duration) issues.push('hides-after-end');
  // An open end reaches the end of the video and no further, so what cuts an
  // entrance short is whichever of the two comes first.
  if (timing.appearAt + timing.enterDuration > Math.min(endOf(timing), duration)) {
    issues.push('entrance-cut-off');
  }
  return issues;
}
