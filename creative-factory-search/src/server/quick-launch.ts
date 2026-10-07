// The launch from the creatives tab, on the server: read a topic off the
// platform, and run the writes `core/quick-launch.ts` decides as a job the
// editor watches. Nothing is written to disk but the job's own scratch; the
// platform is asked again on every read, and a retry is the same call again —
// what the first attempt already put up, the core finds and reuses.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeStem } from '../core/batch.ts';
import { decodeDataUrl, extensionFor } from '../core/data-url.ts';
import {
  articleText, headlineText, isTrafficSource, sameSet, sameTsp, uploadedId, type BuilderLinks, type CreativeRef, type TrafficSource, type TspRef,
} from '../core/platform-model.ts';
import { buyerIdFromToken } from '../core/platform-token.ts';
import { DEFAULT_QUEUE, pauseBefore, type WriteKind } from '../core/queue.ts';
import {
  BUILDERS_URL, launchSteps, linksWanted, placeSources, plainFailure, setsAndDefaults, teamDefaults, topicFolder,
  type LaunchForm, type LaunchStep, type TopicSets, type TopicSnapshot,
} from '../core/quick-launch.ts';
import type { SaConfig } from './config.ts';
import { createJob, jobById, outputsOf, RefusedError, settleJob, type Job } from './jobs.ts';
import { PolicyStop, writeUnderPolicy } from './policy.ts';
import {
  createBuilder, createdId, createHeadline, createTsp, PlatformClient, platformState, readAdAccounts, readBuilderLinks, readBuilders,
  readBuyerBuilders, readBuyerCampaigns, readBuyerTopics, readCountries, readCreatives, readLanguages, readPixels, readPost, readPosts, readRsocCounts, readTermGroups,
  readThemes, readTopic, readTsps, uploadCreative, type Answer,
} from './platform.ts';

function client(config: SaConfig): PlatformClient {
  const state = platformState(config);
  if (!state.ready) throw new RefusedError(state.note);
  return new PlatformClient(state);
}

const buyer = (config: SaConfig): number | null => config.platform.user_id ?? buyerIdFromToken(config.platform.token);

/** The buyer's topics by name, for the form's first select. */
export async function launchTopics(config: SaConfig): Promise<{ id: number; name: string }[]> {
  const topics = await readBuyerTopics(client(config), buyer(config));
  return topics.map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** A few builder pages at a time: a scaled topic has dozens, and the platform is one buyer's to share. */
async function readLinks(api: PlatformClient, ids: readonly number[], into: Record<number, BuilderLinks>): Promise<void> {
  for (let i = 0; i < ids.length; i += 5) {
    const chunk = ids.slice(i, i + 5);
    const read = await Promise.all(chunk.map(id => readBuilderLinks(api, id)));
    chunk.forEach((id, n) => { into[id] = read[n]!; });
  }
}

/** One topic as the core reads it, for one traffic source: its sets are built from every builder, its cabinets and pixels are the source's. */
export async function readTopicSnapshot(api: PlatformClient, topicId: number, source: TrafficSource): Promise<TopicSnapshot> {
  const topic = await readTopic(api, topicId);
  if (topic === null) throw new RefusedError(`топіка ${topicId} на платформі немає`);
  const [termGroups, posts, builders, creatives, tsps, campaigns, countries, pixels, themes, rsocCounts, languages] = await Promise.all([
    readTermGroups(api, topicId), readPosts(api, topicId), readBuilders(api, topicId), readCreatives(api, topicId),
    readTsps(api, topicId, topic.user_id), readBuyerCampaigns(api, topic.user_id), readCountries(api), readPixels(api, source),
    readThemes(api), readRsocCounts(api), readLanguages(api),
  ]);
  const sites = [...new Set(posts.map(p => p.site_id).filter(id => id > 0))];
  const adAccounts = (await Promise.all(sites.map(site => readAdAccounts(api, site, source)))).flat()
    .filter((a, i, all) => all.findIndex(b => b.id === a.id) === i);
  // A topic with no campaign takes its niche's pixel — the one the buyer last used anywhere, which only their other topics say.
  const buyerPixels = builders.length > 0 ? [] : (await readBuyerBuilders(api, topic.user_id))
    .filter(b => b.traffic_source === source).sort((x, y) => y.id - x.id).map(b => b.pixel_id);
  const snapshot: TopicSnapshot = {
    topic, termGroups: termGroups.map(g => ({ id: g.id, name: g.name })), posts: posts.map(p => ({ id: p.id, title: p.title, site_id: p.site_id })),
    builders, links: {}, tsps, campaigns, creatives, countries, pixels, buyerPixels, adAccounts, themes, rsocCounts, languages,
  };
  // Two passes: builders without a campaign first — their set is only on their page — then the newest of every set.
  for (let pass = 0; pass < 2; pass++) await readLinks(api, linksWanted(snapshot), snapshot.links);
  return snapshot;
}

/** What the form opens with: the sets and their defaults, and the lists its selects offer. */
export interface LaunchTopic extends TopicSets {
  topic: { id: number; name: string };
  source: TrafficSource;
  countries: { code: string; name: string }[];
  pixels: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  themes: { id: string; title: string }[];
  rsocCounts: number[];
}

/** The team's defaults as this buyer's config may override them. */
function defaultsOf(config: SaConfig) {
  return teamDefaults(config.launch_defaults);
}

export async function launchTopic(config: SaConfig, topicId: number, source: string): Promise<LaunchTopic> {
  const wanted: TrafficSource = isTrafficSource(source) ? source : defaultsOf(config).source;
  const snapshot = await readTopicSnapshot(client(config), topicId, wanted);
  return {
    ...setsAndDefaults(snapshot, defaultsOf(config)),
    topic: { id: snapshot.topic.id, name: snapshot.topic.name },
    source: wanted,
    countries: snapshot.countries.map(c => ({ code: c.code, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    pixels: snapshot.pixels.map(p => ({ id: String(p.id), name: p.name })),
    accounts: snapshot.adAccounts.map(a => ({ id: String(a.id), name: a.name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    themes: snapshot.themes.map(t => ({ id: String(t.id), title: t.title })),
    rsocCounts: snapshot.rsocCounts,
  };
}

// ---------------------------------------------------------------- show --

/** A topic by its id, or by its name among the buyer's — what `sa show` is given. */
async function findTopic(config: SaConfig, api: PlatformClient, wanted: string): Promise<number> {
  if (/^\d+$/.test(wanted.trim())) return Number(wanted.trim());
  const fold = wanted.trim().toLowerCase();
  const topics = await readBuyerTopics(api, buyer(config));
  const found = topics.filter(t => t.name.toLowerCase() === fold || t.internal_name.toLowerCase() === fold);
  if (found.length === 1) return found[0]!.id;
  const near = topics.filter(t => t.name.toLowerCase().includes(fold));
  if (found.length === 0 && near.length === 1) return near[0]!.id;
  const names = (found.length > 0 ? found : near).map(t => `${t.name} (${t.id})`);
  throw new RefusedError(names.length === 0 ? `топіка «${wanted}» серед ваших немає — \`sa topics\` покаже всі` : `«${wanted}» — кілька топіків: ${names.join(', ')}; назвіть id`);
}

/** One topic for Claude to read: term groups with keywords and weights, articles as text, and the sets the form would offer. Reads only. */
export async function showTopic(config: SaConfig, wanted: string, source: string) {
  const api = client(config);
  const topicId = await findTopic(config, api, wanted);
  const from: TrafficSource = isTrafficSource(source) ? source : defaultsOf(config).source;
  const snapshot = await readTopicSnapshot(api, topicId, from);
  const [groups, posts] = await Promise.all([
    readTermGroups(api, topicId),
    Promise.all(snapshot.posts.map(p => readPost(api, p.id))),
  ]);
  const { sets, missing } = setsAndDefaults(snapshot, defaultsOf(config));
  return {
    topic: { id: snapshot.topic.id, name: snapshot.topic.name },
    source: from,
    missing,
    termGroups: groups.map(g => ({ id: g.id, name: g.name, weight: g.weight, country: g.country, language: g.language, keywords: g.terms })),
    articles: posts.filter(p => p !== null).map(p => ({
      id: p!.id, title: p!.title, status: p!.status, country: p!.country, language: p!.language, text: articleText(p!.description),
    })),
    sets: sets.map(s => ({
      termGroup: s.termGroup.name, article: s.article.title, campaigns: s.campaigns, latestBuilder: s.latest,
      country: s.defaults.country, budget: s.defaults.budget, bid: s.defaults.bid, launch_tomorrow: s.defaults.launch_tomorrow, headline: s.defaults.headline,
    })),
  };
}

// --------------------------------------------------------------- files --

/**
 * A designer's mp4 dropped into the form, held on this machine until a launch
 * takes it: sent once when it is added, found by its digest on every press
 * after — a retry does not send fifty megabytes over again. Two days, then swept.
 */
const STAGE = path.join(os.tmpdir(), 'sa-launch-files');
const STAGE_KEEP_MS = 2 * 24 * 60 * 60 * 1000;

export interface StagedFile {
  id: string;
  name: string;
  size: number;
}

export async function stageFile(body: NodeJS.ReadableStream, name: string): Promise<StagedFile> {
  if (!/\.mp4$/i.test(name)) throw new RefusedError(`${name}: залити можна лише mp4`);
  fs.mkdirSync(STAGE, { recursive: true });
  for (const old of fs.readdirSync(STAGE)) {
    const file = path.join(STAGE, old);
    if (Date.now() - fs.statSync(file).mtimeMs > STAGE_KEEP_MS) fs.rmSync(file, { force: true });
  }
  const incoming = path.join(STAGE, `incoming-${crypto.randomUUID()}`);
  const hash = crypto.createHash('sha256');
  let size = 0;
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(incoming);
    body.on('data', (chunk: Buffer) => { hash.update(chunk); size += chunk.length; });
    body.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    body.pipe(out);
  });
  const head = Buffer.alloc(8);
  const fd = fs.openSync(incoming, 'r');
  fs.readSync(fd, head, 0, 8, 0);
  fs.closeSync(fd);
  if (head.subarray(4, 8).toString('latin1') !== 'ftyp') {
    fs.rmSync(incoming, { force: true });
    throw new RefusedError(`${name}: це не mp4 — файл не відкривається як відео`);
  }
  const id = hash.digest('hex');
  fs.renameSync(incoming, path.join(STAGE, `${id}.mp4`));
  return { id, name: path.basename(name), size };
}

const stagedPath = (id: string): string | null => {
  if (!/^[0-9a-f]{64}$/.test(id)) return null;
  const file = path.join(STAGE, `${id}.mp4`);
  return fs.existsSync(file) ? file : null;
};

// -------------------------------------------------------------- launch --

export interface LaunchRequest {
  topicId: number;
  form: LaunchForm;
  /** Rendered files, each by the export job that made it and its name there. */
  renders: { job: string; name: string }[];
  /** Files from disk, each by the id staging gave it. */
  disk: { id: string; name: string }[];
  /** Output name → the script that creative speaks, its `ad_script`. */
  scripts: Record<string, string>;
  /** The pictures behind the renders, as data URLs, for the topic's sources folder once the campaign is made. */
  sources: { name: string; image: string }[];
  confirm: boolean;
}

/** A step that cannot go on: the job stops and says why. */
class StepError extends Error {}
class Cancelled extends Error {}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function pause(job: Job, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until && !job.cancelled) await sleep(Math.min(200, until - Date.now()));
}

const list = <T>(v: unknown, ok: (x: unknown) => boolean): T[] => (Array.isArray(v) && v.every(ok) ? (v as T[]) : []);
const bagOf = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;

function parseRequest(body: unknown): LaunchRequest {
  const b = bagOf(body);
  if (b['confirm'] !== true) throw new RefusedError('залив без явного підтвердження не виконується');
  const topicId = b['topicId'];
  if (typeof topicId !== 'number' || !Number.isInteger(topicId) || topicId <= 0) throw new RefusedError('не вибрано топік');
  if (typeof b['form'] !== 'object' || b['form'] === null) throw new RefusedError('порожня форма заливу');
  const renders = list<{ job: string; name: string }>(b['renders'], x => typeof bagOf(x)['job'] === 'string' && typeof bagOf(x)['name'] === 'string');
  const disk = list<{ id: string; name: string }>(b['disk'], x => typeof bagOf(x)['id'] === 'string' && typeof bagOf(x)['name'] === 'string');
  const sources = list<{ name: string; image: string }>(b['sources'], x => typeof bagOf(x)['name'] === 'string' && typeof bagOf(x)['image'] === 'string');
  if (renders.length + disk.length === 0) throw new RefusedError('немає жодного креативу — відмітьте рендер або додайте mp4 з диска');
  const scripts = typeof b['scripts'] === 'object' && b['scripts'] !== null ? b['scripts'] as Record<string, string> : {};
  return { topicId, form: b['form'] as LaunchForm, renders, disk, scripts, sources, confirm: true };
}

/** One line of the launch's progress: a write it makes, or something it found and reuses. */
export interface LaunchLine {
  label: string;
  reused: boolean;
}

/** The step after the campaign: the pictures into the topic's sources folder. */
const sourcesLabel = (folder: string): string => `зберегти ісходники в ${folder.replace(os.homedir(), '~')}`;

/**
 * Start a launch: the files are copied out of the export jobs and staging —
 * which may be swept while the uploads run — the topic is read, the steps
 * decided, and a refusal comes back now, before a job exists. Otherwise the
 * job id, and every line the progress will show.
 */
export async function startLaunch(config: SaConfig, body: unknown): Promise<{ id: string; lines: LaunchLine[]; warnings: string[] }> {
  const request = parseRequest(body);
  const picked: { name: string; path: string; script: string }[] = [];
  for (const r of request.renders) {
    const render = jobById(r.job);
    if (render === undefined) throw new RefusedError('рендер уже прибрано — відрендерте ще раз');
    if (render.state === 'running') throw new RefusedError('рендер ще йде');
    const output = outputsOf(render).find(o => o.name === r.name);
    if (output === undefined) throw new RefusedError(`у рендері немає ${r.name} — відрендерте ще раз`);
    picked.push({ name: r.name, path: output.file, script: request.scripts[r.name] ?? '' });
  }
  for (const d of request.disk) {
    const file = stagedPath(d.id);
    if (file === null) throw new RefusedError(`${d.name} уже прибрано з сервера — додайте файл ще раз`);
    picked.push({ name: path.basename(d.name), path: file, script: '' });
  }

  const api = client(config);
  const snapshot = await readTopicSnapshot(api, request.topicId, request.form.source);
  const files = picked.map(f => ({
    ...f, hash: crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex'),
  }));
  const plan = launchSteps(request.form, snapshot, files);
  if (!plan.ok) throw new RefusedError(plan.errors.join('\n'));

  const folder = path.join(config.sources_root, topicFolder(snapshot.topic.name));
  const labels = [...plan.steps.map(s => s.label), ...(request.sources.length > 0 ? [sourcesLabel(folder)] : [])];
  const job = createJob(labels.length, null, 'sa-launch-');
  // Every file the steps upload, by its name in the form, copied where no sweep reaches it.
  const local = new Map<string, string>();
  for (const f of files) {
    if (local.has(f.name) || !plan.steps.some(s => s.kind === 'creative.upload' && s.file === f.name)) continue;
    const copy = path.join(job.dir, `${local.size}-${path.basename(f.name)}`);
    fs.copyFileSync(f.path, copy);
    local.set(f.name, copy);
  }
  void runLaunch({ api, job, topicId: snapshot.topic.id, userId: snapshot.topic.user_id, local, sources: request.sources, folder }, plan.steps);
  return {
    id: job.id,
    lines: [...plan.found.map(label => ({ label, reused: true })), ...labels.map(label => ({ label, reused: false }))],
    warnings: plan.warnings,
  };
}

interface Run {
  api: PlatformClient;
  job: Job;
  topicId: number;
  userId: number;
  /** Output name → the copy in the job's scratch. */
  local: Map<string, string>;
  sources: { name: string; image: string }[];
  /** The topic's sources folder. */
  folder: string;
}

/** What this launch's own steps made, for the builder's refs. */
interface Made {
  uploads: Map<string, number>;
  headline: number | null;
  tsp: number | null;
}

async function runLaunch(run: Run, steps: readonly LaunchStep[]): Promise<void> {
  const made: Made = { uploads: new Map(), headline: null, tsp: null };
  let crashed: Error | null = null;
  try {
    for (const [index, step] of steps.entries()) {
      if (run.job.cancelled) break;
      if (index > 0) await pause(run.job, pauseBefore('step', DEFAULT_QUEUE));
      if (run.job.cancelled) break;
      run.job.active.clear();
      run.job.active.add(step.label);
      try {
        const result = await runStep(run, step, made);
        run.job.outputs.push({ name: step.label, file: '' });
        if (result !== null) run.job.result = result;
      } catch (e) {
        if (!(e instanceof Cancelled)) run.job.errors.push({ name: step.label, message: plainFailure(step.kind, (e as Error).message) });
        break;
      } finally {
        run.job.progress.delete(step.label);
      }
    }
    // The campaign is there: the sources follow it, and a folder that will not take them is said, not a failed launch.
    if (run.job.result !== null && run.sources.length > 0) {
      const label = sourcesLabel(run.folder);
      run.job.active.clear();
      run.job.active.add(label);
      try {
        const written = saveSources(run.folder, run.sources);
        run.job.outputs.push({ name: label, file: '' });
        run.job.result = { ...run.job.result, label: `${run.job.result.label} · ісходників нових: ${written}` };
      } catch (e) {
        run.job.errors.push({ name: label, message: `кампанію створено, а ісходники не лягли в ${run.folder}: ${(e as Error).message}` });
      }
    }
  } catch (e) {
    crashed = e as Error;
  }
  settleJob(run.job, crashed);
  // A launch is done when the campaign is there, and failed when it is not — however many steps went through.
  if (!run.job.cancelled) run.job.state = run.job.result !== null ? 'done' : 'failed';
}

/** The pictures into the topic's folder, flat, as `placeSources` lays them. Answers how many were new. */
function saveSources(folder: string, sources: readonly { name: string; image: string }[]): number {
  fs.mkdirSync(folder, { recursive: true });
  const digest = (bytes: Buffer): string => crypto.createHash('sha256').update(bytes).digest('hex');
  const held = fs.readdirSync(folder, { withFileTypes: true }).filter(d => d.isFile() && !d.name.startsWith('.'))
    .map(d => ({ name: d.name, hash: digest(fs.readFileSync(path.join(folder, d.name))) }));
  const bytes = new Map<string, Buffer>();
  const incoming = sources.flatMap(source => {
    const decoded = decodeDataUrl(source.image);
    if (decoded === null) return [];
    const data = Buffer.from(decoded.base64, 'base64');
    const hash = digest(data);
    bytes.set(hash, data);
    return [{ name: `${safeStem(source.name) || 'photo'}.${extensionFor(decoded.mime)}`, hash }];
  });
  const placed = placeSources(held, incoming);
  for (const file of placed) fs.writeFileSync(path.join(folder, file.name), bytes.get(file.hash)!);
  return placed.length;
}

async function underPolicy(run: Run, kind: WriteKind, send: () => Promise<Answer>, find: () => Promise<number | null>): Promise<{ answer: Answer | null; id: number | null }> {
  try {
    const { answer, found } = await writeUnderPolicy({
      kind, send, readBack: find,
      pause: ms => pause(run.job, ms),
      checkpoint: () => { if (run.job.cancelled) throw new Cancelled('скасовано'); },
    });
    return { answer, id: found };
  } catch (e) {
    if (e instanceof PolicyStop) throw new StepError(e.message);
    throw e;
  }
}

/** The id in the list now that the list before did not have. */
const freshIn = (before: readonly number[], now: readonly number[]): number | null => {
  const fresh = now.filter(id => !before.includes(id));
  return fresh.length === 0 ? null : Math.max(...fresh);
};

/** One step. Answers the new campaign for the builder, null for the rest. */
async function runStep(run: Run, step: LaunchStep, made: Made): Promise<{ url: string; label: string } | null> {
  const { api, topicId } = run;
  switch (step.kind) {
    case 'creative.upload': {
      const videos = async () => (await readCreatives(api, topicId)).filter(c => c.media_type === 'Video');
      const before = (await videos()).map(c => c.id);
      const bytes = fs.readFileSync(run.local.get(step.file)!);
      const fields = { ...step.body, topic_ids: step.body.topic_ids.map(String) };
      const progress = (done: number, total: number): void => { run.job.progress.set(step.label, { done, total }); };
      await underPolicy(run, 'create', () => uploadCreative(api, fields, { name: step.upload, bytes }, progress),
        async () => uploadedId(before, await videos(), step.upload));
      const id = uploadedId(before, await videos(), step.upload);
      if (id === null) throw new StepError(`після завантаження платформа не показує ${step.upload} у топіку — «Спробувати ще» дозавантажить`);
      made.uploads.set(step.upload, id);
      return null;
    }
    case 'headline.create': {
      const list = async (): Promise<number[]> =>
        (await readCreatives(api, topicId)).filter(c => c.media_type === 'Headline' && headlineText(c.headline) === step.text).map(c => c.id);
      const before = await list();
      const { id } = await underPolicy(run, 'create', () => createHeadline(api, { ...step.body, topic_ids: [String(topicId)] }), async () => freshIn(before, await list()));
      const headlineId = id ?? freshIn(before, await list());
      if (headlineId === null) throw new StepError('headline відправлено, але платформа його не показує в топіку');
      made.headline = headlineId;
      return null;
    }
    case 'tsp.create': {
      const list = async (): Promise<number[]> => (await readTsps(api, topicId, run.userId)).filter(t => sameTsp(t.fields, step.fields)).map(t => t.id);
      const before = await list();
      // The answer is a bare `success`: the read-back is where the id comes from.
      const { id } = await underPolicy(run, 'create', () => createTsp(api, { ...step.body, topic_id: topicId }), async () => freshIn(before, await list()));
      const tspId = id ?? freshIn(before, await list());
      if (tspId === null) throw new StepError('TSP відправлено, але платформа його не показує серед профілів');
      made.tsp = tspId;
      return null;
    }
    case 'builder.create': {
      const creative = (ref: CreativeRef): number => {
        if (typeof ref === 'number') return ref;
        if ('headline' in ref) {
          if (made.headline === null) throw new StepError('headline ще не створено');
          return made.headline;
        }
        const id = made.uploads.get(ref.file);
        if (id === undefined) throw new StepError(`креатив ${ref.file} ще не завантажено`);
        return id;
      };
      const profile = (ref: TspRef): number => {
        if (typeof ref === 'number') return ref;
        if (made.tsp === null) throw new StepError('TSP ще не створено');
        return made.tsp;
      };
      const creativeIds = step.body.creative_repo_ids.map(creative);
      const fields = {
        ...step.body,
        topic_id: String(topicId),
        post_id: String(step.body.post_id),
        traffic_source_profile_ids: step.body.traffic_source_profile_ids.map(profile).map(String),
        creative_repo_ids: creativeIds.map(String),
        term_group_ids: step.body.term_group_ids.map(String),
      };
      const postId = Number(step.body.post_id);
      const list = async (): Promise<number[]> =>
        (await readBuilders(api, topicId)).filter(b => b.post_id === postId && sameSet(b.creative_ids, creativeIds)).map(b => b.id);
      const before = await list();
      const { answer, id } = await underPolicy(run, 'create', () => createBuilder(api, fields), async () => freshIn(before, await list()));
      const builderId = createdId(answer ?? { status: 'timeout' }, 'campaignBuilder') ?? id;
      if (builderId === null) throw new StepError('кампанію відправлено, але платформа не повернула її id і не показує її');
      return { url: BUILDERS_URL, label: `кампанія створена — builder ${builderId}` };
    }
  }
}
