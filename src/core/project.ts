// Every change to the model goes through `apply`. One funnel means broadcast,
// undo and persistence each need to understand one thing, not one per control.
import { clampRect, nudgeRect } from './canvas.ts';
import type { ButtonLayer, Photo, Project, Rect, Timing } from './types.ts';

export const DEFAULT_CANVAS = { width: 1080, height: 1920 } as const;
export const DEFAULT_DURATION = 10;
export const DEFAULT_FPS = 30;
export const DEFAULT_ACCENT = '#1fa94b';

/** Smallest a button may be dragged to, in percent of the canvas. */
export const MIN_BUTTON_SIZE = { w: 12, h: 3 };

/**
 * How many photos one project holds. Images live inside the project as data
 * URLs, so the ceiling is memory, not taste: a dozen 1080x1920 JPEGs is already
 * tens of megabytes to keep in the store, autosave and export.
 */
export const MAX_PHOTOS = 12;

export interface NewPhoto {
  id: string;
  name: string;
  image: string;
}

export type PhotoPatch = Partial<Pick<Photo, 'name' | 'image' | 'accent' | 'pushIn' | 'glare'>>;
/**
 * A patch merges rather than replaces: `{ rect: { x: 4 } }` moves the button
 * sideways and leaves its size alone. Under a selection that is the difference
 * between lining four photos up on one axis and pushing the active photo's
 * whole geometry onto the other three.
 */
export type ButtonPatch =
  & Partial<Omit<ButtonLayer, 'id' | 'rect' | 'timing'>>
  & { rect?: Partial<Rect>; timing?: Partial<Timing> };
export type ProjectPatch = Partial<Pick<Project, 'duration' | 'fps' | 'canvas'>>;

/**
 * `ids` addresses a set of photos rather than one, and buttons are addressed by
 * their slot rather than their id — that is what lets the same command edit one
 * photo or all of them without a second code path.
 */
export type Command =
  | { type: 'photo/add'; photos: readonly NewPhoto[] }
  | { type: 'photo/remove'; id: string }
  | { type: 'photo/replace'; id: string; name: string; image: string }
  | { type: 'photo/activate'; id: string }
  | { type: 'photo/toggle'; id: string }
  | { type: 'selection/all' }
  | { type: 'selection/one' }
  | { type: 'photo/patch'; ids: readonly string[]; patch: PhotoPatch }
  | { type: 'button/add'; ids: readonly string[]; index: number; button: ButtonLayer }
  | { type: 'button/patch'; ids: readonly string[]; index: number; patch: ButtonPatch }
  | { type: 'button/remove'; ids: readonly string[]; index: number }
  | { type: 'button/nudge'; ids: readonly string[]; index: number; by: { x: number; y: number } }
  | { type: 'button/move'; ids: readonly string[]; from: number; to: number }
  | { type: 'button/duplicate'; ids: readonly string[]; index: number; id: string }
  | { type: 'project/patch'; patch: ProjectPatch };

export function createProject(): Project {
  return {
    canvas: { ...DEFAULT_CANVAS },
    fps: DEFAULT_FPS,
    duration: DEFAULT_DURATION,
    photos: [],
    selection: [],
    activeId: null,
  };
}

/** A button in a sensible spot, staggered so a second one does not hide the first. */
export function defaultButton(
  id: string,
  styleId: string,
  index: number,
  accent: string,
): ButtonLayer {
  const rect: Rect = clampRect(
    { x: 13.3, y: 67.6 + (index % 6) * 9, w: 73.3, h: 7.1 },
    MIN_BUTTON_SIZE,
  );
  return {
    id,
    styleId,
    fontId: 'anton',
    text: 'ДІЗНАТИСЬ БІЛЬШЕ',
    color: accent,
    rect,
    timing: { appearAt: 0, hideAt: null, enter: 'fade', enterDuration: 0.4 },
  };
}

function newPhoto(input: NewPhoto): Photo {
  return {
    id: input.id,
    name: input.name,
    image: input.image,
    accent: DEFAULT_ACCENT,
    pushIn: true,
    glare: true,
    buttons: [],
  };
}

const inRange = (index: number, list: readonly unknown[]): boolean =>
  Number.isInteger(index) && index >= 0 && index < list.length;

const clampIndex = (index: number, length: number): number =>
  Math.min(Math.max(0, Math.trunc(index)), length);

/**
 * Where the next button added to `ids` will land: the end of the shortest of
 * them. Any deeper slot would not exist in every photo, and the one place a
 * button can be added to all of them and mean the same thing is the one that
 * does. The panel needs the same number to know which button to open for editing.
 */
export function nextSlot(project: Project, ids: readonly string[]): number {
  const lengths = ids
    .map(id => photoById(project, id))
    .filter((p): p is Photo => p !== null)
    .map(p => p.buttons.length);
  return lengths.length === 0 ? 0 : Math.min(...lengths);
}

/**
 * Selection is kept in grid order, not in the order the user clicked. The panel
 * and every broadcast read it as a list, and a list that reorders itself under
 * the same set of photos would make "the first selected" mean two things.
 */
const inGridOrder = (project: Project, ids: ReadonlySet<string>): string[] =>
  project.photos.filter(p => ids.has(p.id)).map(p => p.id);

/**
 * Rewrite the photos named by `ids`, leaving the rest untouched.
 *
 * A rewrite that changed nothing gives the same project back rather than an
 * equal copy. Identity is what the caller reads to tell an edit from a no-op:
 * a command that missed every photo must not land on the undo stack, and must
 * not make the grid rebuild previews for a change that never happened.
 */
function mapPhotos(
  project: Project,
  ids: readonly string[],
  fn: (photo: Photo) => Photo,
): Project {
  const target = new Set(ids);
  const photos = project.photos.map(p => (target.has(p.id) ? fn(p) : p));
  return photos.every((p, i) => p === project.photos[i])
    ? project
    : { ...project, photos };
}

const patched = (button: ButtonLayer, patch: ButtonPatch): ButtonLayer => ({
  ...button,
  ...patch,
  // Spreading the patch put the partials in place; these put the wholes back.
  rect: patch.rect === undefined ? button.rect : { ...button.rect, ...patch.rect },
  timing: patch.timing === undefined ? button.timing : { ...button.timing, ...patch.timing },
});

export function apply(project: Project, command: Command): Project {
  switch (command.type) {
    case 'photo/add': {
      // The ceiling is the model's, so it holds however the photos arrive. The
      // editor checks it first in order to say what bounced; this is the backstop.
      const room = MAX_PHOTOS - project.photos.length;
      const added = command.photos.slice(0, Math.max(0, room)).map(newPhoto);
      const first = added[0];
      if (first === undefined) return project;
      return {
        ...project,
        photos: [...project.photos, ...added],
        activeId: first.id,
        selection: [first.id],
      };
    }

    case 'photo/remove': {
      const photos = project.photos.filter(p => p.id !== command.id);
      if (photos.length === project.photos.length) return project;
      const stillActive = project.activeId !== null && project.activeId !== command.id;
      const activeId = stillActive ? project.activeId : (photos[0]?.id ?? null);
      const left = new Set(photos.map(p => p.id));
      const kept = project.selection.filter(id => left.has(id));
      // The active photo is always part of the selection — the side panel edits
      // the selection, so an active photo outside it would be uneditable.
      const selection = kept.length > 0 ? kept : activeId === null ? [] : [activeId];
      return { ...project, photos, activeId, selection };
    }

    case 'photo/replace':
      return mapPhotos(project, [command.id], p => ({
        ...p,
        name: command.name,
        image: command.image,
      }));

    case 'photo/activate': {
      if (!project.photos.some(p => p.id === command.id)) return project;
      return { ...project, activeId: command.id, selection: [command.id] };
    }

    case 'photo/toggle': {
      if (!project.photos.some(p => p.id === command.id)) return project;
      const next = new Set(project.selection);
      if (next.has(command.id)) {
        // Emptying the selection would leave the panel editing nothing, so the
        // last one standing cannot be switched off.
        if (next.size === 1) return project;
        next.delete(command.id);
      } else {
        next.add(command.id);
      }
      const selection = inGridOrder(project, next);
      const activeId = next.has(project.activeId ?? '') ? project.activeId : selection[0] ?? null;
      return { ...project, selection, activeId };
    }

    case 'selection/all':
      return { ...project, selection: project.photos.map(p => p.id) };

    case 'selection/one':
      return { ...project, selection: project.activeId === null ? [] : [project.activeId] };

    case 'photo/patch':
      return mapPhotos(project, command.ids, p => ({ ...p, ...command.patch }));

    case 'button/add': {
      // The slot is shared, the instance is not — hence a fresh copy per photo.
      // The button goes *at* one slot rather than on each photo's end: photos in
      // a selection are matched by position, so appending to a batch whose photos
      // hold different numbers of buttons would put the new one at a different
      // slot in each, and every later broadcast would edit a different button per
      // photo. That means one index for the whole command, clamped to the
      // shortest photo — the deepest slot that exists in all of them.
      const at = clampIndex(command.index, nextSlot(project, command.ids));
      return mapPhotos(project, command.ids, p => {
        const buttons = [...p.buttons];
        buttons.splice(at, 0, structuredClone(command.button));
        return { ...p, buttons };
      });
    }

    case 'button/patch':
      return mapPhotos(project, command.ids, p => {
        if (!inRange(command.index, p.buttons)) return p;
        return {
          ...p,
          buttons: p.buttons.map((b, i) => (i === command.index ? patched(b, command.patch) : b)),
        };
      });

    case 'button/remove':
      return mapPhotos(project, command.ids, p =>
        inRange(command.index, p.buttons)
          ? { ...p, buttons: p.buttons.filter((_, i) => i !== command.index) }
          : p);

    case 'button/nudge':
      // A step, not a destination. `button/patch` writes one value to the whole
      // selection, which is what a drag wants — but a nudge means "a pixel
      // left", and photos whose buttons sit in different places must each move
      // a pixel rather than all land on the active photo's coordinate.
      return mapPhotos(project, command.ids, p => {
        const button = p.buttons[command.index];
        if (button === undefined) return p;
        const rect = nudgeRect(button.rect, command.by, project.canvas, MIN_BUTTON_SIZE);
        return {
          ...p,
          buttons: p.buttons.map((b, i) => (i === command.index ? { ...b, rect } : b)),
        };
      });

    case 'button/move': {
      // Order is z-order, so this is what puts one button on top of another.
      // A photo too short to hold both slots keeps its list: the alternative is
      // moving whichever button happens to sit nearest, which is not what was
      // asked and is invisible until the export.
      const { from, to } = command;
      if (from === to) return project;
      return mapPhotos(project, command.ids, p => {
        if (!inRange(from, p.buttons) || !inRange(to, p.buttons)) return p;
        const buttons = [...p.buttons];
        const [moved] = buttons.splice(from, 1);
        buttons.splice(to, 0, moved!);
        return { ...p, buttons };
      });
    }

    case 'button/duplicate':
      // Each photo copies its own button, not the active photo's: two photos in
      // a selection can hold different text at one slot, and a duplicate that
      // flattened that difference would quietly undo an earlier edit. The copy
      // takes one id across the batch, as `button/add` does — ids identify a
      // slot's occupant, and photos in a selection are matched by slot.
      return mapPhotos(project, command.ids, p => {
        const source = p.buttons[command.index];
        if (source === undefined) return p;
        const buttons = [...p.buttons];
        buttons.splice(command.index + 1, 0, { ...structuredClone(source), id: command.id });
        return { ...p, buttons };
      });

    case 'project/patch':
      return { ...project, ...command.patch };
  }
}

export const photoById = (project: Project, id: string | null): Photo | null =>
  id === null ? null : (project.photos.find(p => p.id === id) ?? null);
