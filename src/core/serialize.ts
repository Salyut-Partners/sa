// A project as a file. Images travel inside it as data URLs, so one .json is the
// whole batch — no folder of loose photos to keep next to it.
import { isLocaleId, newLocale } from './locales.ts';
import { DEFAULT_CANVAS, DEFAULT_DURATION, DEFAULT_FPS, MAX_PHOTOS } from './project.ts';
import { DEFAULT_MODEL_ID } from './voice.ts';
import type {
  ButtonLayer, CanvasSize, FieldValue, Locale, LocaleId, Photo, Project, Rect, TemplateLayer,
  Timing,
} from './types.ts';

export const SCHEMA_VERSION = 3;

/**
 * Schemas this build can still read. A file from before templates existed is
 * opened rather than refused: the half it is missing is a template nobody had
 * chosen, and refusing it would mean yesterday's batch cannot be opened today.
 */
const READABLE_VERSIONS = new Set([1, 2, SCHEMA_VERSION]);

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
  locales: Locale[];
  voiceId: string;
  modelId: string;
  fitToVoice: boolean;
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
    locales: structuredClone(project.locales),
    voiceId: project.voiceId,
    modelId: project.modelId,
    fitToVoice: project.fitToVoice,
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

const isOverrides = (v: unknown): v is Record<string, FieldValue> =>
  isBag(v) && Object.values(v).every(isFieldValue);

const isTemplate = (v: unknown): v is TemplateLayer =>
  isBag(v) && isText(v['definitionId']) && isTiming(v['timing']) &&
  // Version 2 kept the field values here. They are read off elsewhere and
  // folded into the locale; what matters at the gate is that they are sane.
  (v['values'] === undefined || isOverrides(v['values']));

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

const isLocale = (v: unknown): v is Locale =>
  isBag(v) && isLocaleId(v['id']) && isText(v['script']) &&
  (v['voiceId'] === null || isText(v['voiceId'])) && typeof v['include'] === 'boolean' &&
  isOverrides(v['overrides']);

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

  const stored = data['photos'] as (Photo & { template: (TemplateLayer & { values?: unknown }) | null })[];
  // Normalised on the way in rather than defended against everywhere after: the
  // rest of the app may assume a photo has the field, whatever the file said.
  const photos = stored.map(p => ({
    ...p,
    template: p.template == null
      ? null
      : { definitionId: p.template.definitionId, timing: p.template.timing },
  }));

  const locales = readLocales(data['locales'], stored);
  const activeLocale = locales[0]!.id;
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
      locales,
      activeLocale,
      voiceId: isText(data['voiceId']) ? data['voiceId'] : '',
      modelId: isText(data['modelId']) ? data['modelId'] : DEFAULT_MODEL_ID,
      fitToVoice: data['fitToVoice'] !== false,
    },
  };
}

/**
 * The languages in the file, or the one a file written before languages existed
 * implies.
 *
 * Such a file kept its field edits on each photo's template, in the only
 * language there was. They are folded into English here rather than dropped —
 * the alternative is a batch that opens having quietly forgotten the wording its
 * owner typed. Where two photos disagreed, the first in the grid wins: one of
 * them has to, and the first is the one whose text the panel was showing.
 */
function readLocales(
  stored: unknown,
  photos: readonly { template: (TemplateLayer & { values?: unknown }) | null }[],
): Locale[] {
  if (Array.isArray(stored)) {
    const locales = stored.filter(isLocale).map(l => ({ ...l, overrides: { ...l.overrides } }));
    // One record per language: two would make "the German script" ambiguous
    // everywhere downstream, and the first is the one the editor was showing.
    const byId = new Map<LocaleId, Locale>();
    for (const locale of locales) if (!byId.has(locale.id)) byId.set(locale.id, locale);
    if (byId.size > 0) return [...byId.values()];
  }

  const overrides: Record<string, FieldValue> = {};
  for (const photo of photos) {
    const values = photo.template?.values;
    if (!isOverrides(values)) continue;
    for (const [key, value] of Object.entries(values)) {
      if (!(key in overrides)) overrides[key] = value;
    }
  }
  return [{ ...newLocale('en'), overrides }];
}
