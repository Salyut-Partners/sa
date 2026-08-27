// Every change to the model goes through `apply`. One funnel means broadcast,
// undo and persistence each need to understand one thing, not one per control.
import { clampRect } from './canvas.ts';
import type { ButtonLayer, Photo, Project, Rect } from './types.ts';

export const DEFAULT_CANVAS = { width: 1080, height: 1920 } as const;
export const DEFAULT_DURATION = 10;
export const DEFAULT_FPS = 30;
export const DEFAULT_ACCENT = '#1fa94b';

/** Smallest a button may be dragged to, in percent of the canvas. */
export const MIN_BUTTON_SIZE = { w: 12, h: 3 };

export interface NewPhoto {
  id: string;
  name: string;
  image: string;
}

export type PhotoPatch = Partial<Pick<Photo, 'name' | 'image' | 'accent' | 'pushIn' | 'glare'>>;
export type ButtonPatch = Partial<Omit<ButtonLayer, 'id'>>;
export type ProjectPatch = Partial<Pick<Project, 'duration' | 'fps' | 'canvas'>>;

/**
 * `ids` addresses a set of photos rather than one, and buttons are addressed by
 * their slot rather than their id — that is what lets the same command edit one
 * photo or all of them without a second code path.
 */
export type Command =
  | { type: 'photo/add'; photo: NewPhoto }
  | { type: 'photo/remove'; id: string }
  | { type: 'photo/activate'; id: string }
  | { type: 'photo/patch'; ids: readonly string[]; patch: PhotoPatch }
  | { type: 'button/add'; ids: readonly string[]; button: ButtonLayer }
  | { type: 'button/patch'; ids: readonly string[]; index: number; patch: ButtonPatch }
  | { type: 'button/remove'; ids: readonly string[]; index: number }
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

/** Rewrite the photos named by `ids`, leaving the rest untouched. */
function mapPhotos(
  project: Project,
  ids: readonly string[],
  fn: (photo: Photo) => Photo,
): Project {
  const target = new Set(ids);
  return { ...project, photos: project.photos.map(p => (target.has(p.id) ? fn(p) : p)) };
}

export function apply(project: Project, command: Command): Project {
  switch (command.type) {
    case 'photo/add': {
      const photo = newPhoto(command.photo);
      return {
        ...project,
        photos: [...project.photos, photo],
        activeId: photo.id,
        selection: [photo.id],
      };
    }

    case 'photo/remove': {
      const photos = project.photos.filter(p => p.id !== command.id);
      if (photos.length === project.photos.length) return project;
      const stillActive = project.activeId !== null && project.activeId !== command.id;
      const activeId = stillActive ? project.activeId : (photos[0]?.id ?? null);
      const kept = project.selection.filter(id => photos.some(p => p.id === id));
      // The active photo is always part of the selection — the side panel edits
      // the selection, so an active photo outside it would be uneditable.
      const selection = kept.length > 0 ? kept : activeId === null ? [] : [activeId];
      return { ...project, photos, activeId, selection };
    }

    case 'photo/activate': {
      if (!project.photos.some(p => p.id === command.id)) return project;
      return { ...project, activeId: command.id, selection: [command.id] };
    }

    case 'photo/patch':
      return mapPhotos(project, command.ids, p => ({ ...p, ...command.patch }));

    case 'button/add':
      // A fresh copy per photo: the slot is shared, the instance is not.
      return mapPhotos(project, command.ids, p => ({
        ...p,
        buttons: [...p.buttons, structuredClone(command.button)],
      }));

    case 'button/patch':
      return mapPhotos(project, command.ids, p => {
        if (command.index < 0 || command.index >= p.buttons.length) return p;
        return {
          ...p,
          buttons: p.buttons.map((b, i) => (i === command.index ? { ...b, ...command.patch } : b)),
        };
      });

    case 'button/remove':
      return mapPhotos(project, command.ids, p => ({
        ...p,
        buttons: p.buttons.filter((_, i) => i !== command.index),
      }));

    case 'project/patch':
      return { ...project, ...command.patch };
  }
}

export const photoById = (project: Project, id: string | null): Photo | null =>
  id === null ? null : (project.photos.find(p => p.id === id) ?? null);
