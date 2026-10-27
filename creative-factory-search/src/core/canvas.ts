// Layer geometry is stored in percent of the canvas and only ever becomes
// pixels at the edge, when the renderer needs a box. Everything upstream of
// that stays resolution-independent.
import type { CanvasSize, PixelRect, Rect } from './types.ts';

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** Resolve percent geometry against a canvas, rounded to whole pixels. */
export function toPixels(rect: Rect, canvas: CanvasSize): PixelRect {
  // The one place a PixelRect is minted, which is what makes the brand mean something.
  return {
    x: Math.round((rect.x / 100) * canvas.width),
    y: Math.round((rect.y / 100) * canvas.height),
    w: Math.round((rect.w / 100) * canvas.width),
    h: Math.round((rect.h / 100) * canvas.height),
  } as PixelRect;
}

/**
 * Keep a rect inside the canvas at no less than `min`.
 *
 * Size is settled before position, so a rect pushed past the right edge slides
 * back rather than being squashed — dragging a button off-frame should move it,
 * not resize it.
 */
export function clampRect(rect: Rect, min: { w: number; h: number }): Rect {
  const w = clamp(rect.w, min.w, 100);
  const h = clamp(rect.h, min.h, 100);
  return {
    x: clamp(rect.x, 0, 100 - w),
    y: clamp(rect.y, 0, 100 - h),
    w,
    h,
  };
}

/** How far a template's content may go each way, in percent of the frame. */
export interface ShiftRange {
  x: readonly [number, number];
  y: readonly [number, number];
}

/**
 * The room a template's content has to move without leaving the frame.
 *
 * `box` is where the content draws itself, in percent of the frame — measured
 * by the renderer, because how far a panel reaches depends on the words in it.
 * A side the content already bleeds past at rest, like the sheet drawn wider
 * than the frame on purpose, gives no room that way and takes none either: the
 * layout may always stay where it was drawn.
 */
export function shiftRange(box: Rect): ShiftRange {
  return {
    x: [Math.min(0, -box.x), Math.max(0, 100 - box.x - box.w)],
    y: [Math.min(0, -box.y), Math.max(0, 100 - box.y - box.h)],
  };
}

/** A move held to the room `shiftRange` gives. */
export function clampShift(box: Rect, shift: { x: number; y: number }): { x: number; y: number } {
  const room = shiftRange(box);
  return {
    x: clamp(shift.x, room.x[0], room.x[1]),
    y: clamp(shift.y, room.y[0], room.y[1]),
  };
}

/**
 * Move a rect by whole canvas pixels.
 *
 * The step arrives in pixels rather than percent because that is the unit the
 * user is thinking in — the video is 1080 wide, and nudging by "a pixel" has to
 * mean one of those, not a round-looking fraction of a percent. Size is left
 * alone: this moves a button, it does not reshape one.
 */
export function nudgeRect(
  rect: Rect,
  by: { x: number; y: number },
  canvas: CanvasSize,
  min: { w: number; h: number },
): Rect {
  return clampRect({
    ...rect,
    x: rect.x + (by.x * 100) / canvas.width,
    y: rect.y + (by.y * 100) / canvas.height,
  }, min);
}
