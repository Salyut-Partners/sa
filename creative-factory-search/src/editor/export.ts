// Running an export and watching it.
//
// The job lives on the server, so this is a subscription rather than a piece of
// work: post a plan, get an id, ask after it until it stops. Nothing here blocks
// the editor — the whole point of the queue is that the user keeps working while
// the frames are walked.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BatchPlan } from '../core/batch.ts';
import {
  batchStatus, cancelBatch, downloadBatch, startBatch, type BatchOutput, type JobStatus,
} from './server.ts';

/** How often to ask. Often enough to feel live, rarely enough to be free. */
const POLL_MS = 700;

export interface ExportRun {
  status: JobStatus | null;
  /** The last thing worth telling the user, in a sentence. */
  note: string;
  failed: boolean;
  running: boolean;
  /** With `output`, the files land in campaign folders instead of a download. */
  start: (plan: BatchPlan, duration: number, fitToVoice: boolean, output?: BatchOutput) => void;
  cancel: () => void;
  download: () => void;
}

export function useExport(): ExportRun {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  /** Set once the finished archive has been handed over, so it happens once. */
  const delivered = useRef(false);

  const running = status?.state === 'running';
  // Empty until the server has answered the post. The loop watches it, so it
  // starts the moment the id arrives rather than only if the status changes.
  const id = status?.id ?? '';

  const take = useCallback(async (id: string): Promise<void> => {
    try {
      const size = await downloadBatch(id);
      setNote(note => `${note} · ${(size / 1_048_576).toFixed(1)} МБ`);
    } catch (e) {
      setFailed(true);
      setNote('Архів не забрався: ' + (e as Error).message);
    }
  }, []);

  // The polling loop. It follows `running` rather than being started by the
  // button, so a status that comes back finished stops it wherever it was.
  useEffect(() => {
    if (!running || id === '') return;
    const timer = setInterval(() => {
      void batchStatus(id)
        .then(next => {
          setStatus(next);
          if (next.state === 'running' || delivered.current) return;
          delivered.current = true;
          setFailed(next.state === 'failed');
          setNote(summarise(next));
          if (next.ready) void take(id);
        })
        .catch(e => {
          setFailed(true);
          setNote((e as Error).message);
          setStatus(s => (s === null ? s : { ...s, state: 'failed' }));
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, id, take]);

  const start = useCallback((plan: BatchPlan, duration: number, fitToVoice: boolean, output?: BatchOutput) => {
    if (plan.total === 0) {
      setFailed(true);
      setNote(output === undefined
        ? 'Нема чого експортувати: оберіть фото і хоча б одну мову.'
        : 'Нема чого експортувати: жодна мова не має кампанії призначення.');
      return;
    }
    setFailed(false);
    setNote('');
    delivered.current = false;
    // Shown before the server has answered, so the panel does not sit blank
    // through the seconds it takes to send a batch of photos over.
    setStatus({
      id: '', state: 'running', done: 0, total: plan.total, current: '',
      errors: [], elapsed: 0, remaining: null, ready: false, folders: [],
    });
    // The number that costs time is the frame walks, not the files. Said once
    // here, where the plan is in hand, rather than recomputed on every render.
    if (plan.renders < plan.total) {
      setNote(`${plan.renders} відеорядів на ${plan.total} файлів — решта лише озвучкою.`);
    }
    void startBatch(plan, duration, fitToVoice, output)
      .then(started => setStatus(s => (s === null ? s : { ...s, id: started.id })))
      .catch(e => {
        setFailed(true);
        setNote((e as Error).message);
        setStatus(null);
      });
  }, []);

  const cancel = useCallback(() => {
    if (id === '') return;
    delivered.current = true;
    void cancelBatch(id)
      .then(next => {
        setStatus(next);
        setNote(summarise(next));
      })
      .catch(() => setStatus(null));
  }, [id]);

  const download = useCallback(() => {
    if (id !== '') void take(id);
  }, [id, take]);

  return { status, note, failed, running, start, cancel, download };
}

/** What became of a job, once it has stopped. */
function summarise(status: JobStatus): string {
  const seconds = status.elapsed.toFixed(0);
  const failures = status.errors.length === 0 ? '' : ` · не вийшло: ${status.errors.length}`;
  const where = status.folders.length === 0 ? '' : ` · у ${status.folders.join(', ')}`;
  switch (status.state) {
    case 'cancelled':
      return `Скасовано на ${status.done} з ${status.total}${where}`;
    case 'failed':
      return `Експорт не вдався за ${seconds} с${failures}`;
    default:
      return `Готово: ${status.done - status.errors.length} з ${status.total} за ${seconds} с${failures}${where}`;
  }
}
