// The subtitle queue as the tab sees it: one job per file dropped, each
// watched the way an export is. The server runs them one at a time; here they
// are a list with a state each, so a failure on one file is a line under that
// file and not a modal over the rest.
import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelJob, jobStatus, startSubtitles, type JobStatus, type SubtitleTarget } from './server.ts';

const POLL_MS = 700;

export interface QueuedFile {
  /** Local, so a file whose upload has not been answered yet still has a row. */
  key: string;
  name: string;
  /** Empty until the server has answered the upload. */
  id: string;
  status: JobStatus | null;
  /** The sentence to show under the row when something went wrong before the job existed. */
  note: string;
}

export interface SubtitleQueue {
  files: QueuedFile[];
  /** Whether any file is still uploading or being worked on. */
  busy: boolean;
  add: (files: readonly File[], target: SubtitleTarget) => void;
  cancel: (key: string) => void;
  clear: () => void;
}

export function useSubtitleQueue(): SubtitleQueue {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const latest = useRef(files);
  latest.current = files;

  const patch = useCallback((key: string, change: Partial<QueuedFile>) => {
    setFiles(list => list.map(f => (f.key === key ? { ...f, ...change } : f)));
  }, []);

  const running = files.some(f => f.id !== '' && (f.status === null || f.status.state === 'running'));
  const uploading = files.some(f => f.id === '' && f.note === '');

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      for (const file of latest.current) {
        if (file.id === '' || (file.status !== null && file.status.state !== 'running')) continue;
        void jobStatus(file.id)
          .then(status => patch(file.key, { status }))
          .catch(e => patch(file.key, {
            note: (e as Error).message,
            status: { ...(file.status ?? blank(file.id)), state: 'failed' },
          }));
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, patch]);

  const add = useCallback((picked: readonly File[], target: SubtitleTarget) => {
    const rows = picked.map(file => ({
      key: crypto.randomUUID(), name: file.name, id: '', status: null, note: '',
    }));
    setFiles(list => [...list, ...rows]);
    // Uploaded one after another: a dozen videos at once would fight for the
    // same disk and the same line, and the server takes them in order anyway.
    void picked.reduce(
      (chain, file, i) => chain.then(() =>
        startSubtitles(file, target)
          .then(({ id }) => patch(rows[i]!.key, { id, status: blank(id) }))
          .catch(e => patch(rows[i]!.key, { note: (e as Error).message }))),
      Promise.resolve(),
    );
  }, [patch]);

  const cancel = useCallback((key: string) => {
    const file = latest.current.find(f => f.key === key);
    if (file === undefined || file.id === '') return;
    void cancelJob(file.id).then(status => patch(key, { status })).catch(() => {});
  }, [patch]);

  const clear = useCallback(() => {
    setFiles(list => list.filter(f => f.id !== '' && (f.status === null || f.status.state === 'running')));
  }, []);

  return { files, busy: running || uploading, add, cancel, clear };
}

const blank = (id: string): JobStatus => ({
  id, state: 'running', done: 0, total: 1, current: '', errors: [],
  elapsed: 0, remaining: null, ready: false, folders: [], result: null, finished: [], progress: {},
});
