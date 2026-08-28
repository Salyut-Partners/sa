// A project as a file. Images travel inside it as data URLs, so one .json is the
// whole batch — no folder of loose photos to keep next to it.
import { DEFAULT_CANVAS, DEFAULT_DURATION, DEFAULT_FPS, MAX_PHOTOS } from './project.ts';
import type {
  ButtonLayer, CanvasSize, FieldValue, Photo, Project, Rect, TemplateLayer, Timing,
} from './types.ts';

export const SCHEMA_VERSION = 2;

/**
 * Schemas this build can still read. A file from before templates existed is
 * opened rather than refused: the half it is missing is a template nobody had
 * chosen, and refusing it would mean yesterday's batch cannot be opened today.
 */
const READABLE_VERSIONS = new Set([1, SCHEMA_VERSION]);

/**
 * What lands on disk. Selection and the active photo are deliberately absent:
 * they are where the user's cursor was, not what they made, and leaving them out
 * means a file can never open pointing at a photo it does not contain.
 */
export interface ProjectFile {
  version: number;
  canvas: CanvasSize;
  fps: number;
  duration: number;
  photos: Photo[];
}

/** Why a file will not open. Each one is something to tell the user, not a bug. */
export type LoadFailure = 'not-a-project' | 'version' | 'too-many';

export type LoadResult =
  | { ok: true; project: Project }
  | { ok: false; reason: LoadFailure };

export function toFile(project: Project): ProjectFile {
  return {
    version: SCHEMA_VERSION,
    canvas: { ...project.canvas },
    fps: project.fps,
    duration: project.duration,
    photos: structuredClone(project.photos),
  };
}

type Bag = Record<string, unknown>;

const isBag = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isRect = (v: unknown): v is Rect =>
  isBag(v) && isNum(v['x']) && isNum(v['y']) && isNum(v['w']) && isNum(v['h']);

const isTiming = (v: unknown): v is Timing =>
  isBag(v) && isNum(v['appearAt']) && (v['hideAt'] === null || isNum(v['hideAt'])) &&
  isText(v['enter']) && isNum(v['enterDuration']);

const isFieldValue = (v: unknown): v is FieldValue =>
  isText(v) || (Array.isArray(v) && v.every(isText));

const isTemplate = (v: unknown): v is TemplateLayer =>
  isBag(v) && isText(v['definitionId']) && isTiming(v['timing']) &&
  isBag(v['values']) && Object.values(v['values']).every(isFieldValue);

const isButton = (v: unknown): v is ButtonLayer =>
  isBag(v) && isText(v['id']) && isText(v['styleId']) && isText(v['fontId']) &&
  isText(v['text']) && isText(v['color']) && isRect(v['rect']) && isTiming(v['timing']);

const isPhoto = (v: unknown): v is Photo =>
  isBag(v) && isText(v['id']) && isText(v['name']) && isText(v['image']) &&
  isText(v['accent']) && typeof v['pushIn'] === 'boolean' && typeof v['glare'] === 'boolean' &&
  // Absent is a valid answer, and the one a version 1 file gives.
  (v['template'] == null || isTemplate(v['template'])) &&
  Array.isArray(v['buttons']) && v['buttons'].every(isButton);

const isCanvas = (v: unknown): v is CanvasSize => isBag(v) && isNum(v['width']) && isNum(v['height']);

/**
 * Read a file back. Everything is checked rather than trusted: this is the one
 * door into the model that the editor's commands do not guard, and a half-read
 * project would surface as a blank frame in an export hours later.
 */
export function fromFile(data: unknown): LoadResult {
  if (!isBag(data) || !Array.isArray(data['photos'])) return { ok: false, reason: 'not-a-project' };
  if (!READABLE_VERSIONS.has(data['version'] as number)) return { ok: false, reason: 'version' };
  if (!data['photos'].every(isPhoto)) return { ok: false, reason: 'not-a-project' };
  // A file holding more than this editor can carry is refused rather than
  // silently trimmed: losing photos on open is worse than not opening.
  if (data['photos'].length > MAX_PHOTOS) return { ok: false, reason: 'too-many' };

  // Normalised on the way in rather than defended against everywhere after: the
  // rest of the app may assume a photo has the field, whatever the file said.
  const photos = (data['photos'] as Photo[]).map(p => ({ ...p, template: p.template ?? null }));
  const first = photos[0]?.id ?? null;
  return {
    ok: true,
    project: {
      canvas: isCanvas(data['canvas']) ? { ...data['canvas'] } : { ...DEFAULT_CANVAS },
      fps: isNum(data['fps']) ? data['fps'] : DEFAULT_FPS,
      duration: isNum(data['duration']) ? data['duration'] : DEFAULT_DURATION,
      photos: structuredClone(photos),
      activeId: first,
      selection: first === null ? [] : [first],
    },
  };
}
