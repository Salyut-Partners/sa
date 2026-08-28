// What one press of "export" turns into: every selected photo against every
// language going out, grouped so that no picture is drawn twice.
//
// The plan is data, and it is made here rather than on the server so that the
// editor can show what the export will cost before it starts — how many files,
// how many frame walks, how much speech — and so that the grouping rule is
// testable without a browser anywhere near it.
import { releaseLocales } from './locales.ts';
import { buildSpec } from './spec.ts';
import type { LocaleId, Project, Spec } from './types.ts';
import { visualKey } from './visual-key.ts';

/** One file that will come out of the export. */
export interface BatchItem {
  photoId: string;
  locale: LocaleId;
  /** What it is called inside the archive. */
  name: string;
  spec: Spec;
}

/**
 * A set of files that share one video.
 *
 * `spec` is walked frame by frame, once. Every item then takes that video and
 * has its own soundtrack laid over it — which is only sound because the key is a
 * hash of exactly what reaches the frame.
 */
export interface BatchGroup {
  key: string;
  spec: Spec;
  items: BatchItem[];
}

export interface BatchPlan {
  groups: BatchGroup[];
  /** How many files come out. */
  total: number;
  /** How many frame walks it takes to make them — the number that costs time. */
  renders: number;
}

/**
 * Silence after the last word. Speech that ends on the final frame reads as a
 * video that was cut off, whatever the waveform says.
 */
export const VOICE_TAIL = 0.6;

/**
 * What the selection will produce, in the languages marked for release.
 *
 * The selection rather than the whole batch: broadcast already made the
 * selection the thing the panel edits, and exporting something other than what
 * is being edited would be a second meaning for the same highlight. Taking all
 * twelve is one press of ⌘A away.
 */
export function planBatch(project: Project): BatchPlan {
  const locales = releaseLocales(project).map(l => l.id);
  const chosen = new Set(project.selection);
  // Grid order, not click order: the archive is numbered by where a photo sits
  // in the batch, and that has to be stable across two exports of the same work.
  const selected = project.photos.filter(p => chosen.has(p.id));
  return group(selected.flatMap(
    (photo, index) => locales.map(locale => itemFor(project, photo.id, photo.name, index, locale)),
  ));
}

/**
 * One creative in the language on screen — the quick check before committing to
 * a release.
 *
 * It goes through the same plan and the same queue as a batch of eighty. Two
 * ways of rendering a video is two ways for a video to come out wrong, and only
 * one of them would be the one the user tested with.
 */
export function planOne(project: Project, photoId: string): BatchPlan {
  const index = project.photos.findIndex(p => p.id === photoId);
  const photo = project.photos[index];
  if (photo === undefined) return { groups: [], total: 0, renders: 0 };
  return group([itemFor(project, photo.id, photo.name, index, project.activeLocale)]);
}

const itemFor = (
  project: Project,
  photoId: string,
  photoName: string,
  index: number,
  locale: LocaleId,
): BatchItem | null => {
  const spec = buildSpec(project, photoId, locale);
  return spec === null
    ? null
    : { photoId, locale, name: archiveName(index, photoName, locale), spec };
};

/** Fold items into groups by what they look like. */
function group(items: readonly (BatchItem | null)[]): BatchPlan {
  const groups = new Map<string, BatchGroup>();
  for (const item of items) {
    if (item === null) continue;
    const key = visualKey(item.spec);
    const found = groups.get(key);
    if (found === undefined) groups.set(key, { key, spec: item.spec, items: [item] });
    else found.items.push(item);
  }
  const list = [...groups.values()];
  return {
    groups: list,
    total: list.reduce((sum, g) => sum + g.items.length, 0),
    renders: list.length,
  };
}

/** How big the next export is, by arithmetic. */
export interface BatchSize {
  photos: number;
  locales: number;
  total: number;
}

/**
 * What the export button says before it is pressed.
 *
 * Counted rather than planned. A plan builds a Spec per file and hashes the
 * photo inside each one, which is work worth doing once at the press and not
 * on every keystroke that changes a headline — this answers the only question
 * the button needs answered, in arithmetic.
 */
export function batchSize(project: Project): BatchSize {
  const photos = project.selection.length;
  const locales = releaseLocales(project).length;
  return { photos, locales, total: photos * locales };
}

/**
 * The video length one group renders at.
 *
 * Every file in a group shares one video, so they share one length — the longest
 * voice in the group, which is the only one that would otherwise be cut. Below
 * what the user set it does not go: a short line is a short line, not a licence
 * to shorten the creative.
 */
export function groupDuration(
  base: number,
  voiceSeconds: readonly number[],
  fitToVoice: boolean,
): number {
  if (!fitToVoice || voiceSeconds.length === 0) return base;
  return Math.max(base, Math.max(...voiceSeconds) + VOICE_TAIL);
}

/**
 * What a file is called in the archive: its place in the batch, its photo, its
 * language. The number leads so that the zip opens in the order the grid reads,
 * and so that two photos that came off the phone with the same name are still
 * two files.
 */
export function archiveName(index: number, photoName: string, locale: LocaleId): string {
  const base = photoName.replace(/\.[^.]+$/, '');
  const safe = base.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  const slot = String(index + 1).padStart(2, '0');
  return `${slot}-${safe === '' ? 'creative' : safe}-${locale}.mp4`;
}
