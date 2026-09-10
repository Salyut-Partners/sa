// A launch on disk. The folder is the thing; the ticket points at it. Folders
// are made first and the ticket second, so a missing token still leaves the
// buyer with somewhere to work — and the answer says which half happened.
import fs from 'node:fs';
import path from 'node:path';
import {
  checkNewLaunch, newLaunchTree, resolveTicketFields, type LaunchCreated, type TrafficSource,
} from '../core/launch.ts';
import { buildLaunchesTree, type LaunchesTree, type LaunchFolderListing } from '../core/launches-tree.ts';
import { ClickUpError, clickupState, createTask, listFields, type Ticket } from './clickup.ts';
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

/** Paths under a folder, relative with forward slashes, a few levels deep — `batches/` and its photos are not walked. */
function listPaths(folder: string, prefix = '', depth = LISTING_DEPTH): string[] {
  if (depth === 0) return [];
  const paths: string[] = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || (prefix === '' && entry.name === 'batches')) continue;
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

export async function createLaunch(config: SaConfig, request: NewLaunchRequest): Promise<LaunchCreated> {
  const root = ensureLaunchesRoot(config);
  const refusal = checkNewLaunch(existingLaunchKeys(root), request.launchKey);
  if (refusal !== null) throw new RefusedError(refusal);

  const folder = path.join(root, request.launchKey);
  const tree = newLaunchTree({
    launchKey: request.launchKey,
    ...(request.name !== undefined ? { name: request.name } : {}),
    ...(request.trafficSource !== undefined ? { trafficSource: request.trafficSource } : {}),
    ...(request.vertical !== undefined ? { vertical: request.vertical } : {}),
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

  return {
    launchKey: request.launchKey,
    folder,
    files: tree.files.map(f => f.path),
    ticket: await fileTicket(config, request),
  };
}

async function fileTicket(config: SaConfig, request: NewLaunchRequest): Promise<LaunchCreated['ticket']> {
  const state = clickupState(config);
  if (!state.ready) return { ok: false, note: state.note };
  try {
    const defs = await listFields(state);
    const fields = resolveTicketFields(defs, {
      launchKey: request.launchKey,
      ...(request.name !== undefined ? { name: request.name } : {}),
      ...(request.vertical !== undefined ? { vertical: request.vertical } : {}),
      ...(request.geo !== undefined ? { geo: request.geo } : {}),
    });
    if (!fields.ok) return { ok: false, note: fields.errors.join('; ') + ' — тікет не створено' };
    const ticket: Ticket = await createTask(state, request.launchKey, fields.value);
    return { ok: true, ...ticket };
  } catch (e) {
    const why = e instanceof ClickUpError ? e.message : `ClickUp недоступний: ${(e as Error).message}`;
    return { ok: false, note: why + ' — тікет не створено' };
  }
}
