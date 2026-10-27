// Autosave. IndexedDB rather than localStorage because a batch of a dozen
// 1080×1920 photos as data URLs is tens of megabytes, and localStorage gives up
// somewhere around five.
import { fromFile, toFile, type ProjectFile } from '../core/serialize.ts';
import type { Project } from '../core/types.ts';

const DB_NAME = 'creative-factory-search';
const STORE = 'projects';
const KEY = 'current';
/** Long enough that typing a caption is one write, short enough to survive a crash. */
const SAVE_DELAY = 600;

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB недоступний'));
  });

const transact = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('запис не вдався'));
    });
  } finally {
    db.close();
  }
};

/** The project from the last session, or null if there is nothing to come back to. */
export async function loadAutosave(): Promise<Project | null> {
  try {
    const saved = await transact<ProjectFile | undefined>('readonly', s => s.get(KEY));
    if (saved === undefined) return null;
    const result = fromFile(saved);
    return result.ok ? result.project : null;
  } catch {
    // A private window, a denied quota, a browser with storage off: the editor
    // still works, it just will not remember. Not worth an error in the user's face.
    return null;
  }
}

/**
 * Whether the work on screen has reached the disk. `failed` is the one worth
 * showing loudly: a private window or a denied quota means nothing is being kept
 * and the only way out is saving to a file.
 */
export type SaveState = 'saved' | 'pending' | 'failed';

export interface Autosaver {
  save: (project: Project) => void;
  stop: () => void;
}

/**
 * Writes on a trailing delay. Every keystroke is a new project object, and
 * serialising a batch of photos on each of them would be felt.
 */
export function autosaver(onState: (state: SaveState) => void): Autosaver {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    save(project) {
      clearTimeout(timer);
      onState('pending');
      timer = setTimeout(() => {
        void transact('readwrite', s => s.put(toFile(project), KEY))
          .then(() => onState('saved'))
          .catch(() => onState('failed'));
      }, SAVE_DELAY);
    },
    stop() {
      clearTimeout(timer);
    },
  };
}
