import { describe, expect, it } from 'vitest';
import { checkImage, frameFor, planImport } from './image.ts';

describe('frameFor', () => {
  it('keeps 9:16 at 1080x1920', () => {
    expect(frameFor(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(frameFor(2160, 3840)).toEqual({ width: 1080, height: 1920 });
  });

  it('renders a square photo square', () => {
    expect(frameFor(3000, 3000)).toEqual({ width: 1080, height: 1080 });
  });

  it('renders 4:5 at 1080x1350', () => {
    expect(frameFor(1600, 2000)).toEqual({ width: 1080, height: 1350 });
  });

  it('renders a landscape photo landscape', () => {
    expect(frameFor(3840, 2160)).toEqual({ width: 1920, height: 1080 });
  });

  it('caps the long side at 1920 for a photo longer than 16:9', () => {
    expect(frameFor(2520, 1080)).toEqual({ width: 1920, height: 822 });
  });

  it('keeps both sides even, which H.264 needs', () => {
    const { width, height } = frameFor(1001, 1333);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });
});

describe('checkImage', () => {
  it('accepts a 9:16 photo at full resolution', () => {
    expect(checkImage(1080, 1920)).toEqual({ ok: true, canvas: { width: 1080, height: 1920 }, warning: null });
  });

  it('tolerates rounding in the source file', () => {
    expect(checkImage(1079, 1919)).toMatchObject({ ok: true, warning: null });
  });

  it('accepts a photo of any shape at its own proportions', () => {
    expect(checkImage(1920, 1080)).toEqual({ ok: true, canvas: { width: 1920, height: 1080 }, warning: null });
    expect(checkImage(1080, 1080)).toEqual({ ok: true, canvas: { width: 1080, height: 1080 }, warning: null });
  });

  it('flags a photo smaller than its frame', () => {
    expect(checkImage(720, 1280)).toEqual({ ok: true, canvas: { width: 1080, height: 1920 }, warning: 'low-resolution' });
    expect(checkImage(800, 800)).toMatchObject({ ok: true, warning: 'low-resolution' });
  });

  it('turns away a photo with no dimensions rather than dividing by zero', () => {
    expect(checkImage(0, 0)).toEqual({ ok: false, reason: 'unreadable' });
  });
});

describe('planImport', () => {
  const good = (name: string) => ({ name, size: { width: 1080, height: 1920 } });

  it('takes a batch of good photos whole', () => {
    const plan = planImport([good('a.jpg'), good('b.jpg')], 12);
    expect(plan.accepted.map(a => a.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(plan.rejected).toEqual([]);
  });

  it('takes a photo of another shape with a frame of that shape', () => {
    const plan = planImport(
      [good('a.jpg'), { name: 'wide.jpg', size: { width: 3840, height: 2160 } }],
      12,
    );
    expect(plan.accepted.map(a => a.name)).toEqual(['a.jpg', 'wide.jpg']);
    expect(plan.accepted[1]).toMatchObject({ canvas: { width: 1920, height: 1080 }, warning: null });
    expect(plan.rejected).toEqual([]);
  });

  it('names the file that could not be read at all', () => {
    const plan = planImport([{ name: 'notes.pdf', size: null }], 12);
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toEqual([{ index: 0, name: 'notes.pdf', reason: 'unreadable' }]);
  });

  it('points back at the candidate it accepted, so the caller can pair the image up', () => {
    const plan = planImport([{ name: 'notes.pdf', size: null }, good('b.jpg')], 12);
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
    const plan = planImport([{ name: 'notes.pdf', size: null }, good('b.jpg')], 1);
    expect(plan.accepted.map(a => a.name)).toEqual(['b.jpg']);
  });

  it('turns everything away when the project is full', () => {
    const plan = planImport([good('a.jpg')], 0);
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toEqual([{ index: 0, name: 'a.jpg', reason: 'no-room' }]);
  });
});
