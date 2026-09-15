// Where the sources of the work on screen go: `sources/<batch>` under the
// topic an export picks. The server owns the disk; this hook owns the binding.
//
// Nothing is chosen up front and nothing is saved by hand. The buyer drops
// photos and works; the autosave in IndexedDB keeps the session. An export
// into a topic's campaigns writes the sources under that topic — into the
// batch this session already has there, or a new one the server names by the
// clock; an export into another topic starts that topic's own batch. «Новий»
// forgets the binding. The binding is kept in localStorage so the export panel
// opens on the topic it last went to.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { batchForExport, isFolderName } from '../core/batch-folder.ts';
import { fromFile, toFile } from '../core/serialize.ts';
import type { Project } from '../core/types.ts';
import { explainRefusal } from './project-file.ts';
import { createBatch, fetchLaunchNames, readBatch, writeBatch } from './server.ts';

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

export interface TopicBatch {
  /** The batch the last export or open wrote to or read from. */
  location: BatchLocation | null;
  /** The launches the server knows, by key and topic name. */
  launches: { key: string; name: string }[];
  /** The topic the export panel points at; empty for a download. */
  launchKey: string;
  busy: boolean;
  /** The last thing worth saying, and whether it was a failure. */
  note: string;
  failed: boolean;
  /** Empty when the server answered; otherwise why the topics cannot be listed. */
  offline: string;
  browse: (launchKey: string) => void;
  /** Open a batch of a topic — from the topic table. */
  openIn: (launchKey: string, batch: string) => void;
  /** Write the sources under this topic before its creatives: the session's batch there, or a new one. */
  ensureSaved: (launchKey: string) => Promise<BatchLocation>;
  /** Forget the binding: the next export starts a new batch. */
  forget: () => void;
}

export function useTopicBatch(project: Project, replaceProject: (next: Project) => void): TopicBatch {
  const [location, setLocation] = useState<BatchLocation | null>(readLocation);
  const [launches, setLaunches] = useState<{ key: string; name: string }[]>([]);
  const [launchKey, setLaunchKey] = useState(location?.launchKey ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState('');

  const say = useCallback((text: string, bad = false) => {
    setNote(text);
    setFailed(bad);
  }, []);

  useEffect(() => {
    fetchLaunchNames()
      .then(list => { setLaunches(list); setOffline(''); })
      .catch(e => setOffline('Сервер не відповідає, топіків не видно: ' + (e as Error).message));
  }, []);

  const browse = useCallback((key: string) => {
    setLaunchKey(key);
    setNote('');
  }, []);

  const bind = (next: BatchLocation | null): void => {
    setLocation(next);
    writeLocation(next);
  };

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
        bind({ launchKey: key, batch });
        say(read.missing.length === 0
          ? `Відкрито ісходники ${batch}`
          : `Відкрито ісходники ${batch}; не знайдено фото: ${read.missing.join(', ')} — їх пропущено`,
        read.missing.length > 0);
      })
      .catch(e => say((e as Error).message, true))
      .finally(() => setBusy(false));
  }, [replaceProject, say]);

  const ensureSaved = useCallback(async (key: string): Promise<BatchLocation> => {
    const batch = batchForExport(location, key);
    setBusy(true);
    try {
      const file = toFile(project);
      const written = batch === null ? await createBatch(key, file) : await writeBatch(key, batch, file);
      const target = { launchKey: key, batch: written.batch };
      bind(target);
      say(`Ісходники лягли в теку топіка: sources/${target.batch}`);
      return target;
    } catch (e) {
      say((e as Error).message, true);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [location, project, say]);

  const forget = useCallback(() => {
    bind(null);
    setNote('');
  }, []);

  return useMemo(() => ({
    location, launches, launchKey, busy, note, failed, offline, browse, openIn, ensureSaved, forget,
  }), [location, launches, launchKey, busy, note, failed, offline, browse, openIn, ensureSaved, forget]);
}
