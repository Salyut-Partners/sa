// Subtitles for a video that did not come out of the editor — from a designer,
// from a phone, from Grok. The Python pipeline in `../subs` does the work as
// it does for the watcher; this file runs it as a job, one file at a time,
// because two Whispers at once is one Mac on its knees.
//
// Nothing about a style is known here. The list comes from the pipeline's
// `--list-styles`, what is missing on the machine from its `--check`, and
// both are explained in the panel rather than discovered on the first file.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSetupCheck, parseStyleCatalogue, subtitledName, uniqueName, type StyleCatalogue,
} from '../core/subtitles.ts';
import { createJob, explain, relativeFolder, settleJob, type Job } from './jobs.ts';
import { RefusedError } from './launches.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The sibling in the mono-repo. */
export const SUBS_ROOT = path.join(here, '..', '..', '..', 'subs');
const TECHNICAL = path.join(SUBS_ROOT, 'technical');
const STYLER = path.join(TECHNICAL, 'subtitle_styler.py');
const VENV_PYTHON = path.join(TECHNICAL, '.venv', 'bin', 'python');
/** Where the watcher puts its results, and where the tab puts them when no campaign is chosen. */
export const SUBS_OUTPUT = path.join(SUBS_ROOT, 'output');

/** How long an answer about the machine is trusted before the pipeline is asked again. */
const STATE_TTL_MS = 20_000;

export interface SubsState {
  /** Whether a file dropped now would come out the other end. */
  ready: boolean;
  styles: StyleCatalogue | null;
  /** What to install or run, one sentence each, when `ready` is false. */
  notes: string[];
}

interface Printed {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runPython(python: string, args: readonly string[]): Promise<Printed> {
  return new Promise(resolve => {
    const child = spawn(python, [STYLER, ...args], { cwd: TECHNICAL, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', e => resolve({ code: null, stdout, stderr: e.message }));
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

/** The last line something printed — where Python puts the sentence that matters. */
const lastLine = (text: string): string => text.trim().split('\n').pop() ?? '';

let cached: { at: number; state: Promise<SubsState> } | null = null;

/** What the machine can do about subtitles, as the panel shows it. */
export function subsState(): Promise<SubsState> {
  if (cached !== null && Date.now() - cached.at < STATE_TTL_MS) return cached.state;
  const state = readState();
  cached = { at: Date.now(), state };
  return state;
}

async function readState(): Promise<SubsState> {
  const notes: string[] = [];
  if (!fs.existsSync(STYLER)) {
    return { ready: false, styles: null, notes: [`пайплайну субтитрів немає: очікую ${STYLER}`] };
  }
  const venv = fs.existsSync(VENV_PYTHON);
  // The style list needs nothing but the standard library, so a machine that
  // has not run setup.sh yet still sees the six styles — and a note saying why
  // dropping a file would not work.
  const python = venv ? VENV_PYTHON : 'python3';
  const listed = await runPython(python, ['--list-styles']);
  const styles = parseStyleCatalogue(listed.stdout);
  if (styles === null) {
    notes.push('не вдалось прочитати стилі з subtitle_styler.py: ' + (lastLine(listed.stderr) || 'порожня відповідь'));
  }
  // The check runs even without a venv, on the system Python, so a machine
  // missing ffmpeg-full and the venv hears about both at once rather than
  // one per round of setup.
  if (!venv) notes.push('немає venv у subs/technical — запусти ./setup.sh у корені ~/sa');
  const checked = await runPython(python, ['--check']);
  const check = parseSetupCheck(checked.stdout);
  if (check === null) notes.push('перевірка оточення не запустилась: ' + lastLine(checked.stderr));
  else notes.push(...check.missing.filter(line => venv || !line.startsWith('не встановлено')));
  return { ready: styles !== null && notes.length === 0, styles, notes };
}

export interface SubtitleRequest {
  /** The file's own name, as dropped. */
  name: string;
  style: string;
  /** A language code for Whisper, or null to let it guess. */
  lang: string | null;
  /** The folder the result is written to. */
  dest: string;
}

/** One at a time: Whisper is the whole machine while it runs. */
let lane: Promise<void> = Promise.resolve();

/**
 * Take an upload, then subtitle it. The body is streamed to the job's scratch
 * folder before the id is answered, so a job that exists has its file; the
 * pipeline is run on the lane after that, with the job watching its stdout.
 */
export async function startSubtitles(body: NodeJS.ReadableStream, request: SubtitleRequest): Promise<string> {
  const state = await subsState();
  if (state.styles === null || !state.styles.styles.some(s => s.id === request.style)) {
    throw new RefusedError(`невідомий стиль субтитрів: \`${request.style}\``);
  }
  if (!state.ready) throw new RefusedError('субтитри не готові на цій машині: ' + state.notes.join('; '));
  const name = path.basename(request.name).replace(/[/\\]/g, '_');
  if (name === '' || name.startsWith('.')) throw new RefusedError('у файлу немає імені');
  fs.mkdirSync(request.dest, { recursive: true });

  const job = createJob(1, new Map(), 'cfs-subs-');
  const input = path.join(job.dir, name);
  job.scratch.push(input);
  job.active.add(`${name}: завантаження`);
  try {
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(input);
      body.on('error', reject);
      out.on('error', reject);
      out.on('finish', () => resolve());
      body.pipe(out);
    });
  } catch (e) {
    job.errors.push({ name, message: 'файл не довантажився: ' + explain(e) });
    settleJob(job, null);
    return job.id;
  } finally {
    job.active.clear();
  }

  job.active.add(`${name}: у черзі`);
  lane = lane.then(() => burn(job, name, input, request)).catch(() => {});
  return job.id;
}

function burn(job: Job, name: string, input: string, request: SubtitleRequest): Promise<void> {
  return new Promise(resolve => {
    if (job.cancelled) {
      settleJob(job, null);
      resolve();
      return;
    }
    // Named on the lane, not at upload: two drops of `clip.mp4` queued
    // together would otherwise both be told `clip.yellow.mp4` and the second
    // would write over the first.
    const output = path.join(request.dest, uniqueName(
      subtitledName(name, request.style), n => fs.existsSync(path.join(request.dest, n)),
    ));
    job.targets!.set(name, output);
    const args = [STYLER, input, '-o', output, '--style', request.style];
    if (request.lang !== null) args.push('--lang', request.lang);
    const child = spawn(VENV_PYTHON, args, { cwd: TECHNICAL, stdio: ['ignore', 'pipe', 'pipe'] });
    job.onCancel = () => child.kill('SIGTERM');

    let stderr = '';
    let tail = '';
    // The pipeline narrates its stages one line at a time — transcribing, N
    // words, burning — and those lines are the progress the panel shows.
    child.stdout.on('data', d => {
      tail += String(d);
      const lines = tail.split('\n');
      tail = lines.pop() ?? '';
      const last = lines.map(l => l.replace(/^\s*→\s*/, '').trim()).filter(l => l !== '').pop();
      if (last !== undefined) {
        job.active.clear();
        job.active.add(`${name}: ${last}`);
      }
    });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', e => {
      job.errors.push({ name, message: 'не вдалось запустити пайплайн: ' + e.message });
      settleJob(job, null);
      resolve();
    });
    child.on('close', code => {
      job.onCancel = null;
      if (job.cancelled) {
        fs.promises.unlink(output).catch(() => {});
      } else if (code === 0 && fs.existsSync(output)) {
        job.outputs.push({ name, file: output });
        job.folders.add(request.dest === SUBS_OUTPUT ? 'subs/output' : relativeFolder(output));
      } else {
        const why = stderr.trim().split('\n').filter(l => l.trim() !== '').slice(-3).join(' · ');
        job.errors.push({ name, message: why === '' ? `пайплайн вийшов із кодом ${code}` : why });
      }
      settleJob(job, null);
      resolve();
    });
  });
}
