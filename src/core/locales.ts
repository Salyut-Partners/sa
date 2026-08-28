// The release languages: which ones exist, what a fresh one holds, and how the
// project's list is read. The phrase book next door says what each one *says*;
// this file is about the language as a thing the user adds and removes.
import { FLAGS } from './phrasebook.ts';
import type { Locale, LocaleId, Project } from './types.ts';

/** Every language the phrase book is written for, in the order the bar shows them. */
export const LOCALE_IDS: readonly LocaleId[] = ['en', 'de', 'it', 'es', 'fr', 'nl', 'pl'];

/**
 * What each one is called, in itself. A media buyer picking a geo reads the
 * language's own name faster than a translation of it.
 */
export const LOCALE_NAMES: Record<LocaleId, string> = {
  en: 'English',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español',
  fr: 'Français',
  nl: 'Nederlands',
  pl: 'Polski',
};

/** What each one is called in English, for a translator that wants prose. */
export const LOCALE_ENGLISH: Record<LocaleId, string> = {
  en: 'English', de: 'German', it: 'Italian', es: 'Spanish',
  fr: 'French', nl: 'Dutch', pl: 'Polish',
};

export const isLocaleId = (value: unknown): value is LocaleId =>
  typeof value === 'string' && (LOCALE_IDS as readonly string[]).includes(value);

export const localeLabel = (id: LocaleId): string => `${FLAGS[id]} ${LOCALE_NAMES[id]}`;

/**
 * A language as it joins a project: silent, in the export, and saying exactly
 * what the dictionary says. Nothing is copied across from the language beside
 * it — a German creative that opened holding English text would be a creative
 * shipped in the wrong language by default.
 */
export const newLocale = (id: LocaleId): Locale => ({
  id,
  script: '',
  voiceId: null,
  include: true,
  overrides: {},
});

export const localeById = (project: Project, id: LocaleId): Locale | null =>
  project.locales.find(l => l.id === id) ?? null;

/**
 * The language the grid is showing.
 *
 * Never null: a project always has at least one language, and every caller from
 * the preview down to `buildSpec` would otherwise have to invent a fallback of
 * its own — seven chances to invent a different one.
 */
export const activeLocale = (project: Project): Locale =>
  localeById(project, project.activeLocale) ?? project.locales[0] ?? newLocale('en');

/**
 * How many fields the language on screen has had written over by hand.
 *
 * The number the translate button shows: it is what would be carried across, and
 * a zero says the batch is still following the dictionary everywhere.
 */
export const editedFieldCount = (project: Project): number =>
  Object.keys(activeLocale(project).overrides).length;

/** The languages this export will produce, in the order they were added. */
export const releaseLocales = (project: Project): Locale[] =>
  project.locales.filter(l => l.include);

/** Which languages could still be added — the bar offers these and no others. */
export const availableLocales = (project: Project): LocaleId[] => {
  const taken = new Set(project.locales.map(l => l.id));
  return LOCALE_IDS.filter(id => !taken.has(id));
};
