// A project as a file. Images travel inside it as data URLs, so one .json is the
// whole batch.
import { isLocaleId, newLocale } from './locales.ts';
import { DEFAULT_CANVAS, DEFAULT_DURATION, DEFAULT_FPS, MAX_PHOTOS } from './project.ts';
import { DEFAULT_MODEL_ID } from './voice.ts';
import type {
  ButtonLayer, CanvasSize, FieldValue, Locale, LocaleId, Photo, Project, Rect,
  TemplateLayer, Timing, TranslatedFrom,
} from './types.ts';

export const SCHEMA_VERSION = 5;

/**
 * Schemas this build can still read. A file from before templates existed is
 * opened rather than refused: the half it is missing is a template nobody had
 * chosen, and refusing it would mean yesterday's batch cannot be opened today.
 */
const READABLE_VERSIONS = new Set([1, 2, 3, 4, SCHEMA_VERSION]);

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
  locales: (Locale & { voiceId: null })[];
  voiceId: string;
  modelId: string;
  fitToVoice: boolean;
  /** Absent in a file from before the switch: it was spoken whenever it had a script. */
  voiceOn: boolean;
  /** Absent in a file from before music: none. */
  music: string | null;
  /**
   * Absent in every file written before subtitles existed, and ignored by
   * the editor that wrote them — which is why this is a field and not a new
   * schema version: a batch saved with a style still opens there, minus the
   * style, rather than being refused.
   */
  subtitles: string | null;
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
    // `voiceId: null` on every language for an editor from before the voice was
    // the project's alone: it refuses a language without one.
    locales: project.locales.map(l => ({ ...structuredClone(l), voiceId: null })),
    voiceId: project.voiceId,
    modelId: project.modelId,
    fitToVoice: project.fitToVoice,
    voiceOn: project.voiceOn,
    music: project.music,
    subtitles: project.subtitles,
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
  // Absent in every file written while the whole project had one frame size.
  (v['canvas'] === undefined || isCanvas(v['canvas'])) &&
  isText(v['accent']) && typeof v['pushIn'] === 'boolean' && typeof v['glare'] === 'boolean' &&
  // Absent is a valid answer, and the one a version 1 file gives.
  (v['template'] == null || isTemplate(v['template'])) &&
  // Absent in every file written before a photo could wear a second layout.
  (v['overlay'] == null || isTemplate(v['overlay'])) &&
  Array.isArray(v['buttons']) && v['buttons'].every(isButton);

const isCanvas = (v: unknown): v is CanvasSize => isBag(v) && isNum(v['width']) && isNum(v['height']);

const isLocale = (v: unknown): v is Locale =>
  isBag(v) && isLocaleId(v['id']) && isText(v['script']) &&
  typeof v['include'] === 'boolean' &&
  // Absent is what every file written before subtitles existed says.
  (v['subtitles'] === undefined || typeof v['subtitles'] === 'boolean') &&
  isOverrides(v['overrides']);

const isTranslatedFrom = (v: unknown): v is TranslatedFrom =>
  isBag(v) && isLocaleId(v['id']) && isText(v['script']);

/** A stored layer, rebuilt to the model's shape, or none. */
const readLayer = (layer: TemplateLayer | null | undefined): TemplateLayer | null =>
  layer == null ? null : {
    definitionId: layer.definitionId,
    // Every file written before layouts could be moved says nothing here,
    // and means where the layout draws itself.
    offsetY: layer.offsetY ?? 0,
    timing: layer.timing,
  };

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

  const stored = data['photos'] as (Photo & {
    template: (TemplateLayer & { values?: unknown }) | null;
    overlay?: TemplateLayer | null;
  })[];
  // Rebuilt field by field rather than spread: a file written while the editor
  // still had a layer of catalogue objects carries `props`, and copying the
  // photo whole would carry that into a model that has no such field. Every
  // photo comes back with exactly the shape the rest of the app assumes.
  const shared = isCanvas(data['canvas']) ? data['canvas'] : DEFAULT_CANVAS;
  const photos: Photo[] = stored.map(p => ({
    id: p.id,
    name: p.name,
    image: p.image,
    canvas: { ...(p.canvas ?? shared) },
    accent: p.accent,
    pushIn: p.pushIn,
    glare: p.glare,
    buttons: p.buttons,
    template: readLayer(p.template),
    overlay: readLayer(p.overlay),
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
      voiceOn: data['voiceOn'] !== false,
      music: isText(data['music']) && data['music'] !== '' ? data['music'] : null,
      subtitles: isText(data['subtitles']) && data['subtitles'] !== '' ? data['subtitles'] : null,
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
    // Normalised on the way in, like a photo's template: a language from
    // before subtitles existed is one that never opted out.
    const locales = stored.filter(isLocale)
      .map(({ translatedFrom, ...l }) => ({
        // Named field by field: a language's own voice, from files written
        // before the voice was the project's alone, is dropped here.
        id: l.id, script: l.script, include: l.include,
        subtitles: l.subtitles !== false, overrides: { ...l.overrides },
        // Absent in files from before the export translated; a malformed one reads as written by hand.
        ...(isTranslatedFrom(translatedFrom) ? { translatedFrom: { id: translatedFrom.id, script: translatedFrom.script } } : {}),
      }));
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
