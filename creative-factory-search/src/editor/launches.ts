// An apply as the launches tab watches it. The job is the server's, like an
// export: start it, get an id, ask after it until it stops. One at a time —
// a second «Залити» while one runs is refused by the server anyway, one
// writer of a state file being the rule — so this is a single run, kept in
// the App so it goes on being watched while the buyer is on another tab.
import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelJob, jobStatus, startApply, type JobStatus } from './server.ts';

const POLL_MS = 700;

export interface ApplyRun {
  /** Which launch and campaign the run is for, while there is one. */
  target: { launchKey: string; campaign: string | null } | null;
  status: JobStatus | null;
  /** The last thing worth telling the buyer, in a sentence. */
  note: string;
  failed: boolean;
  running: boolean;
  start: (launchKey: string, campaign: string | null) => void;
  cancel: () => void;
  /** Something to do when a run stops — the tab refreshes its plan. */
  onSettled: (fn: (() => void) | null) => void;
}

export function useApplyRun(): ApplyRun {
  const [target, setTarget] = useState<ApplyRun['target']>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const settled = useRef<(() => void) | null>(null);

  const running = status?.state === 'running';
  const id = status?.id ?? '';

  useEffect(() => {
    if (!running || id === '') return;
    const timer = setInterval(() => {
      void jobStatus(id)
        .then(next => {
          setStatus(next);
          if (next.state === 'running') return;
          setFailed(next.state === 'failed');
          setNote(summarise(next));
          settled.current?.();
        })
        .catch(e => {
          setFailed(true);
          setNote((e as Error).message);
          setStatus(s => (s === null ? s : { ...s, state: 'failed' }));
          settled.current?.();
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, id]);

  const start = useCallback((launchKey: string, campaign: string | null) => {
    setTarget({ launchKey, campaign });
    setFailed(false);
    setNote('');
    setStatus({ id: '', state: 'running', done: 0, total: 0, current: 'запуск…', errors: [], elapsed: 0, remaining: null, ready: false, folders: [] });
    void startApply(launchKey, campaign)
      .then(started => {
        if (started.id === null) {
          setStatus(null);
          setNote('План порожній — на платформі вже все є.');
          settled.current?.();
          return;
        }
        setStatus(s => (s === null ? s : { ...s, id: started.id!, total: started.steps }));
      })
      .catch(e => {
        setFailed(true);
        setNote((e as Error).message);
        setStatus(null);
        settled.current?.();
      });
  }, []);

  const cancel = useCallback(() => {
    if (id === '') return;
    void cancelJob(id)
      .then(next => {
        setStatus(next);
        setNote(summarise(next));
        settled.current?.();
      })
      .catch(() => setStatus(null));
  }, [id]);

  const onSettled = useCallback((fn: (() => void) | null) => { settled.current = fn; }, []);

  return { target, status, note, failed, running, start, cancel, onSettled };
}

/** What became of an apply, once it has stopped: steps done, steps failed, the seconds it took. */
function summarise(status: JobStatus): string {
  const seconds = status.elapsed.toFixed(0);
  const done = status.done - status.errors.length;
  const failures = status.errors.length === 0 ? '' : ` · зупинилось на: ${status.errors.map(e => e.message).join('; ')}`;
  switch (status.state) {
    case 'cancelled':
      return `Скасовано після ${done} з ${status.total} кроків — наступний apply продовжить з цього місця`;
    case 'failed':
      return `Залив зупинився після ${done} з ${status.total} кроків за ${seconds} с${failures}`;
    default:
      return `Готово: ${done} з ${status.total} кроків за ${seconds} с${failures}`;
  }
}
