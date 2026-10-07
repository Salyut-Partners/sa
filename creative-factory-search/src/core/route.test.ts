import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash } from './route.ts';

describe('the address the window keeps', () => {
  it('reads the tab', () => {
    expect(parseRoute('#/subtitles')).toBe('subtitles');
    expect(parseRoute('#/creatives')).toBe('creatives');
  });

  it('opens the creatives for an empty or unknown address, the old launches tab included', () => {
    expect(parseRoute('')).toBe('creatives');
    expect(parseRoute('#/settings')).toBe('creatives');
    expect(parseRoute('#/launches/ai-jobs-de-wh')).toBe('creatives');
  });

  it('writes back what it reads', () => {
    expect(routeHash('subtitles')).toBe('#/subtitles');
    expect(parseRoute(routeHash('creatives'))).toBe('creatives');
  });
});
