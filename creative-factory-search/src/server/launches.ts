// A launch on disk. The folder is the thing; the ticket points at it. Folders
// are made here and the ticket by the sync in `tickets.ts`, which the route
// calls right after — so a missing token still leaves the buyer with
// somewhere to work, and the answer says which half happened.
import fs from 'node:fs';
import path from 'node:path';
import { checkNewLaunch, newLaunchTree, parseTopicManifest, type LaunchCreated, type TopicManifest, type TrafficSource } from '../core/launch.ts';
import { expandMatrix, parseMatrix, singleCampaignMatrix, type Existing, type Expansion, type SingleCampaign } from '../core/matrix.ts';
import { buildLaunchesTree, type LaunchesTree, type LaunchFolderListing } from '../core/launches-tree.ts';
import { ensureLaunchesRoot, type SaConfig } from './config.ts';

/** A request the buyer got wrong: the message is for them, and nothing was made. */
export class RefusedError extends Error {}

export interface NewLaunchRequest {
  launchKey: string;
  name?: string;
  trafficSource?: TrafficSource;
  vertical?: string;
  geo?: string[];
}

/** The launch keys that already have a folder. */
export function existingLaunchKeys(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name)
    .sort();
}

/** How deep under a launch folder the listing looks: `campaigns/<c>/creatives/rejected/<file>` is four. */
const LISTING_DEPTH = 4;

/** Paths under a folder, relative with forward slashes, a few levels deep — `sources/` and its pictures are not walked. */
function listPaths(folder: string, prefix = '', depth = LISTING_DEPTH): string[] {
  if (depth === 0) return [];
  const paths: string[] = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || (prefix === '' && (entry.name === 'sources' || entry.name === 'batches'))) continue;
    const own = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    paths.push(own);
    if (entry.isDirectory()) paths.push(...listPaths(path.join(folder, entry.name), own, depth - 1));
  }
  return paths;
}

/** Every launch folder as the tree reads it: its manifest text and what is under it. */
export function listLaunchFolders(root: string): LaunchFolderListing[] {
  return existingLaunchKeys(root).map(key => {
    const folder = path.join(root, key);
    const manifest = path.join(folder, 'topic.yaml');
    return { key, topicYaml: fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8') : null, paths: listPaths(folder) };
  });
}

export const launchesTree = (root: string): LaunchesTree => buildLaunchesTree(listLaunchFolders(root));

/** The folder made: what `LaunchCreated` is before the ticket sync has had its say. */
export type FolderMade = Omit<LaunchCreated, 'ticket'>;

export function createLaunch(config: SaConfig, request: NewLaunchRequest): FolderMade {
  const root = ensureLaunchesRoot(config);
  const refusal = checkNewLaunch(existingLaunchKeys(root), request.launchKey);
  if (refusal !== null) throw new RefusedError(refusal);

  const folder = path.join(root, request.launchKey);
  const tree = newLaunchTree({
    launchKey: request.launchKey,
    ...(request.name !== undefined ? { name: request.name } : {}),
    ...(request.trafficSource !== undefined ? { trafficSource: request.trafficSource } : {}),
    ...(request.vertical !== undefined ? { vertical: request.vertical } : {}),
    ...(request.geo !== undefined ? { geo: request.geo } : {}),
  });
  // Not recursive on purpose: the root exists, and a folder that appeared
  // between the check and here is a refusal, not something to write into.
  try {
    fs.mkdirSync(folder);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new RefusedError(`залив \`${request.launchKey}\` уже є — тека існує`);
    throw e;
  }
  for (const dir of tree.dirs) fs.mkdirSync(path.join(folder, dir), { recursive: true });
  for (const file of tree.files) {
    const target = path.join(folder, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, { flag: 'wx' });
  }

  return { launchKey: request.launchKey, folder, files: tree.files.map(f => f.path) };
}

// ------------------------------------------------------------- expand --

/** The folder names under one of the launch's lists, or none when the list is not there yet. */
function folderNames(folder: string, list: string): string[] {
  const dir = path.join(folder, list);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name).sort();
}

interface OpenLaunch { folder: string; topic: TopicManifest; existing: Existing }

/** A launch folder with its manifest read, or a refusal the buyer can act on. */
function openLaunch(config: SaConfig, launchKey: string): OpenLaunch {
  const root = ensureLaunchesRoot(config);
  const folder = path.join(root, launchKey);
  const manifest = path.join(folder, 'topic.yaml');
  if (!fs.existsSync(folder)) throw new RefusedError(`заливу \`${launchKey}\` немає — спершу sa new ${launchKey}`);
  if (!fs.existsSync(manifest)) throw new RefusedError(`у теці \`${launchKey}\` немає topic.yaml`);
  const parsed = parseTopicManifest(fs.readFileSync(manifest, 'utf8'));
  if (!parsed.ok) throw new RefusedError(parsed.errors.map(e => `topic.yaml: ${e}`).join('\n'));
  const existing: Existing = {
    termgroups: folderNames(folder, 'termgroups'),
    articles: folderNames(folder, 'articles'),
    campaigns: folderNames(folder, 'campaigns'),
  };
  return { folder, topic: parsed.value, existing };
}

/** What `sa expand` and `sa new campaign` answer: what was made, what was already there, what still needs a hand. */
export interface Expanded {
  launchKey: string;
  created: Existing;
  skipped: Existing;
  files: string[];
  notes: string[];
}

function writeExpansion(launchKey: string, folder: string, expansion: Expansion): Expanded {
  for (const dir of expansion.dirs) fs.mkdirSync(path.join(folder, dir), { recursive: true });
  for (const file of expansion.files) {
    const target = path.join(folder, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // `wx`: a file that appeared between the listing and here is kept, not overwritten.
    fs.writeFileSync(target, file.content, { flag: 'wx' });
  }
  return { launchKey, created: expansion.created, skipped: expansion.skipped, files: expansion.files.map(f => f.path), notes: expansion.notes };
}

/**
 * The matrix as folders. Only what is missing is made; the matrix itself is
 * not kept — after this the folders are the truth, and a second call with the
 * same JSON makes nothing.
 */
export function expandLaunch(config: SaConfig, launchKey: string, matrix: unknown): Expanded {
  const { folder, topic, existing } = openLaunch(config, launchKey);
  const spec = parseMatrix(matrix, topic);
  if (!spec.ok) throw new RefusedError(spec.errors.join('\n'));
  const expansion = expandMatrix(spec.value, topic, existing);
  if (!expansion.ok) throw new RefusedError(expansion.errors.join('\n'));
  return writeExpansion(launchKey, folder, expansion.value);
}

/** One campaign folder, over term group and article folders that exist. A name already taken is a refusal, not a skip. */
export function createCampaign(config: SaConfig, launchKey: string, cell: SingleCampaign): Expanded {
  const { folder, topic, existing } = openLaunch(config, launchKey);
  const spec = singleCampaignMatrix(cell, topic);
  if (!spec.ok) throw new RefusedError(spec.errors.join('\n'));
  const expansion = expandMatrix(spec.value, topic, existing);
  if (!expansion.ok) throw new RefusedError(expansion.errors.join('\n'));
  if (expansion.value.created.campaigns.length === 0) {
    throw new RefusedError(`кампанія \`${expansion.value.skipped.campaigns[0]}\` уже є в campaigns/`);
  }
  return writeExpansion(launchKey, folder, expansion.value);
}

