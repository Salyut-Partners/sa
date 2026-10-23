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

/**
 * Finished jobs are kept for their outputs — a download, or a launch taking
 * the renders — by age rather than by count alone: with six kept, a handful
 * of subtitle files (a job each) swept away the export a launch was about to
 * take. The newest few stay whatever their age, and a ceiling bounds the disk.
 */
const KEEP_JOBS = 6;
const KEEP_FOR_MS = 3 * 60 * 60_000;
const KEEP_AT_MOST = 60;

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
  /** What a launch made, once it has: where to find it and what it is. */
  result: { url: string; label: string } | null;
  /** Every step of a launch done so far, by its label, in order. */
  finished: string[];
  /** How far along each piece of work in flight is — frames of a render, bytes of an upload — by its name. */
  progress: Record<string, Progress>;
}

export interface Progress {
  done: number;
  total: number;
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
   * Output name → the files it is written as, for a job writing to a folder
   * of its own — the subtitles' `subs/output`. Null is a download: everything
   * stays in `dir` until it is fetched, or a launch takes it.
   */
  targets: Map<string, string[]> | null;
  /** Folders that received at least one file, for the panel to name. */
  folders: Set<string>;
  /** Something to do the moment the job is cancelled — kill a child, say. */
  onCancel: (() => void) | null;
  /** What a launch made, once it has. */
  result: { url: string; label: string } | null;
  /** Name → how far along it is, while it is in flight. */
  progress: Map<string, Progress>;
}

const jobs = new Map<string, Job>();

export class BadRequestError extends Error {}

/** A request the buyer got wrong, or one the platform will not allow: the message is for them, and nothing was made. */
export class RefusedError extends Error {}

/** A new running job, registered and given its scratch folder. */
export function createJob(total: number, targets: Map<string, string[]> | null, prefix: string): Job {
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
    result: null,
    progress: new Map(),
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
    result: job.result,
    finished: job.outputs.map(o => o.name),
    progress: Object.fromEntries(job.progress),
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
  job.progress.clear();
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
  const now = Date.now();
  done.forEach((job, i) => {
    const newer = done.length - 1 - i;
    const old = now - (job.finishedAt ?? now) > KEEP_FOR_MS;
    if (newer >= KEEP_AT_MOST || (newer >= KEEP_JOBS && old)) forgetJob(job);
  });
}

/** A job folder by its `mkdtemp` name — a prefix and six characters; `sa-launch-files`, the staged files, is not one. */
const JOB_DIR = /^(cfs-batch|cfs-subs|sa-launch)-[A-Za-z0-9]{6}$/;

/**
 * Remove job folders an earlier run of the server left behind. Jobs live only
 * in the process, so at startup no folder of that shape belongs to anyone; a
 * server killed mid-render used to leave its frames and mp4s for good.
 */
export function removeLeftovers(): void {
  const tmp = os.tmpdir();
  for (const name of fs.readdirSync(tmp)) {
    if (name === 'sa-launch-files' || !JOB_DIR.test(name)) continue;
    fs.promises.rm(path.join(tmp, name), { recursive: true, force: true }).catch(() => {});
  }
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

/** A failure in the words the panel will show: the message is the whole of it. */
export const explain = (e: unknown): string => (e as Error)?.message || String(e);
