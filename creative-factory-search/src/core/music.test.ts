import { describe, expect, it } from 'vitest';
import { MUSIC, musicById, musicRepeats } from './music.ts';

describe('musicRepeats', () => {
  it('plays a track once when it outlasts the file', () => {
    expect(musicRepeats(60, 12)).toBe(1);
    expect(musicRepeats(12, 12)).toBe(1);
  });

  it('repeats a short track, each repeat overlapping the last by the fade', () => {
    // 10 + 9 = 19 covers 15; 10 + 9 + 9 = 28 covers 25.
    expect(musicRepeats(10, 15)).toBe(2);
    expect(musicRepeats(10, 19)).toBe(2);
    expect(musicRepeats(10, 25)).toBe(3);
  });
});

describe('musicById', () => {
  it('finds a listed track and nothing for none or a gone one', () => {
    expect(musicById(MUSIC[0]!.id)).toBe(MUSIC[0]);
    expect(musicById(null)).toBeNull();
    expect(musicById('gone')).toBeNull();
  });
});
