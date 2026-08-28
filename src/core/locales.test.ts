import { describe, expect, it } from 'vitest';
import {
  activeLocale, availableLocales, editedFieldCount, isLocaleId, LOCALE_IDS, LOCALE_NAMES,
  newLocale, releaseLocales,
} from './locales.ts';
import { apply, createProject } from './project.ts';
import type { LocaleId, Project } from './types.ts';

const withLocales = (...ids: LocaleId[]): Project =>
  ids.reduce((p, id) => apply(p, { type: 'locale/add', id }), createProject());

describe('the languages the phrase book is written for', () => {
  it('carries the seven the contract names', () => {
    expect([...LOCALE_IDS]).toEqual(['en', 'de', 'it', 'es', 'fr', 'nl', 'pl']);
  });

  it('names every one of them', () => {
    for (const id of LOCALE_IDS) expect(LOCALE_NAMES[id], id).toBeTruthy();
  });

  it('recognises its own ids and nothing else', () => {
    expect(isLocaleId('de')).toBe(true);
    // The gate a saved file passes through: a language this build has never
    // heard of must not reach the model as one.
    expect(isLocaleId('kl')).toBe(false);
    expect(isLocaleId('')).toBe(false);
    expect(isLocaleId(7)).toBe(false);
  });
});

describe('a language joining a project', () => {
  it('opens silent, in the release, and saying what the dictionary says', () => {
    expect(newLocale('de')).toEqual({
      id: 'de', script: '', voiceId: null, include: true, overrides: {},
    });
  });
});

describe('activeLocale', () => {
  it('is the one the grid is showing', () => {
    expect(activeLocale(withLocales('de')).id).toBe('de');
  });

  it('falls back to the first rather than to nothing', () => {
    // Every text on the frame is read out of a locale, so each of the callers
    // from the preview down to buildSpec would otherwise invent its own
    // fallback — seven chances to invent a different one.
    const project: Project = { ...createProject(), activeLocale: 'pl' };
    expect(activeLocale(project).id).toBe('en');
  });

  it('answers even for a project holding no languages at all', () => {
    const project: Project = { ...createProject(), locales: [], activeLocale: 'pl' };
    expect(activeLocale(project).id).toBe('en');
  });
});

describe('releaseLocales', () => {
  it('is the ones ticked for export, in the order they were added', () => {
    const project = apply(withLocales('de', 'pl'), {
      type: 'locale/patch', id: 'de', patch: { include: false },
    });
    expect(releaseLocales(project).map(l => l.id)).toEqual(['en', 'pl']);
  });

  it('can be empty — a batch nobody has ticked a language for', () => {
    const project = apply(createProject(), {
      type: 'locale/patch', id: 'en', patch: { include: false },
    });
    expect(releaseLocales(project)).toEqual([]);
  });
});

describe('availableLocales', () => {
  it('offers only what the project does not already carry', () => {
    expect(availableLocales(withLocales('de'))).toEqual(['it', 'es', 'fr', 'nl', 'pl']);
  });

  it('offers nothing once every language is in', () => {
    expect(availableLocales(withLocales('de', 'it', 'es', 'fr', 'nl', 'pl'))).toEqual([]);
  });
});

describe('editedFieldCount', () => {
  it('counts what the translate button would carry across', () => {
    let project = apply(withLocales('de'), {
      type: 'locale/field', id: 'de', key: 'cta', value: 'JETZT',
    });
    project = apply(project, { type: 'locale/field', id: 'de', key: 'headline', value: 'Von Hand' });
    expect(editedFieldCount(project)).toBe(2);
  });

  it('counts the language on screen and not the others', () => {
    const project = apply(withLocales('de'), {
      type: 'locale/field', id: 'en', key: 'cta', value: 'MINE',
    });
    expect(project.activeLocale).toBe('de');
    expect(editedFieldCount(project)).toBe(0);
  });
});
