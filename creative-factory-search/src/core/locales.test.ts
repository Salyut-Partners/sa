import { describe, expect, it } from 'vitest';
import {
  activeLocale, availableLocales, editedFieldCount, isLocaleId, localeDir, LOCALE_ENGLISH,
  LOCALE_IDS, LOCALE_NAMES, newLocale, pendingTranslation, releaseLocales,
} from './locales.ts';
import { apply, createProject } from './project.ts';
import type { LocaleId, Project } from './types.ts';

const withLocales = (...ids: readonly LocaleId[]): Project =>
  ids.reduce((p, id) => apply(p, { type: 'locale/add', id }), createProject());

describe('the languages the phrase book is written for', () => {
  it('carries the twelve the contract names', () => {
    expect([...LOCALE_IDS])
      .toEqual(['en', 'de', 'it', 'es', 'fr', 'nl', 'pl', 'tr', 'sv', 'pt', 'he', 'hu']);
  });

  it('names every one of them', () => {
    for (const id of LOCALE_IDS) expect(LOCALE_NAMES[id], id).toBeTruthy();
  });

  it('names every one of them in English too, for the translator', () => {
    for (const id of LOCALE_IDS) expect(LOCALE_ENGLISH[id], id).toBeTruthy();
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

describe('which way a language is read', () => {
  it('answers for every language on the list', () => {
    // Not a lookup that can be silent: the frame writes whatever comes back
    // into its `dir`, and a language this could not answer for would be laid
    // out left to right without anything having gone visibly wrong.
    for (const id of LOCALE_IDS) expect(['ltr', 'rtl'], id).toContain(localeDir(id));
  });

  it('reads Hebrew right to left and the other eleven left to right', () => {
    expect(localeDir('he')).toBe('rtl');
    expect(LOCALE_IDS.filter(id => localeDir(id) === 'rtl')).toEqual(['he']);
  });

  it('does not turn a language round for being written in its own script', () => {
    // The trap this is here for: Hebrew is the language whose *name* is also in
    // Hebrew, and a direction guessed from the label rather than named would
    // make every language that renames itself right-to-left by accident.
    expect(LOCALE_NAMES.he).toBe('עברית');
    expect(localeDir('tr')).toBe('ltr');
    expect(localeDir('hu')).toBe('ltr');
    expect(localeDir('pt')).toBe('ltr');
  });
});

describe('a language joining a project', () => {
  it('opens silent, in the release, and saying what the dictionary says', () => {
    expect(newLocale('de')).toEqual({
      id: 'de', script: '', voiceId: null, include: true, subtitles: true, overrides: {},
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
    expect(availableLocales(withLocales('de')))
      .toEqual(['it', 'es', 'fr', 'nl', 'pl', 'tr', 'sv', 'pt', 'he', 'hu']);
  });

  it('offers nothing once every language is in', () => {
    // Read off the release list rather than written out again: a thirteenth
    // language named in one place and forgotten here would leave this passing
    // while it went on being offered to a project that already carried it.
    expect(availableLocales(withLocales(...LOCALE_IDS))).toEqual([]);
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

describe('what the export translates before it renders', () => {
  const scripted = (p: Project, id: LocaleId, script: string): Project =>
    apply(p, { type: 'locale/patch', id, patch: { script } });
  const translated = (p: Project, id: LocaleId, script: string, from: { id: LocaleId; script: string }): Project =>
    apply(p, { type: 'locale/write', writes: [{ id, script, translatedFrom: from }] });

  it('is the script on screen into every language going out that has none', () => {
    const p = scripted(withLocales('de', 'fr'), 'en', ' Apply now ');
    expect(pendingTranslation(p)).toEqual({ source: 'en', script: 'Apply now', targets: ['de', 'fr'] });
  });

  it('is nothing when every language going out has its script, or no script is written anywhere', () => {
    expect(pendingTranslation(withLocales('de'))).toBeNull();
    let p = scripted(withLocales('de'), 'en', 'Apply now');
    p = translated(p, 'de', 'Jetzt bewerben', { id: 'en', script: 'Apply now' });
    expect(pendingTranslation(p)).toBeNull();
  });

  it('redoes a translation whose source changed since, and leaves one the buyer corrected by hand', () => {
    let p = scripted(withLocales('de', 'fr'), 'en', 'Apply now');
    p = translated(p, 'de', 'Jetzt bewerben', { id: 'en', script: 'Apply now' });
    p = translated(p, 'fr', 'Postulez', { id: 'en', script: 'Apply now' });
    p = scripted(p, 'fr', 'Postulez maintenant');
    p = scripted(p, 'en', 'Apply today');
    expect(pendingTranslation(p)).toEqual({ source: 'en', script: 'Apply today', targets: ['de'] });
  });

  it('skips a language left out of the export', () => {
    let p = scripted(withLocales('de', 'fr'), 'en', 'Apply now');
    p = apply(p, { type: 'locale/patch', id: 'fr', patch: { include: false } });
    expect(pendingTranslation(p)?.targets).toEqual(['de']);
  });

  it('takes the source from a language written by hand when the one on screen is a translation', () => {
    let p = scripted(withLocales('de'), 'en', 'Apply now');
    p = translated(p, 'de', 'Jetzt bewerben', { id: 'en', script: 'Apply now' });
    p = apply(p, { type: 'locale/add', id: 'it' });
    p = apply(p, { type: 'locale/activate', id: 'de' });
    expect(pendingTranslation(p)).toEqual({ source: 'en', script: 'Apply now', targets: ['it'] });
  });
});
