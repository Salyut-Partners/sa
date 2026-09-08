import { describe, expect, it } from 'vitest';
import { checkImage, planImport } from './image.ts';

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

describe('planImport', () => {
  const good = (name: string) => ({ name, size: { width: 1080, height: 1920 } });

  it('takes a batch of good photos whole', () => {
    const plan = planImport([good('a.jpg'), good('b.jpg')], 12);
    expect(plan.accepted.map(a => a.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(plan.rejected).toEqual([]);
  });

  it('keeps the good ones when one photo in the batch is the wrong shape', () => {
    const plan = planImport(
      [good('a.jpg'), { name: 'wide.jpg', size: { width: 1920, height: 1080 } }, good('c.jpg')],
      12,
    );
    expect(plan.accepted.map(a => a.name)).toEqual(['a.jpg', 'c.jpg']);
    expect(plan.rejected).toEqual([{ index: 1, name: 'wide.jpg', reason: 'ratio' }]);
  });

  it('names the file that could not be read at all', () => {
    const plan = planImport([{ name: 'notes.pdf', size: null }], 12);
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toEqual([{ index: 0, name: 'notes.pdf', reason: 'unreadable' }]);
  });

  it('points back at the candidate it accepted, so the caller can pair the image up', () => {
    const plan = planImport([{ name: 'wide.jpg', size: { width: 100, height: 100 } }, good('b.jpg')], 12);
    expect(plan.accepted[0]!.index).toBe(1);
  });

  it('carries the low-resolution warning through without rejecting', () => {
    const plan = planImport([{ name: 'small.jpg', size: { width: 540, height: 960 } }], 12);
    expect(plan.accepted[0]!.warning).toBe('low-resolution');
    expect(plan.rejected).toEqual([]);
  });

  it('fills the room that is left and turns the rest away', () => {
    const plan = planImport([good('a.jpg'), good('b.jpg'), good('c.jpg')], 2);
    expect(plan.accepted.map(a => a.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(plan.rejected).toEqual([{ index: 2, name: 'c.jpg', reason: 'no-room' }]);
  });

  it('does not let a rejected photo take up room', () => {
    const plan = planImport(
      [{ name: 'wide.jpg', size: { width: 1920, height: 1080 } }, good('b.jpg')],
      1,
    );
    expect(plan.accepted.map(a => a.name)).toEqual(['b.jpg']);
  });

  it('turns everything away when the project is full', () => {
    const plan = planImport([good('a.jpg')], 0);
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toEqual([{ index: 0, name: 'a.jpg', reason: 'no-room' }]);
  });
});
