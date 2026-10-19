// Every change to the model goes through `apply`. One funnel means broadcast,
// undo and persistence each need to understand one thing, not one per control.
import { clamp, clampRect, nudgeRect } from './canvas.ts';
import { newLocale } from './locales.ts';
import { templateById, templateMoves } from './templates.ts';
import { DEFAULT_MODEL_ID } from './voice.ts';
import type {
  ButtonLayer, CanvasSize, FieldValue, Locale, LocaleId, Photo, Project, Rect, Timing, TranslatedFrom,
} from './types.ts';

export const DEFAULT_CANVAS = { width: 1080, height: 1920 } as const;
export const DEFAULT_DURATION = 10;
export const DEFAULT_FPS = 30;
export const DEFAULT_ACCENT = '#1fa94b';

/** Smallest a button may be dragged to, in percent of the canvas. */
export const MIN_BUTTON_SIZE = { w: 12, h: 3 };

/**
 * How far a movable layout may be slid, in percent of frame height.
 *
 * Lopsided because the strip it was built for rests near the foot of the frame:
 * almost all the room it has is above it. The downward end is measured rather
 * than picked — the stack sits 118px off the foot of a 1920 frame, which is
 * 6 per cent, so six takes it flush to the bottom edge and no further. Seven
 * would start cutting the last row off, and a control whose far end hides the
 * thing it moves is one the user has to be rescued from.
 */
export const TEMPLATE_LIFT = { min: -70, max: 6 };

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
  canvas: CanvasSize;
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
export type ProjectPatch =
  Partial<Pick<Project, 'duration' | 'fps' | 'canvas' | 'voiceId' | 'modelId' | 'fitToVoice' | 'subtitles'>>;
export type TemplatePatch = { timing?: Partial<Timing>; offsetY?: number };
export type LocalePatch = Partial<Pick<Locale, 'script' | 'include' | 'subtitles'>>;

/**
 * A language's worth of text, as a translator hands it back. One command carries
 * every language at once so that translating a batch is one step to walk back,
 * not one per geo.
 */
export interface LocaleWrite {
  id: LocaleId;
  script?: string;
  /** What a translated script came from; given with `script` by the translator. */
  translatedFrom?: TranslatedFrom | null;
  /** Merged over what the locale already holds, key by key. */
  overrides?: Readonly<Record<string, FieldValue>>;
}

/**
 * `ids` addresses a set of photos rather than one, and buttons are addressed by
 * their slot rather than their id — that is what lets the same command edit one
 * photo or all of them without a second code path.
 */
export type Command =
  | { type: 'photo/add'; photos: readonly NewPhoto[] }
  | { type: 'photo/remove'; id: string }
  | { type: 'photo/replace'; id: string; name: string; image: string; canvas: CanvasSize }
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
  | { type: 'template/set'; ids: readonly string[]; definitionId: string | null }
  | { type: 'template/patch'; ids: readonly string[]; patch: TemplatePatch }
  | { type: 'locale/add'; id: LocaleId }
  | { type: 'locale/remove'; id: LocaleId }
  | { type: 'locale/activate'; id: LocaleId }
  | { type: 'locale/patch'; id: LocaleId; patch: LocalePatch }
  // A field is written on a language, not on a photo: the words are the offer,
  // and the offer is the batch's. Null is a reset back to the dictionary.
  | { type: 'locale/field'; id: LocaleId; key: string; value: FieldValue | null }
  | { type: 'locale/write'; writes: readonly LocaleWrite[] }
  | { type: 'project/patch'; patch: ProjectPatch };

export function createProject(): Project {
  return {
    canvas: { ...DEFAULT_CANVAS },
    fps: DEFAULT_FPS,
    duration: DEFAULT_DURATION,
    photos: [],
    selection: [],
    activeId: null,
    // One language to start, because a project with none could not show a frame:
    // every text on it comes out of a locale.
    locales: [newLocale('en')],
    activeLocale: 'en',
    // Empty means "whichever the provider offers first" — resolved at export,
    // where the list of voices actually is. Baking one id in here would ship a
    // default that stops existing the day the account's plan changes.
    voiceId: '',
    modelId: DEFAULT_MODEL_ID,
    fitToVoice: true,
    subtitles: null,
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
    canvas: { ...input.canvas },
    accent: DEFAULT_ACCENT,
    pushIn: true,
    glare: true,
    template: null,
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
        // Buttons are in percent of the frame, so they keep their place on the
        // picture when a photo of another shape takes over.
        canvas: { ...command.canvas },
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
        const rect = nudgeRect(button.rect, command.by, p.canvas, MIN_BUTTON_SIZE);
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

    case 'template/set': {
      const { definitionId } = command;
      if (definitionId === null) {
        return mapPhotos(project, command.ids, p =>
          p.template === null ? p : { ...p, template: null });
      }
      const info = templateById(definitionId);
      // A layout nobody carries is refused rather than stored: unlike a button
      // style, there is no sane fallback — a template is its own layout, and
      // silently drawing a different one would be a creative the user never made.
      if (info === null) return project;
      return mapPhotos(project, command.ids, p => ({
        ...p,
        // The window survives the swap, and so does the text — which is not
        // here to survive, being the locale's. The three card versions are one
        // offer in three layouts, and trying the next one must not cost the offer.
        template: {
          definitionId,
          // Not carried across the swap, unlike the window and the text: an
          // offset is a place on the frame that one layout has and the next
          // one may not, so a layout arrives where it draws itself.
          offsetY: 0,
          timing: p.template?.timing ?? { ...info.defaultTiming },
        },
      }));
    }

    case 'template/patch':
      return mapPhotos(project, command.ids, p => {
        if (p.template === null) return p;
        const { timing, offsetY } = command.patch;
        if (timing === undefined && offsetY === undefined) return p;
        const template = { ...p.template };
        if (timing !== undefined) template.timing = { ...template.timing, ...timing };
        // Refused rather than clamped for a layout that does not move: a figure
        // stored on one is a nudge nothing in the panel can show and nothing on
        // the frame can explain.
        if (offsetY !== undefined && templateMoves(template.definitionId)) {
          template.offsetY = clamp(offsetY, TEMPLATE_LIFT.min, TEMPLATE_LIFT.max);
        }
        return { ...p, template };
      });

    case 'locale/add': {
      if (project.locales.some(l => l.id === command.id)) return project;
      // Added languages open in front of the user: adding one is asking to see
      // how the batch reads in it.
      return {
        ...project,
        locales: [...project.locales, newLocale(command.id)],
        activeLocale: command.id,
      };
    }

    case 'locale/remove': {
      // The last one cannot go. Every text on the frame is read out of a locale,
      // and a project with none is a project that cannot draw itself.
      if (project.locales.length <= 1) return project;
      const locales = project.locales.filter(l => l.id !== command.id);
      if (locales.length === project.locales.length) return project;
      const activeLocale =
        project.activeLocale === command.id ? locales[0]!.id : project.activeLocale;
      return { ...project, locales, activeLocale };
    }

    case 'locale/activate':
      return project.locales.some(l => l.id === command.id)
        ? { ...project, activeLocale: command.id }
        : project;

    case 'locale/patch':
      return mapLocales(project, [command.id], l => {
        const next = { ...l, ...command.patch };
        // A script typed over is the buyer's from then on: no longer a translation to redo.
        return command.patch.script !== undefined && command.patch.script !== l.script ? { ...next, translatedFrom: null } : next;
      });

    case 'locale/field':
      return mapLocales(project, [command.id], l => {
        const { [command.key]: current, ...rest } = l.overrides;
        // Null is a reset, and a reset is a forgetting: with the key gone the
        // dictionary answers for the field again — including when the language
        // it answers in changes.
        if (command.value === null) {
          return current === undefined ? l : { ...l, overrides: rest };
        }
        return { ...l, overrides: { ...l.overrides, [command.key]: command.value } };
      });

    case 'locale/write': {
      const byId = new Map(command.writes.map(w => [w.id, w]));
      return mapLocales(project, [...byId.keys()], l => {
        const write = byId.get(l.id)!;
        return {
          ...l,
          script: write.script ?? l.script,
          ...(write.translatedFrom !== undefined ? { translatedFrom: write.translatedFrom } : {}),
          // Merged rather than replaced: a translation that came back for three
          // of the four edited fields must not silently drop the fourth.
          overrides: write.overrides === undefined
            ? l.overrides
            : { ...l.overrides, ...write.overrides },
        };
      });
    }

    case 'project/patch':
      return { ...project, ...command.patch };
  }
}

/** `mapPhotos` for languages: same rule, same reason to keep identity on a no-op. */
function mapLocales(
  project: Project,
  ids: readonly LocaleId[],
  fn: (locale: Locale) => Locale,
): Project {
  const target = new Set(ids);
  const locales = project.locales.map(l => (target.has(l.id) ? fn(l) : l));
  return locales.every((l, i) => shallowSame(l, project.locales[i]!))
    ? project
    : { ...project, locales };
}

/**
 * Whether a rewritten locale says the same thing as the one it replaced.
 *
 * `mapPhotos` can compare by identity because its callers return the photo
 * unchanged when they have nothing to do. A locale is rewritten field by field —
 * `{ ...l, ...patch }` is always a new object — so the comparison has to be over
 * what it holds, or setting a script to the script it already had would land on
 * the undo stack and re-serialise the batch.
 */
const shallowSame = (a: Locale, b: Locale): boolean =>
  a === b || (
    a.script === b.script && a.include === b.include &&
    a.subtitles === b.subtitles && sameBag(a.overrides, b.overrides)
  );

const sameBag = (
  a: Readonly<Record<string, FieldValue>>,
  b: Readonly<Record<string, FieldValue>>,
): boolean => {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(k => {
    const x = a[k];
    const y = b[k];
    if (Array.isArray(x) && Array.isArray(y)) {
      return x.length === y.length && x.every((v, i) => v === y[i]);
    }
    return x === y;
  });
};

export const photoById = (project: Project, id: string | null): Photo | null =>
  id === null ? null : (project.photos.find(p => p.id === id) ?? null);

/**
 * Every layer on a photo, as timings. The poster frame and the warnings about a
 * window falling off the end of the video both want all of them, and a template
 * is a layer like any other — that is the whole point of the word.
 */
export const photoTimings = (photo: Photo): Timing[] => [
  ...(photo.template === null ? [] : [photo.template.timing]),
  ...photo.buttons.map(b => b.timing),
];
