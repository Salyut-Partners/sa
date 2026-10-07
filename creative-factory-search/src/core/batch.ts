// What one press of "export" turns into: every selected photo against every
// language going out, grouped so that no picture is drawn twice.
//
// The plan is data, and it is made here rather than on the server so that the
// editor can show what the export will cost before it starts — how many files,
// how many frame walks, how much speech — and so that the grouping rule is
// testable without a browser anywhere near it.
import { releaseLocales } from './locales.ts';
import { buildSpec } from './spec.ts';
import { subtitleStyleFor } from './subtitles.ts';
import type { LocaleId, Project, Spec } from './types.ts';
import { visualKey } from './visual-key.ts';

/**
 * All that separates one file in a group from the one beside it: its sound.
 *
 * The three fields the server needs to synthesize speech, and no more. The
 * picture lives on the group, once, because that is what a group is.
 */
export interface Sound {
  script: string;
  voiceId: string;
  modelId: string;
}

/** One file that will come out of the export. */
export interface BatchItem {
  photoId: string;
  locale: LocaleId;
  /** What it is called inside the archive. */
  name: string;
  sound: Sound;
  /**
   * The style its words are burned in, or null for a clean file. On the item
   * and not on the group's Spec, with the sound: subtitles are the script in
   * the frame, and the script differs per language while the video does not.
   * Adding it to `visualParts` would split every group into one per language
   * and undo exactly the saving this file exists for.
   */
  subtitles: string | null;
}

/**
 * A set of files that share one video.
 *
 * `spec` is walked frame by frame, once, and it is the only place the photo is
 * written down — a batch of twelve photos in seven languages posts a dozen
 * images, not eighty-four. Every item then takes that video and has its own
 * soundtrack laid over it, which is only sound to say because the key is a hash
 * of exactly what reaches the frame.
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
  // Numbered by where a photo sits in the whole batch, not by where it sits in
  // the selection. Selecting one photo of four must not renumber it 01, or the
  // same creative comes out under two names from the two export buttons.
  return group(project.photos.flatMap((photo, index) =>
    chosen.has(photo.id)
      ? locales.map(locale => itemFor(project, photo.id, photo.name, index, locale))
      : []));
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

/**
 * A file and the video it was built from, before grouping throws the duplicate
 * videos away. Only `group` ever sees the second half.
 */
interface Planned {
  item: BatchItem;
  spec: Spec;
}

const itemFor = (
  project: Project,
  photoId: string,
  photoName: string,
  index: number,
  locale: LocaleId,
): Planned | null => {
  const spec = buildSpec(project, photoId, locale);
  if (spec === null) return null;
  const { script, voiceId, modelId } = spec;
  return {
    item: {
      photoId,
      locale,
      name: archiveName(index, photoName, locale),
      sound: { script, voiceId, modelId },
      subtitles: subtitleStyleFor(project, locale),
    },
    spec,
  };
};

/**
 * Fold items into groups by what they look like.
 *
 * The first Spec of a key is the one kept and rendered; the rest differ from it
 * only in sound, by definition of the key, and are dropped here rather than
 * carried to the server.
 */
function group(planned: readonly (Planned | null)[]): BatchPlan {
  const groups = new Map<string, BatchGroup>();
  for (const entry of planned) {
    if (entry === null) continue;
    const key = visualKey(entry.spec);
    const found = groups.get(key);
    if (found === undefined) groups.set(key, { key, spec: entry.spec, items: [entry.item] });
    else found.items.push(entry.item);
  }
  const list = [...groups.values()];
  return {
    groups: list,
    total: list.reduce((sum, g) => sum + g.items.length, 0),
    renders: list.length,
  };
}

/** How many files of a plan get subtitles — the burn steps it will take. */
export const burnCount = (plan: BatchPlan): number =>
  plan.groups.reduce((sum, g) => sum + g.items.filter(i => i.subtitles !== null).length, 0);

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

/** How many of the files the export makes get subtitles burned in, of how many. */
export interface SubtitleShare {
  burned: number;
  total: number;
}

/** Counted like `batchSize`, for the subtitles line of the panel: what `burnCount` of the plan will say. */
export function subtitleCount(project: Project): SubtitleShare {
  const locales = releaseLocales(project);
  const burned = locales.filter(l => subtitleStyleFor(project, l.id) !== null).length;
  const photos = project.selection.length;
  return { burned: photos * burned, total: photos * locales.length };
}

/** One file the export would make, by name only. */
export interface BatchName {
  name: string;
  photoId: string;
  locale: LocaleId;
}

/**
 * The files `planBatch` makes, named and nothing more — for a list of
 * checkboxes that redraws on every keystroke. Arithmetic like `batchSize`:
 * no Spec is built, so a photo `planBatch` would drop still shows here.
 */
export function batchNames(project: Project): BatchName[] {
  const locales = releaseLocales(project).map(l => l.id);
  const chosen = new Set(project.selection);
  return project.photos.flatMap((photo, index) =>
    chosen.has(photo.id) ? locales.map(locale => ({ name: archiveName(index, photo.name, locale), photoId: photo.id, locale })) : []);
}

/** A plan cut down to the files named — the ones still to render. Groups left empty go. */
export function keepItems(plan: BatchPlan, names: ReadonlySet<string>): BatchPlan {
  const groups = plan.groups.map(g => ({ ...g, items: g.items.filter(i => names.has(i.name)) })).filter(g => g.items.length > 0);
  return { groups, total: groups.reduce((sum, g) => sum + g.items.length, 0), renders: groups.length };
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
  const safe = safeStem(photoName);
  const slot = String(index + 1).padStart(2, '0');
  return `${slot}-${safe === '' ? 'creative' : safe}-${locale}.mp4`;
}

/**
 * A file name's stem made safe for a folder and a URL: letters, digits,
 * underscore and dash, at most 48 of them; empty when nothing survives. The
 * one rule for everything named after a photo — its videos and its picture in
 * the batch folder — so they read as one thing in Finder.
 */
export function safeStem(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return base.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 48);
}
