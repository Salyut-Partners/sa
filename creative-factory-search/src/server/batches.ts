// A batch on disk: `batches/<batch>/project.json` and its `photos/`, inside a
// launch folder. The server is the only thing that touches the folder; the
// editor posts and receives the same file it would download, pictures inside,
// and the split into files happens here on the way through.
import fs from 'node:fs';
import path from 'node:path';
import { isBatchName, joinPhotos, splitPhotos } from '../core/batch-folder.ts';
import { isLaunchKey } from '../core/launch.ts';
import { fromFile, type ProjectFile } from '../core/serialize.ts';
import type { SaConfig } from './config.ts';
import { RefusedError } from './launches.ts';

const PROJECT_FILE = 'project.json';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
};

/** The launch's folder, which has to be there already — `sa new` makes it. */
export function launchFolder(config: SaConfig, launchKey: string): string {
  if (!isLaunchKey(launchKey)) throw new RefusedError(`це не launch key: \`${launchKey}\``);
  const folder = path.join(config.launches_root, launchKey);
  if (!fs.existsSync(path.join(folder, 'topic.yaml'))) {
    throw new RefusedError(`заливу \`${launchKey}\` немає в ${config.launches_root} — спершу \`sa new\``);
  }
  return folder;
}

function batchFolder(config: SaConfig, launchKey: string, batch: string): string {
  if (!isBatchName(batch)) {
    throw new RefusedError(`назва пачки має бути з малих літер, цифр, крапок і дефісів: \`${batch}\``);
  }
  return path.join(launchFolder(config, launchKey), 'batches', batch);
}

/** The batches a launch has: every folder under `batches/` holding a project file. */
export function listBatches(config: SaConfig, launchKey: string): string[] {
  const dir = path.join(launchFolder(config, launchKey), 'batches');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && isBatchName(d.name))
    .map(d => d.name)
    .sort();
}

export interface BatchRead {
  /** The project file with its pictures back inside, for the editor's `fromFile`. */
  file: unknown;
  missing: string[];
}

export function readBatch(config: SaConfig, launchKey: string, batch: string): BatchRead {
  const folder = batchFolder(config, launchKey, batch);
  const file = path.join(folder, PROJECT_FILE);
  if (!fs.existsSync(file)) throw new RefusedError(`у пачці \`${batch}\` немає ${PROJECT_FILE}`);
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new RefusedError(`${PROJECT_FILE} пачки \`${batch}\` не читається: ${(e as Error).message}`);
  }
  return joinPhotos(data, ref => {
    const target = path.join(folder, ref);
    if (!fs.existsSync(target)) return null;
    const mime = MIME_BY_EXT[path.extname(target).toLowerCase()] ?? 'application/octet-stream';
    return `data:${mime};base64,${fs.readFileSync(target).toString('base64')}`;
  });
}

export interface BatchWritten {
  folder: string;
  /** Picture files written this time — unchanged ones are left as they are. */
  written: string[];
}

/**
 * Write a batch. The file is checked as a project before anything touches the
 * disk, so a half-built body cannot leave a folder that will not open. Pictures
 * whose bytes are already there are not rewritten: a save after a caption edit
 * should cost a JSON file, not a dozen JPEGs.
 */
export function writeBatch(config: SaConfig, launchKey: string, batch: string, body: unknown): BatchWritten {
  const check = fromFile(body);
  if (!check.ok) throw new RefusedError(`це не файл пачки (${check.reason})`);
  const folder = batchFolder(config, launchKey, batch);
  const { file, photos } = splitPhotos(body as ProjectFile);

  fs.mkdirSync(folder, { recursive: true });
  const written: string[] = [];
  for (const photo of photos) {
    const target = path.join(folder, photo.path);
    const bytes = Buffer.from(photo.base64, 'base64');
    if (fs.existsSync(target) && fs.readFileSync(target).equals(bytes)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    written.push(photo.path);
  }
  fs.writeFileSync(path.join(folder, PROJECT_FILE), JSON.stringify(file, null, 2) + '\n');
  return { folder, written };
}
