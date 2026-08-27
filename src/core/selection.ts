// Reading a field for a set of photos. Broadcast is one mechanism rather than a
// branch inside every control: the panel asks for a field over the selection and
// gets back either a value it can show or `mixed`, and it writes through the same
// commands whichever it got.
import { photoById } from './project.ts';
import type { ButtonLayer, Photo, Project } from './types.ts';

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

export function buttonField<K extends FlatKeys<ButtonLayer>>(
  project: Project,
  ids: readonly string[],
  index: number,
  key: K,
): Shared<ButtonLayer[K]> {
  const buttons = ids.map(id => photoById(project, id)?.buttons[index]);
  // A photo without that slot disagrees with one that has it — the honest answer
  // is mixed, and the panel then offers to write the value onto all of them.
  if (buttons.some(b => b === undefined)) return MIXED;
  return shared(buttons.map(b => b![key]));
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
