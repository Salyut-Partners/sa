import { describe, expect, it } from 'vitest';
import { checkImage } from './image.ts';

describe('checkImage', () => {
  it('accepts an exact 9:16 photo at full resolution', () => {
    expect(checkImage(1080, 1920)).toEqual({ ok: true, warning: null });
  });

  it('accepts a larger 9:16 photo', () => {
    expect(checkImage(2160, 3840)).toEqual({ ok: true, warning: null });
  });

  it('tolerates rounding in the source file', () => {
    expect(checkImage(1079, 1919).ok).toBe(true);
  });

  it('accepts a smaller photo but flags the resolution', () => {
    expect(checkImage(720, 1280)).toEqual({ ok: true, warning: 'low-resolution' });
  });

  it('rejects a square photo', () => {
    expect(checkImage(1080, 1080)).toEqual({ ok: false, reason: 'ratio' });
  });

  it('rejects a landscape photo', () => {
    expect(checkImage(1920, 1080)).toEqual({ ok: false, reason: 'ratio' });
  });

  it('accepts a photo just inside the one-percent tolerance', () => {
    expect(checkImage(1080, 1910).ok).toBe(true);
  });

  it('rejects a photo just outside the one-percent tolerance', () => {
    expect(checkImage(1080, 1900).ok).toBe(false);
  });

  it('rejects a photo with no dimensions rather than dividing by zero', () => {
    expect(checkImage(0, 0)).toEqual({ ok: false, reason: 'ratio' });
  });
});
