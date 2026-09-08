import { describe, expect, it } from 'vitest';
import { clampRect, nudgeRect, toPixels } from './canvas.ts';
import type { CanvasSize, Rect } from './types.ts';

const CANVAS: CanvasSize = { width: 1080, height: 1920 };
const MIN = { w: 12, h: 3 };

describe('toPixels', () => {
  it('resolves percent geometry against the canvas', () => {
    const rect: Rect = { x: 10, y: 25, w: 50, h: 12.5 };
    expect(toPixels(rect, CANVAS)).toEqual({ x: 108, y: 480, w: 540, h: 240 });
  });

  it('rounds to whole pixels so the DOM never gets a fractional box', () => {
    expect(toPixels({ x: 33.333, y: 0, w: 1, h: 1 }, CANVAS)).toEqual({
      x: 360, y: 0, w: 11, h: 19,
    });
  });

  it('scales with the canvas rather than assuming 1080x1920', () => {
    expect(toPixels({ x: 50, y: 50, w: 10, h: 10 }, { width: 720, height: 1280 })).toEqual({
      x: 360, y: 640, w: 72, h: 128,
    });
  });
});

describe('clampRect', () => {
  const MIN = { w: 10, h: 2 };

  it('leaves a rect that already fits alone', () => {
    const rect: Rect = { x: 10, y: 10, w: 50, h: 10 };
    expect(clampRect(rect, MIN)).toEqual(rect);
  });

  it('pulls a rect back inside the left and top edges', () => {
    expect(clampRect({ x: -8, y: -3, w: 50, h: 10 }, MIN)).toEqual({ x: 0, y: 0, w: 50, h: 10 });
  });

  it('pulls a rect back inside the right and bottom edges without shrinking it', () => {
    expect(clampRect({ x: 70, y: 95, w: 50, h: 10 }, MIN)).toEqual({ x: 50, y: 90, w: 50, h: 10 });
  });

  it('enforces the minimum size', () => {
    expect(clampRect({ x: 0, y: 0, w: 2, h: 0.5 }, MIN)).toEqual({ x: 0, y: 0, w: 10, h: 2 });
  });

  it('caps a rect that is larger than the canvas', () => {
    expect(clampRect({ x: 5, y: 5, w: 140, h: 300 }, MIN)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});

describe('nudgeRect', () => {
  const rect = { x: 10, y: 20, w: 30, h: 10 };

  it('moves the rect by whole canvas pixels, whatever the percentages work out to', () => {
    // One pixel of 1080 is 0.0926%, and "по пікселю" has to mean the pixel the
    // video is made of — not a percentage that happens to look round.
    expect(nudgeRect(rect, { x: 1, y: 0 }, CANVAS, MIN).x).toBeCloseTo(10 + 100 / 1080, 10);
    expect(nudgeRect(rect, { x: 0, y: 1 }, CANVAS, MIN).y).toBeCloseTo(20 + 100 / 1920, 10);
  });

  it('moves the other way for a negative step', () => {
    expect(nudgeRect(rect, { x: -10, y: 0 }, CANVAS, MIN).x).toBeCloseTo(10 - 1000 / 1080, 10);
  });

  it('leaves the size alone', () => {
    const moved = nudgeRect(rect, { x: 5, y: 5 }, CANVAS, MIN);
    expect(moved.w).toBe(rect.w);
    expect(moved.h).toBe(rect.h);
  });

  it('stops at the edge of the canvas rather than walking off it', () => {
    expect(nudgeRect({ x: 0, y: 0, w: 30, h: 10 }, { x: -20, y: -20 }, CANVAS, MIN))
      .toEqual({ x: 0, y: 0, w: 30, h: 10 });
    expect(nudgeRect({ x: 70, y: 90, w: 30, h: 10 }, { x: 200, y: 200 }, CANVAS, MIN))
      .toEqual({ x: 70, y: 90, w: 30, h: 10 });
  });
});
