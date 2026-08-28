// Undo, and the two questions it can't answer on its own: which changes deserve
// a step of their own, and which ones are really one gesture arriving in pieces.
import type { Command } from './project.ts';

/** How many states back the user can walk. Photos are data URLs; this is memory. */
export const HISTORY_LIMIT = 50;

export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
  /** What produced `present`, so a continuing gesture can fold into it. */
  key: string | null;
}

export const historyOf = <T>(present: T): History<T> =>
  ({ past: [], present, future: [], key: null });

export const canUndo = <T>(history: History<T>): boolean => history.past.length > 0;
export const canRedo = <T>(history: History<T>): boolean => history.future.length > 0;

/**
 * Take a new state. A non-null `key` matching the one that produced the current
 * state replaces it instead of stacking: dragging a button fires a change per
 * pointer move, and undo has to mean "put it back where it was", not "give me
 * the pixel before last".
 */
export function record<T>(history: History<T>, next: T, key: string | null = null): History<T> {
  if (key !== null && key === history.key) return { ...history, present: next };
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    key,
  };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    // The restored state is nobody's gesture: the next change starts a step.
    key: null,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest, key: null };
}

/**
 * Which changes are one continuing gesture. Two changes fold together only when
 * they touch the same fields of the same thing — dragging then retyping is two
 * steps even though both are `button/patch`.
 */
export function coalesceKey(command: Command): string | null {
  switch (command.type) {
    case 'button/patch':
      return `button/${command.index}/${fields(command.patch)}`;
    // Held apart from a drag of the same button on purpose: a run of taps on one
    // arrow key is one gesture, and the drag that preceded it was another.
    case 'button/nudge':
      return `nudge/${command.index}/${command.by.x !== 0 ? 'x' : 'y'}`;
    case 'photo/patch':
      return `photo/${fields(command.patch)}`;
    // Typing a headline arrives a letter at a time. Keyed by the field, so
    // retyping the vacancy list afterwards is a step of its own.
    case 'template/field':
      return `template/${command.key}`;
    case 'template/patch':
      return `template/${fields(command.patch)}`;
    case 'project/patch':
      return `project/${fields(command.patch)}`;
    default:
      // Adding, removing, replacing: each is already one deliberate act.
      return null;
  }
}

/**
 * Which fields a patch names, one level into `rect` and `timing`. Naming the
 * whole of `timing` would fold "when it arrives" and "when it goes" into one
 * step, and undoing the second would silently walk back the first.
 */
const fields = (patch: Record<string, unknown>): string =>
  Object.entries(patch)
    .flatMap(([key, value]) =>
      value !== null && typeof value === 'object'
        ? Object.keys(value).map(inner => `${key}.${inner}`)
        : [key])
    .sort()
    .join(',');

/**
 * Whether a change belongs in the stack at all. Selection is not an edit — an
 * undo that only un-clicks a photo would put the batch the user is trying to
 * rescue one press further away.
 */
export function isUndoable(command: Command): boolean {
  switch (command.type) {
    case 'photo/activate':
    case 'photo/toggle':
    case 'selection/all':
    case 'selection/one':
      return false;
    default:
      return true;
  }
}
