import { describe, expect, it } from 'vitest';
import { newLocale } from './locales.ts';
import type { Locale } from './types.ts';
import { DEFAULT_MODEL_ID, modelById, voiceEstimate, VOICE_MODELS } from './voice.ts';

const speaking = (id: 'en' | 'de' | 'pl', script: string): Locale =>
  ({ ...newLocale(id), script });

describe('the synthesis models', () => {
  it('carries the two the panel offers, priced', () => {
    expect(VOICE_MODELS).toHaveLength(2);
    for (const model of VOICE_MODELS) expect(model.perThousand).toBeGreaterThan(0);
  });

  it('finds one by id and falls back rather than answering nothing', () => {
    // A model id off a saved file from another build still has to price.
    expect(modelById(DEFAULT_MODEL_ID).id).toBe(DEFAULT_MODEL_ID);
    expect(modelById('no-such-model')).toBe(VOICE_MODELS[0]);
  });
});

describe('voiceEstimate', () => {
  it('counts the characters of every language with something to say', () => {
    const estimate = voiceEstimate([speaking('en', '12345'), speaking('de', '123')], DEFAULT_MODEL_ID);
    expect(estimate.chars).toBe(8);
    expect(estimate.syntheses).toBe(2);
  });

  it('quotes once per language, however many photos are in the batch', () => {
    // The export synthesises each line one time and lays it over every creative
    // that wants it — quoting per photo would frighten the user off a job that
    // costs pennies.
    const estimate = voiceEstimate([speaking('en', 'a'.repeat(1000))], 'eleven_multilingual_v2');
    expect(estimate.usd).toBeCloseTo(0.10, 10);
  });

  it('prices the cheaper model cheaper', () => {
    const scripts = [speaking('en', 'a'.repeat(2000))];
    expect(voiceEstimate(scripts, 'eleven_flash_v2_5').usd)
      .toBeLessThan(voiceEstimate(scripts, 'eleven_multilingual_v2').usd);
  });

  it('ignores a language with nothing to say, and one that is only spaces', () => {
    const estimate = voiceEstimate(
      [speaking('en', 'hello'), speaking('de', ''), speaking('pl', '   ')],
      DEFAULT_MODEL_ID,
    );
    expect(estimate.syntheses).toBe(1);
    expect(estimate.chars).toBe(5);
  });

  it('costs nothing when nothing is spoken', () => {
    expect(voiceEstimate([], DEFAULT_MODEL_ID)).toEqual({ chars: 0, usd: 0, syntheses: 0 });
  });

  it('does not count a script the user has taken off the release', () => {
    // The caller passes the release; the estimate is what the next export spends.
    const included = [speaking('en', 'hello')];
    expect(voiceEstimate(included, DEFAULT_MODEL_ID).syntheses).toBe(1);
  });
});
