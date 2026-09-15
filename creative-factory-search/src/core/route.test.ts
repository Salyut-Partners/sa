import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash } from './route.ts';

describe('the address the window keeps', () => {
  it('reads the tab and, on the launches tab, the topic', () => {
    expect(parseRoute('#/launches/ai-jobs-de-wh')).toEqual({ tab: 'launches', topic: 'ai-jobs-de-wh' });
    expect(parseRoute('#/launches')).toEqual({ tab: 'launches', topic: null });
    expect(parseRoute('#/subtitles')).toEqual({ tab: 'subtitles', topic: null });
    expect(parseRoute('#/creatives')).toEqual({ tab: 'creatives', topic: null });
  });

  it('opens the creatives for an empty or unknown address, and ignores a topic that is not a launch key', () => {
    expect(parseRoute('')).toEqual({ tab: 'creatives', topic: null });
    expect(parseRoute('#/settings')).toEqual({ tab: 'creatives', topic: null });
    expect(parseRoute('#/launches/../etc')).toEqual({ tab: 'launches', topic: null });
    expect(parseRoute('#/subtitles/ai-jobs-de-wh')).toEqual({ tab: 'subtitles', topic: null });
  });

  it('writes back what it reads', () => {
    expect(routeHash({ tab: 'launches', topic: 'ai-jobs-de-wh' })).toBe('#/launches/ai-jobs-de-wh');
    expect(routeHash({ tab: 'launches', topic: null })).toBe('#/launches');
    expect(routeHash({ tab: 'creatives', topic: 'ai-jobs-de-wh' })).toBe('#/creatives');
  });
});
