// The release languages: which ones exist, what a fresh one holds, and how the
// project's list is read. The phrase book next door says what each one *says*;
// this file is about the language as a thing the user adds and removes.
import { FLAGS } from './phrasebook.ts';
import type { Locale, LocaleId, Project, TranslatedFrom } from './types.ts';

/** Every language the phrase book is written for, in the order the bar shows them. */
export const LOCALE_IDS: readonly LocaleId[] =
  ['en', 'de', 'it', 'es', 'fr', 'nl', 'pl', 'tr', 'sv', 'pt', 'he', 'hu'];

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
  tr: 'Türkçe',
  sv: 'Svenska',
  pt: 'Português',
  he: 'עברית',
  hu: 'Magyar',
};

/** What each one is called in English, for a translator that wants prose. */
export const LOCALE_ENGLISH: Record<LocaleId, string> = {
  en: 'English', de: 'German', it: 'Italian', es: 'Spanish',
  fr: 'French', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', sv: 'Swedish',
  // European Portuguese. Named rather than left as "Portuguese" because the
  // geo is Portugal and the two varieties differ on exactly the words an advert
  // is made of — a Brazilian "you" in a Lisbon creative is the same class of
  // mistake as the wrong currency.
  pt: 'European Portuguese (Portugal)', he: 'Hebrew', hu: 'Hungarian',
};

/**
 * Which way a language is read.
 *
 * Almost everything here is a property of the words; this one is a property of
 * the page. Hebrew is the first language in the set that is read right to left,
 * and the frame has to say so — otherwise the browser lays a Hebrew sentence out
 * inside a left-to-right paragraph and its full stop comes out at the wrong end.
 * The layouts mirror off the same flag, so the list is here rather than in the
 * renderer: it is the language that is right-to-left, not the stylesheet.
 */
const RTL: ReadonlySet<LocaleId> = new Set<LocaleId>(['he']);

export const localeDir = (id: LocaleId): 'ltr' | 'rtl' => RTL.has(id) ? 'rtl' : 'ltr';

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
  include: true,
  subtitles: true,
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

/**
 * What the export translates before it renders: the script the buyer wrote,
 * and the languages going out whose script is empty or was translated from
 * words that have changed since. The source is the language the translations
 * already came from, while it is still written by hand — so correcting one
 * translation does not make it the source of the rest — else the language on
 * screen, else the first written by hand. A script written or corrected by
 * hand is the buyer's and is never sent over. Null when there is nothing to
 * translate.
 */
export function pendingTranslation(project: Project): { source: LocaleId; script: string; targets: LocaleId[] } | null {
  const written = (l: Locale): boolean => l.script.trim() !== '' && (l.translatedFrom ?? null) === null;
  const origins = project.locales.flatMap(l => (l.translatedFrom == null ? [] : [l.translatedFrom.id]));
  const origin = project.locales
    .filter(l => written(l) && origins.includes(l.id))
    .sort((a, b) => origins.filter(id => id === b.id).length - origins.filter(id => id === a.id).length)[0];
  const active = project.locales.find(l => l.id === project.activeLocale);
  const source = origin ?? (active !== undefined && written(active) ? active : project.locales.find(written));
  if (source === undefined) return null;
  const script = source.script.trim();
  const stale = (from: TranslatedFrom | null | undefined): boolean =>
    from != null && (from.id !== source.id || from.script !== script);
  const targets = releaseLocales(project)
    .filter(l => l.id !== source.id && (l.script.trim() === '' || stale(l.translatedFrom)))
    .map(l => l.id);
  return targets.length === 0 ? null : { source: source.id, script, targets };
}

/** Which languages could still be added — the bar offers these and no others. */
export const availableLocales = (project: Project): LocaleId[] => {
  const taken = new Set(project.locales.map(l => l.id));
  return LOCALE_IDS.filter(id => !taken.has(id));
};
