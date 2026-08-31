import { describe, expect, it } from 'vitest';
import { amountOf, counterFor } from './money.ts';

describe('reading a figure out of a field', () => {
  it('keeps every digit and drops the rest', () => {
    expect(amountOf('10.000 €')).toBe(10000);
    expect(amountOf('€3,532')).toBe(3532);
    expect(amountOf('890')).toBe(890);
  });

  it('answers nothing when there is no figure to read', () => {
    expect(amountOf('')).toBeNull();
    expect(amountOf('kostenlos')).toBeNull();
  });
});

describe('counting a figure up', () => {
  it('writes every step in the spelling the field was written in', () => {
    const c = counterFor('3.532 €');
    expect(c.value).toBe(3532);
    expect(c.say(3532)).toBe('3.532 €');
    expect(c.say(1200)).toBe('1.200 €');
    expect(c.say(890)).toBe('890 €');
    expect(c.say(0)).toBe('0 €');
  });

  it('keeps whatever sits on either side of the digits', () => {
    expect(counterFor('€3,532').say(1000)).toBe('€1,000');
    expect(counterFor('3 532 kr/mån').say(12000)).toBe('12 000 kr/mån');
  });

  it('groups only when the figure it was given was grouped', () => {
    expect(counterFor('3532 €').say(12000)).toBe('12000 €');
  });

  it('rounds to the whole unit, and never below nothing', () => {
    const c = counterFor('3.532 €');
    expect(c.say(1200.6)).toBe('1.201 €');
    expect(c.say(-40)).toBe('0 €');
  });

  it('holds still rather than guessing at a figure it cannot take apart', () => {
    // A decimal, two separators, and no digits at all. Each would have to be
    // re-spelled to count, and a creative that flickers between two spellings of
    // its own price is worse than one whose price simply does not move.
    for (const text of ['3.532,50 €', '1,5 %', 'ab 890 bis 3.532 €', 'kostenlos']) {
      const c = counterFor(text);
      expect(c.value, text).toBeNull();
      expect(c.say(10), text).toBe(text);
    }
  });
});
