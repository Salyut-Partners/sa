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
