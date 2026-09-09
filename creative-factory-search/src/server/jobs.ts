// The job registry: what an export and a subtitle run have in common.
//
// A job is work the browser cannot wait on — minutes of frames, or Whisper on
// a two-minute clip — so posting one gets an id back and the editor asks after
// it until it stops. Jobs live in this process and no further: restarting the
// server loses whatever was in flight, the right trade for a tool one person
// runs on their own machine. What the job *does* is the caller's; what it
// reports, and how it is cancelled and swept, is here.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** How many finished jobs are kept for their outputs before being swept. */
const KEEP_JOBS = 6;

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
  /** The folders files were written to, when they went to folders rather than a download. */
  folders: string[];
}

export interface Output {
  name: string;
  file: string;
}

export interface Job {
  id: string;
  state: JobState;
  total: number;
  /**
   * What is being worked on right now — a set, because several workers may be.
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
  /** Scratch space for this job alone, removed when the job is swept. */
  dir: string;
  /** Files this job made on its way, deleted when it settles. */
  scratch: string[];
  /**
   * Output name → the file it is written as, for a job going to folders. Null
   * is a download: everything stays in `dir` until it is fetched.
   */
  targets: Map<string, string> | null;
  /** Folders that received at least one file, for the panel to name. */
  folders: Set<string>;
  /** Something to do the moment the job is cancelled — kill a child, say. */
  onCancel: (() => void) | null;
}

const jobs = new Map<string, Job>();

export class BadRequestError extends Error {}

/** A new running job, registered and given its scratch folder. */
export function createJob(total: number, targets: Map<string, string> | null, prefix: string): Job {
  const job: Job = {
    id: crypto.randomUUID(),
    state: 'running',
    total,
    active: new Set(),
    errors: [],
    outputs: [],
    startedAt: Date.now(),
    finishedAt: null,
    cancelled: false,
    settled: false,
    dir: fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
    scratch: [],
    targets,
    folders: new Set(),
    onCancel: null,
  };
  jobs.set(job.id, job);
  sweep();
  return job;
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
  job.onCancel?.();
}

/**
 * Close a job out once its work has stopped, however it stopped: the state is
 * decided from what came out, the scratch files go, and the job becomes
 * eligible for sweeping.
 */
export function settleJob(job: Job, crashed: Error | null): void {
  if (!job.cancelled) {
    if (crashed !== null) {
      // Only something outside a single file reaches here — the browser
      // failing to launch, ffmpeg missing. A file's own failure is recorded
      // against it and the rest of the job carries on.
      job.state = 'failed';
      job.errors.push({ name: '—', message: crashed.message });
    } else {
      job.state = job.outputs.length === 0 && job.errors.length > 0 ? 'failed' : 'done';
    }
  }
  job.active.clear();
  job.finishedAt ??= Date.now();
  job.settled = true;
  for (const file of job.scratch) fs.promises.unlink(file).catch(() => {});
  job.scratch = [];
}

/** Drop a job and everything it left on disk. */
export function forgetJob(job: Job): void {
  jobs.delete(job.id);
  fs.promises.rm(job.dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Keep the last few jobs for their outputs; the rest are disk nobody will ask
 * for. Only settled ones: a cancelled job reads as finished the instant it is
 * asked to stop, but its workers are still writing into that directory.
 */
function sweep(): void {
  const done = [...jobs.values()].filter(j => j.settled);
  for (const job of done.slice(0, Math.max(0, done.length - KEEP_JOBS))) forgetJob(job);
}

/**
 * Run one step with its name on the board, and take it off again however the
 * step ends. This is what keeps `current` honest across parallel workers.
 */
export async function working<T>(job: Job, name: string, step: () => Promise<T>): Promise<T> {
  job.active.add(name);
  try {
    return await step();
  } finally {
    job.active.delete(name);
  }
}

/** `campaigns/<name>/creatives` out of a full path, for the panel to name. */
export const relativeFolder = (file: string): string =>
  path.dirname(file).split(path.sep).slice(-3).join('/');

/** A failure in the words the panel will show: the message is the whole of it. */
export const explain = (e: unknown): string => (e as Error)?.message || String(e);
