import { describe, expect, it } from 'vitest';
import { guessNiche } from './niche.ts';

/** The dropdown the team's ClickUp list carries today. */
const OPTIONS = ['Jobs', 'Credits', 'E-commerce'];

describe('guessNiche', () => {
  it('reads the niche out of a run-together topic name, and answers the option as the list spells it', () => {
    expect(guessNiche('NewEraVadimJobsEU', OPTIONS)).toBe('Jobs');
    expect(guessNiche('888VLADAutoLoansFR', OPTIONS)).toBe('Credits');
    expect(guessNiche('NewEraVadimEcomUS', OPTIONS)).toBe('E-commerce');
  });

  it('knows the word in the languages a buyer names a topic in', () => {
    expect(guessNiche('AIarbeitDEwh', OPTIONS)).toBe('Jobs');
    expect(guessNiche('AIkreditPLnow', OPTIONS)).toBe('Credits');
  });

  it('matches an option by its own name even when no words are listed for it', () => {
    expect(guessNiche('AIdentalUKcare', ['Dental', 'Jobs'])).toBe('Dental');
  });

  it('is null when nothing in the name says a niche', () => {
    expect(guessNiche('AMivfSE', OPTIONS)).toBeNull();
    expect(guessNiche('AIjobsDEwh', [])).toBeNull();
    expect(guessNiche('', OPTIONS)).toBeNull();
  });

  it('leaves a name that says two niches to the buyer rather than picking by order', () => {
    expect(guessNiche('AIjobsAndLoansDE', OPTIONS)).toBeNull();
  });
});
