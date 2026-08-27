import { describe, expect, it } from 'vitest';
import { clampRect, toPixels } from './canvas.ts';
import type { CanvasSize, Rect } from './types.ts';

const CANVAS: CanvasSize = { width: 1080, height: 1920 };

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
