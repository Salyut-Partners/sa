// The template catalogue: which templates exist, what fields each one carries,
// and when it arrives by default.
//
// It lives in the core because the model has to know a template's fields to
// merge them with the dictionary, and the core may not know about the DOM. The
// drawing half of each record is in the renderer under the same id — adding a
// template is a record here and a record there, and nothing in the editor.
import { blankFor, toText, type Field, type FieldKind, type FieldSchema } from './fields.ts';
import { phrase } from './phrasebook.ts';
import type { FieldValue, Locale, Timing } from './types.ts';

export interface TemplateInfo {
  id: string;
  /** What the library calls it. */
  label: string;
  schema: FieldSchema;
  /**
   * When it arrives, before the user says otherwise. A panel is the frame's
   * subject rather than a decoration on it, so it holds a beat and then lands —
   * unlike a button, which is there from the start unless told not to be.
   */
  defaultTiming: Timing;
}

/**
 * The offer, as the three card versions all state it. They share this because
 * they are one offer in three layouts: switching between them must not ask the
 * user to type the vacancy list again.
 */
const JOB_FIELDS: FieldSchema = [
  { key: 'eyebrow', label: 'Надзаголовок', kind: 'line' },
  { key: 'headline', label: 'Заголовок', kind: 'line' },
  { key: 'flag', label: 'Прапор', kind: 'line' },
  { key: 'age', label: 'Вік', kind: 'line' },
  { key: 'audience', label: 'Аудиторія', kind: 'line' },
  { key: 'rate', label: 'Ставка', kind: 'line' },
  { key: 'cur', label: 'Валюта', kind: 'line' },
  { key: 'unitTop', label: 'Одиниця, верхній рядок', kind: 'line' },
  { key: 'unitBot', label: 'Одиниця, нижній рядок', kind: 'line' },
  { key: 'jobsLabel', label: 'Підпис списку вакансій', kind: 'line' },
  { key: 'jobs', label: 'Вакансії', kind: 'list' },
  { key: 'shiftsLabel', label: 'Підпис змін', kind: 'line' },
  { key: 'shifts', label: 'Зміни', kind: 'list' },
  { key: 'perks', label: 'Переваги', kind: 'list' },
  { key: 'cta', label: 'Заклик', kind: 'line' },
  { key: 'disclaimer', label: 'Дисклеймер', kind: 'text' },
];

/** The banner states the offer in three lines, so it asks for three fields. */
const BANNER_FIELDS: FieldSchema = [
  { key: 'headline', label: 'Заголовок', kind: 'line' },
  { key: 'jobs', label: 'Вакансії', kind: 'list' },
  { key: 'linkLine', label: 'Нижній рядок', kind: 'line' },
];

const RATES_FIELDS: FieldSchema = [
  { key: 'ratesHead', label: 'Заголовок', kind: 'line' },
  { key: 'ratesAccent', label: 'Слово акцентом', kind: 'line' },
  { key: 'rates', label: 'Ставки', kind: 'list' },
  { key: 'linkLine', label: 'Нижній рядок', kind: 'line' },
];

/**
 * The donor call: a two-line title, the claims that answer "is this real", one
 * pledge, and the age bands the offer is split into.
 *
 * Its own schema rather than a share of JOB_FIELDS: this is a different offer,
 * not a fourth layout of the same one. A donor creative has no rate, no shifts
 * and no vacancy list, and folding it into the job schema would put nine dead
 * fields in the panel for every one it uses.
 */
const DONOR_FIELDS: FieldSchema = [
  { key: 'donorTop', label: 'Заголовок, верхній рядок', kind: 'line' },
  { key: 'donorBottom', label: 'Заголовок, нижній рядок', kind: 'line' },
  { key: 'donorBadges', label: 'Переваги', kind: 'list' },
  { key: 'donorPledge', label: 'Обіцянка', kind: 'line' },
  { key: 'donorPledgeAccent', label: 'Обіцянка, акцент', kind: 'line' },
  { key: 'donorTiers', label: 'Вікові групи', kind: 'list' },
  { key: 'donorCta', label: 'Напис на кнопці', kind: 'line' },
];

const LANDS: Timing = { appearAt: 0.3, hideAt: null, enter: 'none', enterDuration: 0.9 };
/** The row banners build themselves a row at a time, so they open on the frame. */
const OPENS: Timing = { appearAt: 0, hideAt: null, enter: 'none', enterDuration: 0.6 };

export const TEMPLATES: readonly TemplateInfo[] = [
  {
    id: 'jobs-banner',
    label: 'Банер вакансій',
    schema: BANNER_FIELDS,
    defaultTiming: { ...OPENS },
  },
  {
    id: 'jobs-card-pills',
    label: 'Картка · пігулки',
    schema: JOB_FIELDS,
    defaultTiming: { ...LANDS },
  },
  {
    id: 'jobs-card-panel',
    label: 'Картка · панель',
    schema: JOB_FIELDS,
    defaultTiming: { ...LANDS },
  },
  {
    id: 'jobs-card-sheet',
    label: 'Картка · розгортка',
    schema: JOB_FIELDS,
    // The sheet unrolls from the top, and an unroll takes longer to read than a rise.
    defaultTiming: { ...LANDS, appearAt: 0.5, enterDuration: 1.1 },
  },
  {
    id: 'rates',
    label: 'Список ставок',
    schema: RATES_FIELDS,
    defaultTiming: { ...OPENS },
  },
  {
    id: 'donor-tiers',
    label: 'Донорство · вікові групи',
    schema: DONOR_FIELDS,
    // Built a row at a time from the top, like the other row stacks.
    defaultTiming: { ...OPENS },
  },
];

export const templateById = (id: string): TemplateInfo | null =>
  TEMPLATES.find(t => t.id === id) ?? null;


/**
 * What one field says, in one language.
 *
 * The order is the whole design: what the user typed, under what the dictionary
 * says, under a blank of the field's own kind. A field nobody touched follows
 * the dictionary into whatever language is asked for — which is why a locale
 * holds edits only, and never a copy of the phrase it started from.
 */
export function fieldValue(locale: Locale, key: string, kind: FieldKind = 'line'): FieldValue {
  const typed = locale.overrides[key];
  if (typed !== undefined) return typed;
  return phrase(locale.id, key) ?? blankFor(kind);
}

/** Whether the field was written by hand rather than left to the dictionary. */
export const fieldEdited = (locale: Locale, key: string): boolean => key in locale.overrides;

/**
 * What a box in the panel shows for one field. Always text, lists included: the
 * panel edits a list a line at a time, and one control that reads every kind is
 * one control to keep honest.
 */
export const fieldText = (locale: Locale, field: Field): string =>
  toText(fieldValue(locale, field.key, field.kind));

/**
 * Every field of a template, resolved — nothing left for the renderer to look up.
 *
 * Only the template's own: an override left behind by a layout the photo used to
 * wear stays in the locale, so swapping back restores it, but it is not a field
 * of this template and has no business reaching the frame.
 */
export function templateFields(
  definitionId: string,
  locale: Locale,
): Record<string, FieldValue> {
  const info = templateById(definitionId);
  if (info === null) return {};
  return Object.fromEntries(info.schema.map(f => [f.key, fieldValue(locale, f.key, f.kind)]));
}
