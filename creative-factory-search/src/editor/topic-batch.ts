// The batch's place in the launch tree: which topic folder it lives in and which
// `sources/<batch>` it is. Opening and saving go through the server, which owns
// the disk; this hook owns the binding and the one question the header has to
// answer — whether what is on screen has reached that folder.
//
// The binding is made by the export, not chosen up front: the buyer drops
// photos and works, and the first export into a topic's campaigns saves the
// batch under that topic, named by the clock. From then on ⌘S goes there.
//
// Two stores, one source. The autosave in IndexedDB is the browser's memory of
// the session and nothing more: it is what comes back after a reload. The
// folder is the batch. The binding is kept in localStorage so a reload still
// knows which folder the memory belongs to, and the first thing done after one
// is to read the folder back and compare, so the header never guesses.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isFolderName, sameProjectFile } from '../core/batch-folder.ts';
import { fromFile, toFile } from '../core/serialize.ts';
import type { Project } from '../core/types.ts';
import { explainRefusal } from './project-file.ts';
import { createBatch, fetchBatches, fetchLaunches, readBatch, writeBatch } from './server.ts';

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
    return typeof launchKey === 'string' && isFolderName(batch) ? { launchKey, batch } : null;
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
    project.voiceId, project.modelId, project.fitToVoice, project.subtitles,
  ].join('/'),
});

const same = (a: Fingerprint | 'differs' | null, b: Fingerprint): boolean =>
  a !== null && a !== 'differs' && a.photos === b.photos && a.locales === b.locales && a.scalars === b.scalars;

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
  /** Open a batch of a named topic — from the topic table, where the topic is not the one being browsed. */
  openIn: (launchKey: string, batch: string) => void;
  /** Save into the bound batch. Nothing happens while unbound: the export binds. */
  save: () => void;
  /**
   * The batch on disk under this topic, saved and bound: the bound one,
   * written if it changed, or a new one the server names. Refuses a topic
   * other than the bound one — one export is one topic.
   */
  ensureSaved: (launchKey: string) => Promise<BatchLocation>;
  /** Forget the binding; the project stays on screen and the folder stays as it is. */
  unbind: () => void;
}

/**
 * @param restored whether the autosave has been read back, so that the
 * project on screen is the one to compare the folder against — before that
 * it is the empty project the editor starts with.
 */
export function useTopicBatch(
  project: Project,
  replaceProject: (next: Project) => void,
  restored: boolean,
): TopicBatch {
  const [location, setLocation] = useState<BatchLocation | null>(readLocation);
  const [launches, setLaunches] = useState<string[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [launchKey, setLaunchKey] = useState(location?.launchKey ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState('');
  /**
   * What the folder holds, as last read or written; `'differs'` when it was
   * read back after a reload and did not match; null while not compared yet.
   */
  const [saved, setSaved] = useState<Fingerprint | 'differs' | null>(null);

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
    if (!restored || location === null || saved !== null) return;
    let stale = false;
    readBatch(location.launchKey, location.batch)
      .then(read => {
        if (stale) return;
        const current = latest.current;
        setSaved(sameProjectFile(toFile(current), read.file) ? fingerprint(current) : 'differs');
      })
      .catch(e => {
        if (stale) return;
        say(`Пачку ${location.launchKey}/${location.batch} не вдалось перечитати: ${(e as Error).message}`, true);
        setSaved('differs');
      });
    return () => { stale = true; };
  }, [restored, location, saved, say]);

  const browse = useCallback((key: string) => {
    setLaunchKey(key);
    setNote('');
  }, []);

  const openIn = useCallback((key: string, batch: string) => {
    if (key === '' || !isFolderName(batch)) return;
    setLaunchKey(key);
    setBusy(true);
    readBatch(key, batch)
      .then(read => {
        const result = fromFile(read.file);
        if (!result.ok) {
          say(`${batch}: ${explainRefusal(result.reason)}`, true);
          return;
        }
        replaceProject(result.project);
        setSaved(fingerprint(result.project));
        const next = { launchKey: key, batch };
        setLocation(next);
        writeLocation(next);
        say(read.missing.length === 0
          ? `Відкрито ${key}/${batch}`
          : `Відкрито ${key}/${batch}; не знайдено фото: ${read.missing.join(', ')} — їх пропущено`,
        read.missing.length > 0);
      })
      .catch(e => say((e as Error).message, true))
      .finally(() => setBusy(false));
  }, [replaceProject, say]);

  const open = useCallback((batch: string) => openIn(launchKey, batch), [launchKey, openIn]);

  /** The write itself: into the bound batch, or into one the server names under the topic. */
  const write = useCallback(async (key: string, batch: string | null): Promise<BatchLocation> => {
    const current = latest.current;
    setBusy(true);
    try {
      const written = batch === null
        ? await createBatch(key, toFile(current))
        : await writeBatch(key, batch, toFile(current));
      const target = { launchKey: key, batch: written.batch };
      setSaved(fingerprint(current));
      setLocation(target);
      writeLocation(target);
      setLaunchKey(key);
      setBatches(list => (list.includes(target.batch) ? list : [...list, target.batch].sort()));
      say(`Ісходники збережено в ${key}/sources/${target.batch}` +
        (written.written.length === 0 ? '' : ` · фото: ${written.written.length}`));
      return target;
    } catch (e) {
      say((e as Error).message, true);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [say]);

  const save = useCallback(() => {
    if (location === null) {
      say('Ісходники збережуться в теку топіка при першому експорті.', true);
      return;
    }
    void write(location.launchKey, location.batch).catch(() => undefined);
  }, [location, say, write]);

  const ensureSaved = useCallback(async (key: string): Promise<BatchLocation> => {
    if (location !== null && location.launchKey !== key) {
      const message = `Ця пачка вже лежить у ${location.launchKey}; один експорт — один топік. Відв'яжіть її, щоб експортувати в ${key}.`;
      say(message, true);
      throw new Error(message);
    }
    if (location !== null && same(saved, fingerprint(latest.current))) return location;
    return write(key, location?.batch ?? null);
  }, [location, saved, say, write]);

  const unbind = useCallback(() => {
    setLocation(null);
    writeLocation(null);
    setSaved(null);
    setNote('');
  }, []);

  const dirty = location !== null && !same(saved, fingerprint(project));

  return useMemo(() => ({
    location, launches, batches, launchKey, dirty, busy, note, failed, offline,
    browse, open, openIn, save, ensureSaved, unbind,
  }), [location, launches, batches, launchKey, dirty, busy, note, failed, offline, browse, open, openIn, save, ensureSaved, unbind]);
}
