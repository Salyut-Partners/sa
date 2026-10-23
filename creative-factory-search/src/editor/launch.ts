// Running a launch and watching it: the render first, then the writes to the
// platform, each a job on the server the editor asks after until it stops.
// A file is rendered again only when what it is made of changed — its picture,
// its words, its length — since a render the server still has; the rest are
// taken from the renders before, so unticking a language or pressing «Спробувати
// ще» does not walk the same frames twice.
import { useCallback, useRef, useState } from 'react';
import { keepItems, type BatchPlan } from '../core/batch.ts';
import type { LocaleId } from '../core/types.ts';
import { jobStatus, startBatch, startLaunch, type JobStatus, type LaunchForm, type LaunchLine, type StagedFile } from './server.ts';

const POLL_MS = 700;

export type LaunchPhase = 'idle' | 'render' | 'launch' | 'done' | 'failed';

export interface LaunchInput {
  /** The ticked renders, planned; null when only files from disk go. */
  plan: BatchPlan | null;
  duration: number;
  fitToVoice: boolean;
  topicId: number;
  form: LaunchForm;
  /** Files from disk with the words each speaks — its `ad_script`. */
  disk: (StagedFile & { script: string })[];
  /** The pictures behind the ticked renders, for the topic's sources folder. */
  sources: { name: string; image: string }[];
}

export interface LaunchRun {
  phase: LaunchPhase;
  render: JobStatus | null;
  /** What the render in flight makes, by name and language — for a line per language. */
  rendering: { name: string; locale: LocaleId }[];
  launch: JobStatus | null;
  /** The launch's lines in order — what it reuses, then what it writes — shown before each is done. */
  lines: LaunchLine[];
  warnings: string[];
  /** Why it stopped, in a sentence, when it did not finish. */
  error: string;
  running: boolean;
  start: (input: LaunchInput) => void;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Failed asks in a row before a job is given up on — about ten seconds, so one blip does not end a launch that is still going. */
const MISSES_ALLOWED = 14;

/** Ask after a job until it stops, handing every status on the way to `seen`. */
async function follow(id: string, seen: (status: JobStatus) => void): Promise<JobStatus> {
  let misses = 0;
  for (;;) {
    let status: JobStatus;
    try {
      status = await jobStatus(id);
      misses = 0;
    } catch (e) {
      if (++misses >= MISSES_ALLOWED) throw e;
      await sleep(POLL_MS);
      continue;
    }
    seen(status);
    if (status.state !== 'running') return status;
    await sleep(POLL_MS);
  }
}

/** A file's identity: the picture its group draws (the group key hashes the frame), its sound, its words, its length. */
const itemKey = (groupKey: string, item: BatchPlan['groups'][number]['items'][number], duration: number, fitToVoice: boolean): string =>
  JSON.stringify({ groupKey, name: item.name, sound: item.sound, subtitles: item.subtitles, duration, fitToVoice });

/** The server swept a render the cache still pointed at: render again. */
const gone = (message: string): boolean => /рендер уже прибрано|у рендері немає/.test(message);

export function useLaunch(): LaunchRun {
  const [phase, setPhase] = useState<LaunchPhase>('idle');
  const [render, setRender] = useState<JobStatus | null>(null);
  const [rendering, setRendering] = useState<{ name: string; locale: LocaleId }[]>([]);
  const [launch, setLaunch] = useState<JobStatus | null>(null);
  const [lines, setLines] = useState<LaunchLine[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  /** File identity → the render job that made it and its name there. */
  const rendered = useRef(new Map<string, { job: string; name: string }>());

  /** Every ticked file as a finished render, rendering the ones no render has yet. */
  const renders = useCallback(async (input: LaunchInput): Promise<{ job: string; name: string }[]> => {
    if (input.plan === null) return [];
    const { plan, duration, fitToVoice } = input;
    const keyed = plan.groups.flatMap(g => g.items.map(item => ({ item, key: itemKey(g.key, item, duration, fitToVoice) })));
    const missing = new Set(keyed.filter(k => !rendered.current.has(k.key)).map(k => k.item.name));
    if (missing.size > 0) {
      const todo = keepItems(plan, missing);
      setPhase('render');
      setRender(null);
      setRendering(todo.groups.flatMap(g => g.items.map(i => ({ name: i.name, locale: i.locale }))));
      const started = await startBatch(todo, duration, fitToVoice);
      const done = await follow(started.id, setRender);
      const failures = done.errors.map(e => `${e.name}: ${e.message}`).join('; ');
      if (done.state !== 'done') throw new Error(failures || 'рендер не вдався');
      for (const k of keyed) if (missing.has(k.item.name) && done.finished.includes(k.item.name)) rendered.current.set(k.key, { job: started.id, name: k.item.name });
      if (done.errors.length > 0) throw new Error('не всі файли відрендерились: ' + failures);
    }
    return keyed.map(k => rendered.current.get(k.key)!);
  }, []);

  const start = useCallback((input: LaunchInput) => {
    setError('');
    setLaunch(null);
    setLines([]);
    setWarnings([]);
    const scripts = Object.fromEntries((input.plan?.groups ?? []).flatMap(g => g.items.map(i => [i.name, i.sound.script])));
    const request = async () => {
      const ready = await renders(input);
      setPhase('launch');
      return startLaunch({
        topicId: input.topicId, form: input.form, renders: ready, scripts,
        disk: input.disk.map(d => ({ id: d.id, name: d.name, script: d.script })), sources: input.sources,
      });
    };
    void (async () => {
      let started: Awaited<ReturnType<typeof startLaunch>>;
      setPhase(input.plan === null ? 'launch' : 'render');
      try {
        started = await request();
      } catch (e) {
        // The server keeps only the last few renders: one it swept is made again, once, without asking.
        if (!gone((e as Error).message)) throw e;
        rendered.current.clear();
        started = await request();
      }
      setLines(started.lines);
      setWarnings(started.warnings);
      const done = await follow(started.id, setLaunch);
      if (done.state !== 'done') throw new Error(done.errors.map(e => e.message).join('; ') || 'залив не вдався');
      setPhase('done');
    })().catch(e => {
      setError((e as Error).message);
      setPhase('failed');
    });
  }, [renders]);

  return { phase, render, rendering, launch, lines, warnings, error, running: phase === 'render' || phase === 'launch', start };
}
