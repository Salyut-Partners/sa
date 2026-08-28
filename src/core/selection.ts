// Reading a field for a set of photos. Broadcast is one mechanism rather than a
// branch inside every control: the panel asks for a field over the selection and
// gets back either a value it can show or `mixed`, and it writes through the same
// commands whichever it got.
import { toText } from './fields.ts';
import { DEFAULT_LOCALE } from './phrasebook.ts';
import { photoById } from './project.ts';
import { fieldValue } from './templates.ts';
import type { ButtonLayer, Photo, Project, Rect, TemplateLayer, Timing } from './types.ts';

/**
 * What the selection agrees on. `mixed` is a first-class answer, not a null:
 * showing one photo's value while three others disagree is a lie the user then
 * makes decisions on.
 */
export type Shared<T> = { mixed: true } | { mixed: false; value: T };

const MIXED: Shared<never> = { mixed: true };

/**
 * Fields a single control can show, and which therefore compare by identity.
 * Rect and Timing are deliberately outside it: two equal rects are different
 * objects, so asking for one here would answer `mixed` every time — a bug the
 * compiler can refuse instead of the user discovering it.
 */
type FlatKeys<T> = {
  [K in keyof T]: T[K] extends string | number | boolean | null ? K : never;
}[keyof T];

export function shared<T>(values: readonly T[]): Shared<T> {
  const [first, ...rest] = values;
  // No values means nothing to agree on — the same "don't show a number" answer
  // the panel already knows how to render.
  if (values.length === 0) return MIXED;
  return rest.every(v => Object.is(v, first)) ? { mixed: false, value: first as T } : MIXED;
}

export function photoField<K extends FlatKeys<Photo>>(
  project: Project,
  ids: readonly string[],
  key: K,
): Shared<Photo[K]> {
  const photos = ids.map(id => photoById(project, id));
  if (photos.some(p => p === null)) return MIXED;
  return shared(photos.map(p => p![key]));
}

/**
 * The button at one slot across the selection, or nothing if some photo does
 * not have that slot. A photo without the slot disagrees with one that has it —
 * the honest answer is mixed, and the panel then offers to write the value onto
 * all of them.
 */
function buttonsAt(
  project: Project,
  ids: readonly string[],
  index: number,
): readonly ButtonLayer[] | null {
  const buttons = ids.map(id => photoById(project, id)?.buttons[index]);
  return buttons.every((b): b is ButtonLayer => b !== undefined) ? buttons : null;
}

export function buttonField<K extends FlatKeys<ButtonLayer>>(
  project: Project,
  ids: readonly string[],
  index: number,
  key: K,
): Shared<ButtonLayer[K]> {
  const buttons = buttonsAt(project, ids, index);
  return buttons === null ? MIXED : shared(buttons.map(b => b[key]));
}

/**
 * One coordinate of a button, not the whole rect. Geometry and timing are read a
 * number at a time for the same reason the flat fields are: the panel puts each
 * one in its own box, and two equal rects are still two objects — comparing them
 * whole would answer mixed for a selection that agrees.
 */
export function buttonRectField<K extends FlatKeys<Rect>>(
  project: Project,
  ids: readonly string[],
  index: number,
  key: K,
): Shared<Rect[K]> {
  const buttons = buttonsAt(project, ids, index);
  return buttons === null ? MIXED : shared(buttons.map(b => b.rect[key]));
}

export function buttonTimingField<K extends FlatKeys<Timing>>(
  project: Project,
  ids: readonly string[],
  index: number,
  key: K,
): Shared<Timing[K]> {
  const buttons = buttonsAt(project, ids, index);
  return buttons === null ? MIXED : shared(buttons.map(b => b.timing[key]));
}

/**
 * How many buttons the selection has, or `mixed`. Buttons line up by slot across
 * photos, so a selection that disagrees on the count is one where slot 2 means
 * two different things — worth saying before a broadcast lands on it.
 */
export function buttonCount(project: Project, ids: readonly string[]): Shared<number> {
  const photos = ids.map(id => photoById(project, id));
  if (photos.some(p => p === null)) return MIXED;
  return shared(photos.map(p => p!.buttons.length));
}


// ---------------------------------------------------------------- template --

/**
 * What "no template" is called in the library and in a shared value. A sentinel
 * rather than null so the choice reads as one list of options — the absence of
 * a template is a thing the user picks, not a thing that failed to be picked.
 */
export const NO_TEMPLATE = '';

export function templateChoice(project: Project, ids: readonly string[]): Shared<string> {
  const photos = ids.map(id => photoById(project, id));
  if (photos.some(p => p === null)) return MIXED;
  return shared(photos.map(p => p!.template?.definitionId ?? NO_TEMPLATE));
}

const templatesOf = (
  project: Project,
  ids: readonly string[],
): readonly TemplateLayer[] | null => {
  const layers = ids.map(id => photoById(project, id)?.template);
  return layers.every((l): l is TemplateLayer => l != null) ? layers : null;
};

/**
 * The text a box shows for one field: what was typed, or what the dictionary
 * says when nothing was — the same merge the frame is built through, so the box
 * and the video never disagree about what the creative says. Always text, lists
 * included: the panel edits a list a line at a time, and one control that reads
 * every kind is why mixed only had to be solved once.
 */
export function templateText(
  project: Project,
  ids: readonly string[],
  key: string,
): Shared<string> {
  const layers = templatesOf(project, ids);
  if (layers === null) return MIXED;
  return shared(layers.map(layer => toText(fieldValue(layer, key, DEFAULT_LOCALE))));
}

/**
 * Whether the field was written by hand rather than left to the dictionary.
 *
 * One edited photo makes the whole selection edited: the mark exists to warn
 * that the batch has drifted from the phrase book, and a drift in one of four
 * photos is exactly the case worth marking.
 */
export function templateEdited(
  project: Project,
  ids: readonly string[],
  key: string,
): boolean {
  const layers = templatesOf(project, ids);
  return layers !== null && layers.some(layer => key in layer.values);
}

export function templateTimingField<K extends FlatKeys<Timing>>(
  project: Project,
  ids: readonly string[],
  key: K,
): Shared<Timing[K]> {
  const layers = templatesOf(project, ids);
  return layers === null ? MIXED : shared(layers.map(l => l.timing[key]));
}
