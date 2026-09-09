// The export queue.
//
// A batch of a dozen photos across seven languages is hundreds of screenshots
// and minutes of wall clock, so it cannot be an HTTP request the browser waits
// on: posting one starts a job and gets an id back, and the editor watches it
// while the user keeps working. Jobs live in this process and no further —
// restarting the server loses whatever was in flight, which is the right trade
// for a tool one person runs on their own machine.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { groupDuration, type BatchGroup, type BatchItem, type Sound } from '../core/batch.ts';
import { clamp } from '../core/canvas.ts';
import { mux, probeDuration } from './ffmpeg.ts';
import { CancelledError, renderSpecToFile } from './render.ts';
import { synthesize } from './tts.ts';

/** How many pages walk frames at once. More than three starves the encoders. */
const CONCURRENCY = readConcurrency();

function readConcurrency(): number {
  const asked = Number(process.env['RENDER_CONCURRENCY'] ?? 2);
  return Number.isFinite(asked) ? clamp(Math.round(asked), 1, 4) : 2;
}

/** How many finished jobs are kept for their archive before being swept. */
const KEEP_JOBS = 6;

/**
 * Where the files go when they go to a launch rather than to a download:
 * archive name → campaign folder name, inside the launch. The plan has
 * already been cut down to the files that have a destination.
 */
export interface BatchOutput {
  launchKey: string;
  destinations: Record<string, string>;
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

export type JobState = 'running' | 'done' | 'cancelled' | 'failed';

export interface JobFailure {
  name: string;
  message: string;
}

export interface JobStatus {
  id: string;
  state: JobState;
  /** Files finished, of files planned. */
  done: number;
  total: number;
  /** What is being made right now, by name — where a failure would be. */
  current: string;
  errors: JobFailure[];
  /** Seconds since it started, and the guess at how many are left. */
  elapsed: number;
  remaining: number | null;
  /** Whether there is anything to download. Never for a job that wrote to folders. */
  ready: boolean;
  /** The campaign folders files were written to, relative to the launch, when they were. */
  folders: string[];
}

interface Output {
  name: string;
  file: string;
}

interface Job {
  id: string;
  state: JobState;
  total: number;
  /**
   * What is being worked on right now — a set, because several workers are.
   * One field would name whichever of them wrote to it last, which is the one
   * question a user watching a stalled export is not asking.
   */
  active: Set<string>;
  errors: JobFailure[];
  outputs: Output[];
  startedAt: number;
  finishedAt: number | null;
  cancelled: boolean;
  /**
   * Whether the workers have actually stopped. Cancelling flips the state at
   * once so the user sees it, but a render in flight runs on to its next frame
   * check — and a job whose dir is deleted underneath it would fail loudly on
   * its way out.
   */
  settled: boolean;
  dir: string;
  /** Everything on disk this job made, so cancelling can clean up after itself. */
  scratch: string[];
  /**
   * Archive name → the file it is written as, for a job going to a launch.
   * Null is a download: everything stays in `dir` until it is fetched.
   */
  targets: Map<string, string> | null;
  /** Campaign folders that received at least one file, as `campaigns/<name>/creatives`. */
  folders: Set<string>;
}

const jobs = new Map<string, Job>();

export class BadRequestError extends Error {}

/**
 * Start an export. Returns at once with the id to watch it by — the work runs on
 * after this function has answered.
 */
export function startBatch(request: unknown, origin: string, resolve: FolderResolver): string {
  const { groups, duration, fitToVoice, output } = validate(request);
  // Folders are resolved before the job exists: a campaign that is not there
  // is a refusal the buyer reads now, not an error against every file later.
  let targets: Map<string, string> | null = null;
  if (output !== undefined) {
    const folders = new Map<string, string>();
    targets = new Map();
    for (const [name, campaign] of Object.entries(output.destinations)) {
      let folder = folders.get(campaign);
      if (folder === undefined) {
        folder = resolve(output.launchKey, campaign);
        folders.set(campaign, folder);
      }
      targets.set(name, path.join(folder, name));
    }
  }
  const id = crypto.randomUUID();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfs-batch-'));
  const job: Job = {
    id,
    state: 'running',
    total: groups.reduce((sum, g) => sum + g.items.length, 0),
    active: new Set(),
    errors: [],
    outputs: [],
    startedAt: Date.now(),
    finishedAt: null,
    cancelled: false,
    settled: false,
    dir,
    scratch: [],
    targets,
    folders: new Set(),
  };
  jobs.set(id, job);
  sweep();

  void run(job, groups, duration, fitToVoice, origin);
  return id;
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
        if (typeof output.destinations[item.name] !== 'string') {
          throw new BadRequestError(`файл ${item.name} не має теки призначення`);
        }
      }
    }
  }
  return { groups, duration, fitToVoice: body?.fitToVoice !== false, ...(output !== undefined ? { output } : {}) };
}

export const jobById = (id: string): Job | undefined => jobs.get(id);

export function statusOf(job: Job): JobStatus {
  const done = job.outputs.length + job.errors.length;
  const elapsed = ((job.finishedAt ?? Date.now()) - job.startedAt) / 1000;
  return {
    id: job.id,
    state: job.state,
    done,
    total: job.total,
    current: [...job.active].join(' · '),
    errors: job.errors,
    elapsed,
    // Nothing to extrapolate from until something has finished, and saying
    // "about a minute" before the first frame is a guess dressed as a number.
    remaining: done === 0 || job.state !== 'running'
      ? null
      : (elapsed / done) * (job.total - done),
    ready: job.targets === null && job.outputs.length > 0 && job.state !== 'running',
    folders: [...job.folders].sort(),
  };
}

/** What the archive holds, or nothing while the job is still making it. */
export const outputsOf = (job: Job): Output[] => (job.state === 'running' ? [] : job.outputs);

export function cancelJob(job: Job): void {
  if (job.state !== 'running') return;
  job.cancelled = true;
  job.state = 'cancelled';
  job.finishedAt = Date.now();
  job.active.clear();
}

/** Drop a job and everything it left on disk. */
export function forgetJob(job: Job): void {
  jobs.delete(job.id);
  fs.promises.rm(job.dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Keep the last few jobs for their archives; the rest are disk nobody will ask
 * for. Only settled ones: a cancelled job reads as finished the instant it is
 * asked to stop, but its workers are still writing into that directory.
 */
function sweep(): void {
  const done = [...jobs.values()].filter(j => j.settled);
  for (const job of done.slice(0, Math.max(0, done.length - KEEP_JOBS))) forgetJob(job);
}

// ------------------------------------------------------------------- work --

interface Clip {
  file: string;
  seconds: number;
}

async function run(
  job: Job,
  groups: readonly BatchGroup[],
  duration: number,
  fitToVoice: boolean,
  origin: string,
): Promise<void> {
  // One synthesis per distinct line, however many photos ask for it. This is the
  // cache the PRD asks for, and the reason a batch of twelve costs what one does.
  const voices = new Map<string, Promise<Clip>>();
  const queue = [...groups];

  const worker = async (): Promise<void> => {
    for (let group = queue.shift(); group !== undefined; group = queue.shift()) {
      if (job.cancelled) return;
      await renderGroup(job, group, { voices, duration, fitToVoice, origin });
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, groups.length) }, () => worker()),
    );
    if (!job.cancelled) {
      job.state = job.outputs.length === 0 && job.errors.length > 0 ? 'failed' : 'done';
    }
  } catch (e) {
    // Only something outside a single creative reaches here — the browser
    // failing to launch, ffmpeg missing. A creative's own failure is recorded
    // against it and the rest of the batch carries on.
    if (!job.cancelled) {
      job.state = 'failed';
      job.errors.push({ name: '—', message: (e as Error).message });
    }
  } finally {
    job.active.clear();
    job.finishedAt ??= Date.now();
    job.settled = true;
    for (const file of job.scratch) fs.promises.unlink(file).catch(() => {});
    job.scratch = [];
  }
}

/**
 * Run one step with its name on the board, and take it off again however the
 * step ends. This is what keeps `current` honest across parallel workers.
 */
async function working<T>(job: Job, name: string, step: () => Promise<T>): Promise<T> {
  job.active.add(name);
  try {
    return await step();
  } finally {
    job.active.delete(name);
  }
}

interface GroupContext {
  voices: Map<string, Promise<Clip>>;
  duration: number;
  fitToVoice: boolean;
  origin: string;
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
    const out = job.targets?.get(item.name) ?? path.join(job.dir, item.name);
    try {
      await working(job, item.name, () =>
        clip === null ? fs.promises.copyFile(silent, out) : mux(silent, clip.file, out));
      job.outputs.push({ name: item.name, file: out });
      if (job.targets !== null) job.folders.add(relativeFolder(out));
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

  const key = `${modelId} ${voiceId} ${script}`;
  let pending = ctx.voices.get(key);
  if (pending === undefined) {
    pending = speak(job, script, voiceId, modelId);
    ctx.voices.set(key, pending);
  }
  return pending;
}

async function speak(
  job: Job,
  script: string,
  voiceId: string,
  modelId: string,
): Promise<Clip> {
  const file = path.join(job.dir, `voice-${crypto.randomUUID()}.mp3`);
  await fs.promises.writeFile(file, await synthesize(script, voiceId, modelId));
  job.scratch.push(file);
  return { file, seconds: await probeDuration(file) };
}

/** `campaigns/<name>/creatives` out of a full path, for the panel to name. */
const relativeFolder = (file: string): string =>
  path.dirname(file).split(path.sep).slice(-3).join('/');

/**
 * A failure in the words the panel will show.
 *
 * Every error this pipeline can raise already carries a sentence written for the
 * user — a missing key, a missing ffmpeg, a spec that will not render — so the
 * message is the whole of it, and a stack trace would only be noise in a list of
 * creatives that did not come out.
 */
const explain = (e: unknown): string => (e as Error)?.message || String(e);
