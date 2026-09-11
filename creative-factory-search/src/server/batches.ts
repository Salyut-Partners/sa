// A batch on disk: `sources/<batch>/project.json` beside its pictures, inside
// a launch folder. The server is the only thing that touches the folder; the
// editor posts and receives the same file it would download, pictures inside,
// and the split into files happens here on the way through. A new batch is
// named here too, by the clock, when the export saves one for the first time.
import fs from 'node:fs';
import path from 'node:path';
import { isFolderName, joinPhotos, mimeFor, SOURCES_DIR, splitPhotos } from '../core/batch-folder.ts';
import { isLaunchKey } from '../core/launch.ts';
import { campaignSummary, CREATIVES_DIR, type CampaignInfo } from '../core/placement.ts';
import { fromFile, type ProjectFile } from '../core/serialize.ts';
import type { SaConfig } from './config.ts';
import { RefusedError } from './launches.ts';

const PROJECT_FILE = 'project.json';

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
  if (!isFolderName(batch)) {
    throw new RefusedError(`назва пачки має бути з малих літер, цифр, крапок і дефісів: \`${batch}\``);
  }
  return path.join(launchFolder(config, launchKey), SOURCES_DIR, batch);
}

/** The batches a launch has: every folder under `sources/` holding a project file. */
export function listBatches(config: SaConfig, launchKey: string): string[] {
  const dir = path.join(launchFolder(config, launchKey), SOURCES_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && isFolderName(d.name) && fs.existsSync(path.join(dir, d.name, PROJECT_FILE)))
    .map(d => d.name)
    .sort();
}

/**
 * The name a batch gets when the export saves it for the first time: the day
 * and the minute, `0911-1432`, and a `-2` when that minute already has one.
 * The buyer never types it — «ісходники від 11.09 о 14:32» is what it means.
 */
export function newBatchName(taken: readonly string[], now: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;
  for (let n = 1; ; n++) {
    const name = n === 1 ? stamp : `${stamp}-${n}`;
    if (!taken.includes(name)) return name;
  }
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
    return `data:${mimeFor(path.extname(target))};base64,${fs.readFileSync(target).toString('base64')}`;
  });
}

// --------------------------------------------------------------- campaigns --

/** The campaigns a launch has, with the language each manifest says it is for. */
export function listCampaigns(config: SaConfig, launchKey: string): CampaignInfo[] {
  const dir = path.join(launchFolder(config, launchKey), 'campaigns');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && isFolderName(d.name))
    .map(d => {
      const manifest = path.join(dir, d.name, 'campaign.yaml');
      const summary = fs.existsSync(manifest)
        ? campaignSummary(fs.readFileSync(manifest, 'utf8'))
        : { language: null, country: null };
      return { name: d.name, ...summary };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The folder a campaign's creatives are written to, made if it is not there.
 * The campaign itself has to exist: an export does not invent campaigns, it
 * fills the ones the buyer laid out.
 */
export function campaignCreativesDir(config: SaConfig, launchKey: string, campaign: string): string {
  if (!isFolderName(campaign)) throw new RefusedError(`це не назва кампанії: \`${campaign}\``);
  const folder = path.join(launchFolder(config, launchKey), 'campaigns', campaign);
  if (!fs.existsSync(folder)) {
    throw new RefusedError(`кампанії \`${campaign}\` немає в ${launchKey}/campaigns — створіть теку з campaign.yaml`);
  }
  const target = path.join(folder, CREATIVES_DIR);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

export interface BatchWritten {
  /** The batch the file went into — the one asked for, or the one just named. */
  batch: string;
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
  return { batch, folder, written };
}

/** A batch saved for the first time: named by the clock, under `sources/`. */
export function createBatch(config: SaConfig, launchKey: string, body: unknown, now = new Date()): BatchWritten {
  return writeBatch(config, launchKey, newBatchName(listBatches(config, launchKey), now), body);
}
