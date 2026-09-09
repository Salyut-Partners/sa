// The batch's place in the launch tree: which topic folder it lives in and which
// `batches/<batch>` it is. Opening and saving go through the server, which owns
// the disk; this hook owns the binding and the one question the header has to
// answer — whether what is on screen has reached that folder.
//
// Two stores, one source. The autosave in IndexedDB is the browser's memory of
// the session and nothing more: it is what comes back after a reload. The
// folder is the batch. The binding is kept in localStorage so a reload still
// knows which folder the memory belongs to, and the first thing done after one
// is to read the folder back and compare, so the header never guesses.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isBatchName } from '../core/batch-folder.ts';
import { fromFile, toFile } from '../core/serialize.ts';
import type { Project } from '../core/types.ts';
import { explainRefusal } from './project-file.ts';
import { fetchBatches, fetchLaunches, readBatch, writeBatch } from './server.ts';

export interface BatchLocation {
  launchKey: string;
  batch: string;
}

const KEY = 'cfs-batch';

function readLocation(): BatchLocation | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof stored !== 'object' || stored === null) return null;
    const { launchKey, batch } = stored as Record<string, unknown>;
    return typeof launchKey === 'string' && isBatchName(batch) ? { launchKey, batch } : null;
  } catch {
    return null;
  }
}

function writeLocation(location: BatchLocation | null): void {
  try {
    if (location === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(location));
  } catch {
    // Nothing to do: the binding lasts the session and is forgotten on reload.
  }
}

/**
 * The parts of a project that reach a saved file, by identity.
 *
 * Commands return the same object when nothing changed and a fresh one when
 * something did, and undo hands back the very object it stepped over — so
 * comparing identities answers "has the file changed" without serialising a
 * batch of photos on every render.
 */
interface Fingerprint {
  photos: Project['photos'];
  locales: Project['locales'];
  scalars: string;
}

const fingerprint = (project: Project): Fingerprint => ({
  photos: project.photos,
  locales: project.locales,
  scalars: [
    project.canvas.width, project.canvas.height, project.fps, project.duration,
    project.voiceId, project.modelId, project.fitToVoice,
  ].join('/'),
});

const same = (a: Fingerprint | null, b: Fingerprint): boolean =>
  a !== null && a.photos === b.photos && a.locales === b.locales && a.scalars === b.scalars;

export interface TopicBatch {
  location: BatchLocation | null;
  /** The launch keys the server knows, and the batches of the chosen one. */
  launches: string[];
  batches: string[];
  /** The topic being browsed in the panel — bound or not yet. */
  launchKey: string;
  /** Whether the project on screen differs from the file in the folder. */
  dirty: boolean;
  busy: boolean;
  /** The last thing worth saying, and whether it was a failure. */
  note: string;
  failed: boolean;
  /** Empty when the server answered; otherwise why the tree cannot be shown. */
  offline: string;
  browse: (launchKey: string) => void;
  open: (batch: string) => void;
  /** Save into the bound batch, or into a new one under the browsed topic. */
  save: (batch?: string) => void;
  /** Forget the binding; the project stays on screen and the folder stays as it is. */
  unbind: () => void;
}

export function useTopicBatch(
  project: Project,
  replaceProject: (next: Project) => void,
): TopicBatch {
  const [location, setLocation] = useState<BatchLocation | null>(readLocation);
  const [launches, setLaunches] = useState<string[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [launchKey, setLaunchKey] = useState(location?.launchKey ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState('');
  /** What the folder holds, as last read or written. Null means not compared yet. */
  const [saved, setSaved] = useState<Fingerprint | null>(null);

  const latest = useRef(project);
  latest.current = project;

  const say = useCallback((text: string, bad = false) => {
    setNote(text);
    setFailed(bad);
  }, []);

  useEffect(() => {
    fetchLaunches()
      .then(list => { setLaunches(list); setOffline(''); })
      .catch(e => setOffline('Сервер не відповідає, теки заливів не видно: ' + (e as Error).message));
  }, []);

  useEffect(() => {
    if (launchKey === '') { setBatches([]); return; }
    let stale = false;
    fetchBatches(launchKey)
      .then(list => { if (!stale) setBatches(list); })
      .catch(e => { if (!stale) say((e as Error).message, true); });
    return () => { stale = true; };
  }, [launchKey, say]);

  // After a reload the project comes from the autosave and the binding from
  // localStorage; whether they agree with the folder is a question for the
  // folder. Asked once, and only while nothing has been compared yet.
  useEffect(() => {
    if (location === null || saved !== null) return;
    let stale = false;
    readBatch(location.launchKey, location.batch)
      .then(read => {
        if (stale) return;
        const current = latest.current;
        const onDisk = JSON.stringify(read.file);
        const here = JSON.stringify(toFile(current));
        setSaved(onDisk === here ? fingerprint(current) : { photos: [], locales: [], scalars: '' });
      })
      .catch(e => {
        if (stale) return;
        say(`Пачку ${location.launchKey}/${location.batch} не вдалось перечитати: ${(e as Error).message}`, true);
        setSaved({ photos: [], locales: [], scalars: '' });
      });
    return () => { stale = true; };
  }, [location, saved, say]);

  const browse = useCallback((key: string) => {
    setLaunchKey(key);
    setNote('');
  }, []);

  const open = useCallback((batch: string) => {
    if (launchKey === '' || !isBatchName(batch)) return;
    setBusy(true);
    readBatch(launchKey, batch)
      .then(read => {
        const result = fromFile(read.file);
        if (!result.ok) {
          say(`${batch}: ${explainRefusal(result.reason)}`, true);
          return;
        }
        replaceProject(result.project);
        setSaved(fingerprint(result.project));
        const next = { launchKey, batch };
        setLocation(next);
        writeLocation(next);
        say(read.missing.length === 0
          ? `Відкрито ${launchKey}/${batch}`
          : `Відкрито ${launchKey}/${batch}; не знайдено фото: ${read.missing.join(', ')} — їх пропущено`,
        read.missing.length > 0);
      })
      .catch(e => say((e as Error).message, true))
      .finally(() => setBusy(false));
  }, [launchKey, replaceProject, say]);

  const save = useCallback((batch?: string) => {
    const target = batch === undefined
      ? location
      : { launchKey, batch: batch.trim() };
    if (target === null || target.launchKey === '') {
      say('Спершу оберіть топік і назву пачки.', true);
      return;
    }
    if (!isBatchName(target.batch)) {
      say('Назва пачки: малі літери, цифри, крапки й дефіси — наприклад batch-1.', true);
      return;
    }
    const current = latest.current;
    setBusy(true);
    writeBatch(target.launchKey, target.batch, toFile(current))
      .then(written => {
        setSaved(fingerprint(current));
        setLocation(target);
        writeLocation(target);
        setBatches(list => (list.includes(target.batch) ? list : [...list, target.batch].sort()));
        say(`Збережено в ${target.launchKey}/${target.batch}` +
          (written.written.length === 0 ? '' : ` · фото: ${written.written.length}`));
      })
      .catch(e => say((e as Error).message, true))
      .finally(() => setBusy(false));
  }, [location, launchKey, say]);

  const unbind = useCallback(() => {
    setLocation(null);
    writeLocation(null);
    setSaved(null);
    setNote('');
  }, []);

  const dirty = location !== null && !same(saved, fingerprint(project));

  return useMemo(() => ({
    location, launches, batches, launchKey, dirty, busy, note, failed, offline,
    browse, open, save, unbind,
  }), [location, launches, batches, launchKey, dirty, busy, note, failed, offline, browse, open, save, unbind]);
}
