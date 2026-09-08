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
  /**
   * Whether the user may slide the layout up and down the frame.
   *
   * Absent means no, which is the answer for every layout that darkens the
   * whole picture behind itself. Their scrim is the frame, so moving them
   * drags the shading off one edge and leaves the other bare — a control that
   * only breaks the thing it moves. A strip that carries its own background
   * and no scrim can sit anywhere over the photo, and says so here.
   */
  movable?: boolean;
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

/**
 * The same offer stated straight onto the photo, so it asks for the half of the
 * card that fits beside a picture: no vacancy list, no shifts, no disclaimer.
 *
 * Narrowed from the card schema rather than written out, because these are the
 * cards' own keys and not lookalikes of them. A schema decides which fields the
 * panel offers and which reach the frame — never where a value is kept — so a
 * headline typed on a card is the same `headline` here, and switching a photo
 * between the two layouts asks the user to retype nothing.
 */
const SCRIM_KEEPS: ReadonlySet<string> = new Set([
  'eyebrow', 'headline', 'flag', 'age', 'audience',
  'rate', 'cur', 'unitTop', 'unitBot', 'perks', 'cta',
]);
const SCRIM_FIELDS: FieldSchema = JOB_FIELDS.filter(f => SCRIM_KEEPS.has(f.key));

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

/**
 * The bands on their own, with nothing above them.
 *
 * The donor layout states a whole offer and ends on these rows; this is the
 * rows and only the rows, to be laid over a photograph that is already saying
 * the rest. Narrowed from the donor schema for the reason the scrim layout is
 * narrowed from the card: these are the donor layout's own keys, not lookalikes
 * of them, so bands typed on one appear on the other and swapping between the
 * two costs the user nothing.
 */
const TIER_KEEPS: ReadonlySet<string> = new Set(['donorTiers', 'donorCta']);

const TIER_FIELDS: FieldSchema = DONOR_FIELDS.filter(f => TIER_KEEPS.has(f.key));

/**
 * The payment offer: a question for a headline, one figure, and the slider that
 * picks it. Its own schema — it shares no field with the job or donor calls,
 * because it is asking about a purchase rather than about work.
 *
 * `payMin` and `payMax` are the two ends of the slider and `payRate` is where it
 * sits, so the three are read as numbers by the layout and not only printed. A
 * user who raises the payment past the top of the scale gets the knob pinned to
 * the end rather than a slider pointing off the card.
 */
const PAYMENT_FIELDS: FieldSchema = [
  { key: 'payHead', label: 'Заголовок', kind: 'line' },
  { key: 'payHeadAccent', label: 'Заголовок, акцент', kind: 'line' },
  { key: 'paySub', label: 'Підзаголовок', kind: 'text' },
  { key: 'payRateLabel', label: 'Підпис платежу', kind: 'line' },
  { key: 'payRate', label: 'Платіж', kind: 'line' },
  { key: 'paySliderLabel', label: 'Підпис повзунка', kind: 'line' },
  { key: 'payMin', label: 'Мінімум шкали', kind: 'line' },
  { key: 'payMax', label: 'Максимум шкали', kind: 'line' },
  { key: 'payCta', label: 'Напис на кнопці', kind: 'line' },
  { key: 'paySwipe', label: 'Підказка внизу', kind: 'line' },
];

/**
 * The airport strip carries two fields and no more, because everything else it
 * would have said is already in the photograph: the headline and the rate are
 * printed into the scene when the picture is generated. What is left is the half
 * that has to stay editable per batch and per language — the perks and the line
 * that keeps the creative on the right side of a job-advert rule.
 *
 * Its own keys rather than the cards' `perks` and `disclaimer`, though it asks
 * the same two questions. A card's perks are the long claims that answer "why
 * this job" over a whole sheet of white; these are four words that have to fit a
 * strip 240px tall, and the disclaimer here is one short line rather than the
 * cards' paragraph. Sharing the keys would mean one of the two layouts always
 * showing copy written for the other.
 */
const AVIA_FIELDS: FieldSchema = [
  { key: 'aviaPerks', label: 'Переваги', kind: 'list' },
  { key: 'aviaDisclaimer', label: 'Дисклеймер', kind: 'text' },
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
    id: 'jobs-scrim',
    label: 'Вакансія · затемнення',
    schema: SCRIM_FIELDS,
    // The copy is the frame here rather than a panel laid over it, so it builds
    // itself from the first beat like the row stacks do, not after a pause.
    defaultTiming: { ...OPENS },
  },
  {
    id: 'avia-strip',
    label: 'Аеропорт · смуга',
    schema: AVIA_FIELDS,
    // A strip is not the frame's subject — the photograph is, and it already
    // carries the headline. So it draws itself in from the first beat rather
    // than making the viewer wait for a panel to land.
    defaultTiming: { ...OPENS },
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
  {
    id: 'tier-rows',
    label: 'Смуги груп',
    schema: TIER_FIELDS,
    // Rows and nothing else, so they build themselves in from the first beat
    // like the other stacks rather than making the viewer wait for a panel.
    defaultTiming: { ...OPENS },
    // The one layout in the library that carries no scrim: each row is its own
    // opaque strip, so the picture around it is untouched and the stack can sit
    // wherever on the frame the photograph leaves room for it.
    movable: true,
  },
  {
    id: 'rate-slider',
    label: 'Платіж · повзунок',
    schema: PAYMENT_FIELDS,
    // The headline is the frame's first word, and the slider needs room to run
    // before the video is over, so it opens rather than lands.
    defaultTiming: { ...OPENS },
  },
];

export const templateById = (id: string): TemplateInfo | null =>
  TEMPLATES.find(t => t.id === id) ?? null;

/**
 * Whether this layout may be slid up and down the frame. A layout the library
 * no longer carries answers no, which is the safe answer: an offset nobody can
 * see to undo is worse than a layout that simply sits where it was drawn.
 */
export const templateMoves = (id: string): boolean => templateById(id)?.movable === true;


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
