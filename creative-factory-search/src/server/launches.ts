// A launch on disk. The folder is the thing; the ticket points at it. Folders
// are made here and the ticket by the sync in `tickets.ts`, which the route
// calls right after — so a missing token still leaves the buyer with
// somewhere to work, and the answer says which half happened.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { adoptTopic, articleFingerprint, checkAdopt, importableTopics, newestOfSetUps, suggestLaunchKey, type BuilderLinks, type ImportableTopic } from '../core/adopt.ts';
import { type ImageReader } from '../core/article.ts';
import { mimeFor } from '../core/batch-folder.ts';
import { checkNewLaunch, isTrafficSource, newLaunchTree, parseTopicManifest, type LaunchCreated, type TopicManifest, type TrafficSource } from '../core/launch.ts';
import { parseState, type PlatformPostDetail } from '../core/plan.ts';
import { writeState } from './apply.ts';
import {
  PlatformClient, platformState, readBuilderLinks, readBuilders, readCampaigns, readConfigurations, readCountries, readCreatives, readPixels, readPost, readPosts,
  readTermGroups, readTopic, readTsps,
} from './platform.ts';
import type { PlatformStatus } from '../core/topic-table.ts';
import { expandMatrix, parseMatrix, singleCampaignMatrix, type Existing, type Expansion, type SingleCampaign } from '../core/matrix.ts';
import { SOURCES_DIR } from '../core/batch-folder.ts';
import { buildLaunchesTree, type LaunchesTree, type LaunchFolderListing } from '../core/launches-tree.ts';
import type { TopicFolder } from '../core/topic-table.ts';
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

/** One launch folder as the topic table reads it: the listing, every campaign's manifest and whether its script has words, the batches. */
export function readTopicFolder(root: string, key: string): TopicFolder {
  const folder = path.join(root, key);
  const manifest = path.join(folder, 'topic.yaml');
  const paths = listPaths(folder);
  const manifests: Record<string, string> = {};
  const scripts: Record<string, boolean> = {};
  for (const name of folderNames(folder, 'campaigns')) {
    const own = path.join(folder, 'campaigns', name);
    const yaml = path.join(own, 'campaign.yaml');
    if (fs.existsSync(yaml)) manifests[name] = fs.readFileSync(yaml, 'utf8');
    const script = path.join(own, 'script.md');
    scripts[name] = fs.existsSync(script) && fs.readFileSync(script, 'utf8').trim() !== '';
  }
  const hashes: Record<string, Record<string, string>> = {};
  for (const name of folderNames(folder, 'campaigns')) {
    const creatives = path.join(folder, 'campaigns', name, 'creatives');
    if (!fs.existsSync(creatives)) continue;
    hashes[name] = {};
    for (const entry of fs.readdirSync(creatives, { withFileTypes: true })) {
      if (entry.isFile() && /\.mp4$/i.test(entry.name) && !entry.name.startsWith('.')) hashes[name][entry.name] = fileHash(path.join(creatives, entry.name));
    }
  }
  const sources = path.join(folder, SOURCES_DIR);
  const batches = !fs.existsSync(sources) ? [] : fs.readdirSync(sources, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && fs.existsSync(path.join(sources, d.name, 'project.json')))
    .map(d => d.name)
    .sort();
  return { key, topicYaml: fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8') : null, paths, manifests, scripts, batches, hashes };
}

/**
 * A file's digest, the plan's own — kept by path while its size and time are
 * the same, so a table read every few seconds does not reread every video.
 */
const hashCache = new Map<string, { size: number; mtimeMs: number; hash: string }>();
function fileHash(file: string): string {
  const stat = fs.statSync(file);
  const known = hashCache.get(file);
  if (known !== undefined && known.size === stat.size && known.mtimeMs === stat.mtimeMs) return known.hash;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  hashCache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, hash });
  return hash;
}

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

// -------------------------------------------------------------- adopt --

/** The topic ids the launch folders under the root already name in their state files. */
export function adoptedTopicIds(root: string): number[] {
  const ids: number[] = [];
  for (const key of existingLaunchKeys(root)) {
    const file = path.join(root, key, 'state.json');
    if (!fs.existsSync(file)) continue;
    const parsed = parseState(fs.readFileSync(file, 'utf8'));
    if (parsed.ok && parsed.value.topic_id !== null) ids.push(parsed.value.topic_id);
  }
  return ids;
}

/** Bytes for a picture the article HTML pointed at: decoded from a data URL, or fetched from the platform's static host. */
async function pictureBytes(src: string): Promise<Buffer> {
  const data = /^data:[^;]+;base64,(.*)$/s.exec(src);
  if (data !== null) return Buffer.from(data[1]!, 'base64');
  const response = await fetch(src, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} на ${src}`);
  return Buffer.from(await response.arrayBuffer());
}

export interface AdoptRequest {
  topicId: number;
  launchKey: string;
  vertical?: string;
}

/** What `sa adopt` answers before the ticket sync has had its say. */
export interface AdoptedFolder extends FolderMade {
  topicId: number;
  termgroups: string[];
  articles: string[];
  campaigns: string[];
  notes: string[];
}

/**
 * A launch folder from a topic that already exists on the platform: the
 * topic, its configurations, term groups, posts and builders are read, and
 * `core/adopt.ts` decides the files; pictures the articles link are fetched
 * into `images/`, and each article's fingerprint is taken again once they
 * are there, so the first plan finds nothing to send. Nothing is written to
 * the platform.
 */
export async function adoptLaunch(config: SaConfig, request: AdoptRequest): Promise<AdoptedFolder> {
  const root = ensureLaunchesRoot(config);
  const refusal = checkAdopt(existingLaunchKeys(root), adoptedTopicIds(root), request.launchKey, request.topicId);
  if (refusal !== null) throw new RefusedError(refusal);
  const ready = platformState(config);
  if (!ready.ready) throw new RefusedError(ready.note);
  const api = new PlatformClient(ready);

  const topic = await readTopic(api, request.topicId);
  if (topic === null) throw new RefusedError(`топіка ${request.topicId} на платформі немає`);
  const [configurations, termGroups, postList, builders] = await Promise.all([
    readConfigurations(api, topic.id), readTermGroups(api, topic.id), readPosts(api, topic.id), readBuilders(api, topic.id),
  ]);
  const posts: PlatformPostDetail[] = [];
  for (const summary of postList) {
    const detail = await readPost(api, summary.id);
    if (detail !== null) posts.push(detail);
  }
  const sources = [...new Set(builders.map(b => b.traffic_source).filter(isTrafficSource))];
  const [pixelLists, creatives, tsps, countries, campaigns] = await Promise.all([
    Promise.all(sources.map(source => readPixels(api, source))),
    readCreatives(api, topic.id),
    readTsps(api, topic.id, topic.user_id),
    readCountries(api),
    readCampaigns(api, builders.flatMap(b => b.campaigns.map(c => c.id))),
  ]);
  const pixels = pixelLists.flat();
  // Links in two passes: a builder with no campaign yet is placed in its
  // set-up only through its own page; then the newest of each set-up, for its profile.
  const links: Record<number, BuilderLinks> = {};
  await readLinks(api, builders.filter(b => b.campaigns.length === 0).map(b => b.id), links);
  await readLinks(api, newestOfSetUps(builders, links).filter(id => links[id] === undefined), links);

  const adopted = adoptTopic({
    launchKey: request.launchKey, topic, configurations, termGroups, posts, builders, pixels,
    vertical: request.vertical?.trim() || null,
    campaigns: { creatives, tsps, links, campaigns, countries },
  });

  const folder = path.join(root, request.launchKey);
  try {
    fs.mkdirSync(folder);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new RefusedError(`залив \`${request.launchKey}\` уже є — тека існує`);
    throw e;
  }
  for (const dir of adopted.tree.dirs) fs.mkdirSync(path.join(folder, dir), { recursive: true });
  for (const file of adopted.tree.files) {
    const target = path.join(folder, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, { flag: 'wx' });
  }
  const notes = [...adopted.notes];
  for (const { folder: article, picture } of adopted.pictures) {
    try {
      fs.writeFileSync(path.join(folder, article, picture.path), await pictureBytes(picture.src), { flag: 'wx' });
    } catch (e) {
      notes.push(`${article}/${picture.path}: картинку не вдалось забрати (${(e as Error).message}) — покладіть її руками, plan запропонує оновити статтю`);
    }
  }
  // The fingerprints again, with the pictures as they now lie on disk — what the plan will hash.
  const state = adopted.state;
  const site = parseTopicManifest(adopted.tree.files.find(f => f.path === 'topic.yaml')!.content);
  for (const [name, entry] of Object.entries(state.articles)) {
    const own = path.join(folder, 'articles', name);
    const readImage: ImageReader = ref => {
      const target = path.resolve(own, ref);
      if (!target.startsWith(own + path.sep) || !fs.existsSync(target)) return null;
      return { mime: mimeFor(path.extname(target)), base64: fs.readFileSync(target).toString('base64') };
    };
    const countries = posts.find(p => p.id === entry.id)?.country ?? ['All'];
    const hash = articleFingerprint(fs.readFileSync(path.join(own, 'article.md'), 'utf8'), readImage, site.ok ? site.value.site : '', countries);
    state.articles[name] = { id: entry.id, hash: hash ?? '' };
  }
  writeState(folder, state);

  return {
    launchKey: request.launchKey, folder, topicId: topic.id,
    files: adopted.tree.files.map(f => f.path),
    termgroups: Object.keys(state.termgroups), articles: Object.keys(state.articles), campaigns: Object.keys(state.campaigns), notes,
  };
}

/** A few builder pages at a time: an import of a scaled topic reads dozens, and the platform is one buyer's to share. */
async function readLinks(api: PlatformClient, ids: readonly number[], into: Record<number, BuilderLinks>): Promise<void> {
  for (let i = 0; i < ids.length; i += 5) {
    const chunk = ids.slice(i, i + 5);
    const read = await Promise.all(chunk.map(id => readBuilderLinks(api, id)));
    chunk.forEach((id, n) => { into[id] = read[n]!; });
  }
}

/** What the import dialog lists: the buyer's topics no folder has yet, each with a launch key to start from. */
export interface ImportList {
  topics: (ImportableTopic & { launchKey: string })[];
}

export function importList(config: SaConfig, platform: PlatformStatus): ImportList {
  const root = config.launches_root;
  const taken = existingLaunchKeys(root);
  const topics = importableTopics(platform.builders, platform.campaigns, adoptedTopicIds(root));
  const keys: string[] = [...taken];
  return {
    topics: topics.map(t => {
      const launchKey = suggestLaunchKey(t.name, keys);
      keys.push(launchKey);
      return { ...t, launchKey };
    }),
  };
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

