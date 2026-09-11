// The export queue.
//
// A batch of a dozen photos across seven languages is hundreds of screenshots
// and minutes of wall clock, so it runs as a job (see `jobs.ts`): posting one
// starts it and gets an id back, and the editor watches it while the user
// keeps working. This file is the work itself — speech, frames, mux, and the
// subtitles burned in after — and where the files go.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { groupDuration, type BatchGroup, type BatchItem, type Sound } from '../core/batch.ts';
import { clamp } from '../core/canvas.ts';
import { wordsFromAlignment, type Word } from '../core/subtitles.ts';
import { mux, probeDuration } from './ffmpeg.ts';
import {
  BadRequestError, createJob, explain, relativeFolder, settleJob, working, type Job,
} from './jobs.ts';
import { CancelledError, renderSpecToFile } from './render.ts';
import { burnWords, subsState } from './subs.ts';
import { synthesize } from './tts.ts';

/** How many pages walk frames at once. More than three starves the encoders. */
const CONCURRENCY = readConcurrency();

function readConcurrency(): number {
  const asked = Number(process.env['RENDER_CONCURRENCY'] ?? 2);
  return Number.isFinite(asked) ? clamp(Math.round(asked), 1, 4) : 2;
}

/**
 * Where the files go when they go to a launch rather than to a download:
 * archive name → the campaign folders, inside the launch, the file is copied
 * into. The plan has already been cut down to the files that have one.
 */
export interface BatchOutput {
  launchKey: string;
  destinations: Record<string, string[]>;
}

export interface BatchRequest {
  groups: BatchGroup[];
  /** The length the user set. A group only ever grows past it, to hold speech. */
  duration: number;
  fitToVoice: boolean;
  output?: BatchOutput;
}

/** Turns a campaign name into the folder its creatives go to, or throws for the buyer. */
export type FolderResolver = (launchKey: string, campaign: string) => string;

/**
 * Start an export. Returns at once with the id to watch it by — the work runs on
 * after this function has answered.
 */
export function startBatch(request: unknown, origin: string, resolve: FolderResolver): string {
  const { groups, duration, fitToVoice, output } = validate(request);
  // Folders are resolved before the job exists: a campaign that is not there
  // is a refusal the buyer reads now, not an error against every file later.
  let targets: Map<string, string[]> | null = null;
  if (output !== undefined) {
    const folders = new Map<string, string>();
    targets = new Map();
    for (const [name, campaigns] of Object.entries(output.destinations)) {
      const files: string[] = [];
      for (const campaign of campaigns) {
        let folder = folders.get(campaign);
        if (folder === undefined) {
          folder = resolve(output.launchKey, campaign);
          folders.set(campaign, folder);
        }
        files.push(path.join(folder, name));
      }
      targets.set(name, files);
    }
  }
  const job = createJob(groups.reduce((sum, g) => sum + g.items.length, 0), targets, 'cfs-batch-');
  void run(job, groups, duration, fitToVoice, origin);
  return job.id;
}

function validate(request: unknown): BatchRequest {
  const body = request as Partial<BatchRequest> | null;
  const groups = body?.groups;
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new BadRequestError('порожній план експорту');
  }
  for (const group of groups) {
    if (!group?.spec || !Array.isArray(group.items) || group.items.length === 0) {
      throw new BadRequestError('пошкоджений план експорту');
    }
    // Every item is a file name and three fields of speech. Checked to the
    // field rather than for presence: a half-built sound gets no further than
    // the first `script.trim()`, which happens after the group has rendered and
    // files are already on disk.
    for (const item of group.items) {
      const sound = item?.sound as Partial<Sound> | undefined;
      if (
        typeof item?.name !== 'string' || item.name === ''
        || typeof sound?.script !== 'string'
        || typeof sound.voiceId !== 'string'
        || typeof sound.modelId !== 'string'
        || (item.subtitles !== null && typeof item.subtitles !== 'string')
      ) {
        throw new BadRequestError('пошкоджений план експорту');
      }
    }
  }
  const duration = Number(body?.duration);
  if (!(duration > 0)) throw new BadRequestError('некоректна тривалість');
  const output = body?.output;
  if (output !== undefined) {
    if (typeof output?.launchKey !== 'string' || typeof output.destinations !== 'object' || output.destinations === null) {
      throw new BadRequestError('пошкоджена розкладка експорту');
    }
    for (const group of groups) {
      for (const item of group.items) {
        const to = output.destinations[item.name];
        if (!Array.isArray(to) || to.length === 0 || !to.every(c => typeof c === 'string')) {
          throw new BadRequestError(`файл ${item.name} не має теки призначення`);
        }
      }
    }
  }
  return { groups, duration, fitToVoice: body?.fitToVoice !== false, ...(output !== undefined ? { output } : {}) };
}

// ------------------------------------------------------------------- work --

interface Clip {
  file: string;
  seconds: number;
  /** The script's words on the voice's clock, or null when nobody asked for them. */
  words: Word[] | null;
}

async function run(
  job: Job,
  groups: readonly BatchGroup[],
  duration: number,
  fitToVoice: boolean,
  origin: string,
): Promise<void> {
  // Whether any file wants its words burned in. Decided once for the job: it
  // is what makes the voice come back with its timings, and what asks the
  // machine up front whether it can burn at all — before a single frame is
  // walked, not on the last step of the first file.
  const wantsWords = groups.some(g => g.items.some(i => i.subtitles !== null));
  if (wantsWords) {
    const state = await subsState();
    if (!state.burnReady) {
      settleJob(job, new Error('субтитри не готові на цій машині: ' + (state.notes.join('; ') || 'запусти ./setup.sh у корені ~/sa')));
      return;
    }
  }
  // One synthesis per distinct line, however many photos ask for it. This is the
  // cache the PRD asks for, and the reason a batch of twelve costs what one does.
  const voices = new Map<string, Promise<Clip>>();
  const queue = [...groups];

  const worker = async (): Promise<void> => {
    for (let group = queue.shift(); group !== undefined; group = queue.shift()) {
      if (job.cancelled) return;
      await renderGroup(job, group, { voices, duration, fitToVoice, origin, wantsWords });
    }
  };

  let crashed: Error | null = null;
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, groups.length) }, () => worker()),
    );
  } catch (e) {
    crashed = e as Error;
  }
  settleJob(job, crashed);
}

interface GroupContext {
  voices: Map<string, Promise<Clip>>;
  duration: number;
  fitToVoice: boolean;
  origin: string;
  /** Ask the voice for its timings, because some file will burn them. */
  wantsWords: boolean;
}

/**
 * One group: speak every line in it, walk the frames once, then lay each line
 * over that one video.
 *
 * The speech comes first because it decides how long the video is — trimming a
 * voice-over to a fixed length cuts the offer mid-sentence, so the video grows
 * to hold the longest line in the group instead.
 */
async function renderGroup(job: Job, group: BatchGroup, ctx: GroupContext): Promise<void> {
  // Null is a creative that is meant to be silent; an item missing from the map
  // is one whose speech failed and has already been counted against the job.
  const clips = new Map<string, Clip | null>();
  for (const item of group.items) {
    if (job.cancelled) return;
    try {
      clips.set(item.name, await working(job, item.name, () => voiceFor(job, item, ctx)));
    } catch (e) {
      // A language whose speech failed is one file lost, not a batch: the rest
      // of the group still has a video coming.
      job.errors.push({ name: item.name, message: explain(e) });
    }
  }
  if (job.cancelled) return;

  const seconds = [...clips.values()].filter((c): c is Clip => c !== null).map(c => c.seconds);
  const length = groupDuration(ctx.duration, seconds, ctx.fitToVoice);

  const silent = path.join(job.dir, `video-${group.key}.mp4`);
  job.scratch.push(silent);
  try {
    await working(job, group.items[0]!.name, () => renderSpecToFile(group.spec, silent, {
      origin: ctx.origin,
      duration: length,
      cancelled: () => job.cancelled,
    }));
  } catch (e) {
    if (e instanceof CancelledError) return;
    // The whole group shares one video, so losing it loses every file in it —
    // except the ones already counted as lost for want of a voice.
    for (const item of group.items) {
      if (clips.has(item.name)) job.errors.push({ name: item.name, message: explain(e) });
    }
    return;
  }

  for (const item of group.items) {
    if (job.cancelled) return;
    if (!clips.has(item.name)) continue;
    const clip = clips.get(item.name)!;
    // Made in scratch and moved into place whole: a campaign folder must never
    // hold a file ffmpeg was half-way through when it failed or was cancelled.
    const made = path.join(job.dir, item.name);
    const [out = made, ...copies] = job.targets?.get(item.name) ?? [];
    try {
      await working(job, item.name, async () => {
        if (clip === null) await fs.promises.copyFile(silent, made);
        else await mux(silent, clip.file, made);
        // The burn is a step after the mux, on this one file: the video was
        // drawn once for the group, and the words differ per language. A
        // silent creative has nothing to say and stays clean, without a
        // complaint — an empty script is a choice the panel already explains.
        if (item.subtitles !== null && clip !== null) {
          // No words means the alignment did not spell the script: the file
          // is refused rather than shipped clean under a ticked box.
          if (clip.words === null) throw new Error('субтитри не лягли: розмітка ElevenLabs не збіглась зі скриптом — файл не записано');
          await burn(job, item.name, made, item.subtitles, clip.words);
        }
        if (out !== made) await fs.promises.rename(made, out);
        // The same file in every other campaign of its language: copied, not
        // rendered again, and after the move so no folder ever holds a half.
        for (const copy of copies) await fs.promises.copyFile(out, copy);
      });
      job.outputs.push({ name: item.name, file: out });
      if (job.targets !== null) for (const file of [out, ...copies]) job.folders.add(relativeFolder(file));
    } catch (e) {
      job.errors.push({ name: item.name, message: explain(e) });
    }
  }
}

/** The speech for one item, or null when it has nothing to say. */
async function voiceFor(job: Job, item: BatchItem, ctx: GroupContext): Promise<Clip | null> {
  const { script, voiceId, modelId } = item.sound;
  // An empty script is a silent video, not a missing one — no key needed, no
  // charge, no separate mode.
  if (script.trim() === '') return null;

  const key = `${modelId} ${voiceId} ${script}`;
  let pending = ctx.voices.get(key);
  if (pending === undefined) {
    pending = speak(job, script, voiceId, modelId, ctx.wantsWords);
    ctx.voices.set(key, pending);
  }
  return pending;
}

async function speak(
  job: Job,
  script: string,
  voiceId: string,
  modelId: string,
  withWords: boolean,
): Promise<Clip> {
  const file = path.join(job.dir, `voice-${crypto.randomUUID()}.mp3`);
  const speech = await synthesize(script, voiceId, modelId, withWords);
  await fs.promises.writeFile(file, speech.audio);
  job.scratch.push(file);
  // Timed off the script the voice was given — the same words, verbatim. An
  // alignment that does not spell it is dropped here, and the file goes out
  // clean rather than with words on the wrong beats.
  const words = speech.alignment === null ? null : wordsFromAlignment(script.trim(), speech.alignment);
  return { file, seconds: await probeDuration(file), words };
}

/**
 * Burn `words` into `video` in place, by way of a scratch file: the pipeline
 * writes a new file, and only a finished one replaces the muxed original, so
 * a burn that fails leaves the file exactly as the mux left it — and the
 * error against the file says why the words are not on it.
 */
async function burn(job: Job, name: string, video: string, style: string, words: readonly Word[]): Promise<void> {
  const id = crypto.randomUUID();
  const wordsFile = path.join(job.dir, `words-${id}.json`);
  const burned = path.join(job.dir, `burned-${id}.mp4`);
  job.scratch.push(wordsFile, burned);
  await fs.promises.writeFile(wordsFile, JSON.stringify(words));
  // The file's own entry on the board is renamed for the step rather than
  // joined by a second one, so the panel reads `субтитри` and not the file twice.
  job.active.delete(name);
  try {
    await working(job, `${name}: субтитри`, () => burnWords(video, burned, style, wordsFile));
  } finally {
    job.active.add(name);
  }
  await fs.promises.rename(burned, video);
}

