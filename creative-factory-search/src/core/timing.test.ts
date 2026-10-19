import { describe, expect, it } from 'vitest';
import { photoTimings } from './project.ts';
import { layerStateAt, posterTime, timingIssues } from './timing.ts';
import type { Photo, Timing } from './types.ts';

const timing = (over: Partial<Timing> = {}): Timing => ({
  appearAt: 0,
  hideAt: null,
  enter: 'fade',
  enterDuration: 0.4,
  ...over,
});

describe('layerStateAt', () => {
  it('hides a layer before its appearAt', () => {
    expect(layerStateAt(timing({ appearAt: 2 }), 1.9, 10)).toEqual({ visible: false, enter: 0 });
  });

  it('shows the layer at the very start of its entrance', () => {
    expect(layerStateAt(timing({ appearAt: 2 }), 2, 10)).toEqual({ visible: true, enter: 0 });
  });

  it('reports entrance progress while it plays', () => {
    const state = layerStateAt(timing({ appearAt: 2 }), 2.2, 10);
    expect(state.visible).toBe(true);
    expect(state.enter).toBeCloseTo(0.5, 10);
  });

  it('finishes the entrance and stays finished', () => {
    expect(layerStateAt(timing({ appearAt: 2 }), 2.4, 10).enter).toBe(1);
    expect(layerStateAt(timing({ appearAt: 2 }), 8, 10).enter).toBe(1);
  });

  it('treats a zero-length entrance as instant', () => {
    expect(layerStateAt(timing({ appearAt: 2, enterDuration: 0 }), 2, 10)).toEqual({
      visible: true, enter: 1,
    });
  });

  it('keeps an open-ended layer on screen at the very end', () => {
    // posterTime can return exactly the duration; clamping the open end to it
    // would blank the whole composition on every frozen preview.
    expect(layerStateAt(timing(), 10, 10).visible).toBe(true);
  });

  it('follows the duration when it changes, rather than the one it was set with', () => {
    expect(layerStateAt(timing(), 17, 18).visible).toBe(true);
  });

  it('hides the layer from its hideAt onwards', () => {
    const t = timing({ hideAt: 6 });
    expect(layerStateAt(t, 5.9, 10).visible).toBe(true);
    expect(layerStateAt(t, 6, 10)).toEqual({ visible: false, enter: 0 });
    expect(layerStateAt(t, 9, 10).visible).toBe(false);
  });

  it('hides a layer whose window is inverted rather than showing it forever', () => {
    expect(layerStateAt(timing({ appearAt: 5, hideAt: 3 }), 6, 10).visible).toBe(false);
  });
});

describe('posterTime', () => {
  it('falls back to 60% of the duration when there are no layers', () => {
    expect(posterTime([], 10)).toBe(6);
  });

  it('waits for the layer entrance to finish', () => {
    expect(posterTime([timing({ appearAt: 2, enterDuration: 0.4 })], 10)).toBe(2.4);
  });

  it('waits for the latest layer of several', () => {
    expect(posterTime(
      [timing({ appearAt: 1 }), timing({ appearAt: 5, enterDuration: 0.6 }), timing({ appearAt: 3 })],
      10,
    )).toBe(5.6);
  });

  it('waits for the last entrance to finish, not for the last one to start', () => {
    // A layer that arrives early but enters slowly settles after one that
    // arrives late and enters fast — the poster frame has to wait for both.
    expect(posterTime(
      [timing({ appearAt: 5, enterDuration: 0.4 }), timing({ appearAt: 4, enterDuration: 2 })],
      10,
    )).toBe(6);
  });

  it('never runs past the end of the video', () => {
    expect(posterTime([timing({ appearAt: 12 })], 10)).toBe(10);
  });

  it('is zero when everything is on screen from the first frame', () => {
    expect(posterTime([timing({ appearAt: 0, enterDuration: 0 })], 10)).toBe(0);
  });
});

describe('timingIssues', () => {
  it('finds nothing wrong with a layer that opens at the start and runs to the end', () => {
    expect(timingIssues(timing(), 10)).toEqual([]);
  });

  it('finds nothing wrong with a window that sits inside the video', () => {
    expect(timingIssues(timing({ appearAt: 2, hideAt: 8 }), 10)).toEqual([]);
  });

  it('reports a layer that appears once the video is already over', () => {
    expect(timingIssues(timing({ appearAt: 12 }), 10)).toEqual(['appears-after-end']);
  });

  it('counts appearing exactly at the duration as after the end', () => {
    // The last frame rendered is at duration - 1/fps, so a layer that opens on
    // the duration itself is in no frame at all.
    expect(timingIssues(timing({ appearAt: 10 }), 10)).toEqual(['appears-after-end']);
  });

  it('says only that the layer never appears, not everything downstream of it', () => {
    expect(timingIssues(timing({ appearAt: 12, hideAt: 11, enterDuration: 5 }), 10))
      .toEqual(['appears-after-end']);
  });

  it('reports a window that closes before it opens', () => {
    expect(timingIssues(timing({ appearAt: 5, hideAt: 3 }), 10)).toEqual(['never-visible']);
  });

  it('reports a window that closes the instant it opens', () => {
    expect(timingIssues(timing({ appearAt: 5, hideAt: 5 }), 10)).toEqual(['never-visible']);
  });

  it('reports a hide that falls past the end of the video', () => {
    expect(timingIssues(timing({ hideAt: 14 }), 10)).toEqual(['hides-after-end']);
  });

  it('treats an open end as reaching the end rather than running past it', () => {
    expect(timingIssues(timing({ hideAt: null }), 10)).toEqual([]);
  });

  it('reports an entrance the hide cuts off', () => {
    expect(timingIssues(timing({ appearAt: 3, hideAt: 3.2, enterDuration: 0.4 }), 10))
      .toEqual(['entrance-cut-off']);
  });

  it('reports an entrance the end of the video cuts off', () => {
    expect(timingIssues(timing({ appearAt: 9.8, enterDuration: 0.4 }), 10))
      .toEqual(['entrance-cut-off']);
  });

  it('reports both a hide past the end and the entrance it leaves unfinished', () => {
    expect(timingIssues(timing({ appearAt: 9.9, hideAt: 12, enterDuration: 0.4 }), 10))
      .toEqual(['hides-after-end', 'entrance-cut-off']);
  });

  it('is judged against the duration as it is now, not as it was', () => {
    const t = timing({ appearAt: 12 });
    expect(timingIssues(t, 10)).toEqual(['appears-after-end']);
    expect(timingIssues(t, 18)).toEqual([]);
  });
});

describe('photoTimings', () => {
  const base = (over: Partial<Photo> = {}): Photo => ({
    id: 'a', name: 'a.jpg', image: 'data:,a', canvas: { width: 1080, height: 1920 }, accent: '#1fa94b',
    pushIn: true, glare: true, template: null, overlay: null, buttons: [], ...over,
  });

  it('lists no timings for a bare photo, which is what a poster falls back on', () => {
    expect(photoTimings(base())).toEqual([]);
  });

  it('counts the template among the layers, so the poster waits for the panel', () => {
    const panel = timing({ appearAt: 1.2, enterDuration: 0.9 });
    const timings = photoTimings(base({ template: { definitionId: 'rates', offsetY: 0, timing: panel } }));
    expect(posterTime(timings, 10)).toBeCloseTo(2.1, 10);
  });

  it('takes the last layer to settle, whichever kind it is', () => {
    const panel = timing({ appearAt: 0.3, enterDuration: 0.9 });
    const late = timing({ appearAt: 4, enterDuration: 0.4 });
    const timings = photoTimings(base({
      template: { definitionId: 'rates', offsetY: 0, timing: panel },
      buttons: [{
        id: 'b', styleId: 'glow', fontId: 'anton', text: 'x', color: '#fff',
        rect: { x: 0, y: 0, w: 10, h: 10 }, timing: late,
      }],
    }));
    expect(posterTime(timings, 10)).toBeCloseTo(4.4, 10);
  });
});
