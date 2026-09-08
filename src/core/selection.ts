// Reading a field for a set of photos. Broadcast is one mechanism rather than a
// branch inside every control: the panel asks for a field over the selection and
// gets back either a value it can show or `mixed`, and it writes through the same
// commands whichever it got.
import { photoById } from './project.ts';
import type {
  ButtonLayer, Photo, Project, PropLayer, Rect, TemplateLayer, Timing,
} from './types.ts';

/**
 * What the selection agrees on. `mixed` is a first-class answer, not a null:
 * showing one photo's value while three others disagree is a lie the user then
 * makes decisions on.
 */
export type Shared<T> = { mixed: true } | { mixed: false; value: T };

const MIXED: Shared<never> = { mixed: true };

/**
 * A value that cannot disagree, in the form the controls read.
 *
 * The panel's boxes all take a `Shared` because most of what they show is read
 * over a selection. A few things are not — a locale's script, the words of the
 * offer — and this is what lets them use the same control rather than growing a
 * second one that looks identical and behaves almost the same.
 */
export const just = <T>(value: T): Shared<T> => ({ mixed: false, value });

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


// -------------------------------------------------------------------- prop --

const propsAt = (
  project: Project,
  ids: readonly string[],
  index: number,
): PropLayer[] | null => {
  const found = ids
    .map(id => photoById(project, id))
    .map(photo => photo?.props[index]);
  return found.some(p => p === undefined) ? null : (found as PropLayer[]);
};

export function propRectField<K extends FlatKeys<Rect>>(
  project: Project,
  ids: readonly string[],
  index: number,
  key: K,
): Shared<Rect[K]> {
  const props = propsAt(project, ids, index);
  return props === null ? MIXED : shared(props.map(p => p.rect[key]));
}

export function propTimingField<K extends FlatKeys<Timing>>(
  project: Project,
  ids: readonly string[],
  index: number,
  key: K,
): Shared<Timing[K]> {
  const props = propsAt(project, ids, index);
  return props === null ? MIXED : shared(props.map(p => p.timing[key]));
}

/** Which object sits in this slot across the selection. */
export function propChoice(
  project: Project,
  ids: readonly string[],
  index: number,
): Shared<string> {
  const props = propsAt(project, ids, index);
  return props === null ? MIXED : shared(props.map(p => p.propId));
}

/**
 * The colours this slot runs through, as one string.
 *
 * Joined rather than compared as lists, because `shared` compares by identity
 * and two equal arrays are two objects — asking for the list itself would answer
 * `mixed` on a selection that agrees perfectly. The order is the animation, so
 * the join keeps it.
 */
export function propColors(
  project: Project,
  ids: readonly string[],
  index: number,
): Shared<string> {
  const props = propsAt(project, ids, index);
  return props === null ? MIXED : shared(props.map(p => p.colors.join(' ')));
}

/** How many props the selection has, or `mixed`. Slots line up, as buttons do. */
export function propCount(project: Project, ids: readonly string[]): Shared<number> {
  const photos = ids.map(id => photoById(project, id));
  if (photos.some(p => p === null)) return MIXED;
  return shared(photos.map(p => p!.props.length));
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

/** How far the layout on the selected photos is nudged, if they agree. */
export function templateOffsetField(
  project: Project,
  ids: readonly string[],
): Shared<number> {
  const layers = templatesOf(project, ids);
  return layers === null ? MIXED : shared(layers.map(l => l.offsetY));
}

export function templateTimingField<K extends FlatKeys<Timing>>(
  project: Project,
  ids: readonly string[],
  key: K,
): Shared<Timing[K]> {
  const layers = templatesOf(project, ids);
  return layers === null ? MIXED : shared(layers.map(l => l.timing[key]));
}
