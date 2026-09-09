// `plan` and `apply` for one launch folder, on the server — the only process
// that talks to the platform and the only writer of `state.json`.
//
// `plan` reads the folder, takes a snapshot of the platform and hands both to
// `core/plan.ts`; nothing is created. `apply` runs the steps of that plan as a
// job on the registry, one after another, with the pauses and the read-backs
// the queue policy in `core/queue.ts` decides, writing each id into the state
// file the moment it is known — and the "before" list before each send, so a
// crash between the platform's answer and the file still leaves a way to tell
// the new entity from its namesakes on the next run.
//
// Two kinds of state file: the topic's, at the launch root, and one per
// campaign beside its manifest. Both are read into one `LaunchState` and
// written back from it, each to its own file.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArticle, type ImageReader } from '../core/article.ts';
import { isFolderName, mimeFor } from '../core/batch-folder.ts';
import {
  emptyCampaignState, headlineText, matchUploads, parseCampaignState, sameSet, sameTsp, withRetired, type CampaignSource,
  type CampaignState, type CreativeRef, type PostRef, type TspRef,
} from '../core/campaign-plan.ts';
import { parseCampaignManifest, parseTopicManifest, type TopicManifest } from '../core/launch.ts';
import {
  adoptResolved, campaignOf, campaignOutline, chooseTopic, emptyState, firstNew, narrowPlan, parseKeywords, parseState, parseTermGroupOptions,
  plan as makePlan, previewPlan, type ArticleSource, type CampaignOutline, type LaunchContents, type LaunchState, type Plan,
  type PlanPreview, type PlanStep, type Snapshot, type TermGroupRef, type TermGroupSource, type TopicRef,
} from '../core/plan.ts';
import { CREATIVES_DIR } from '../core/placement.ts';
import { DEFAULT_QUEUE, nextAction, pauseBefore, type Attempt } from '../core/queue.ts';
import { launchFolder } from './batches.ts';
import type { SaConfig } from './config.ts';
import { createJob, settleJob, type Job } from './jobs.ts';
import { RefusedError } from './launches.ts';
import {
  createBuilder, createConfiguration, createdId, createHeadline, createPost, createTermGroup, createTopic, createTsp,
  pauseCampaigns, PlatformClient, platformState, readAdAccounts, readBuilders, readCampaigns, readConfigurations,
  readCountries, readCreatives, readLanguages, readPixels, readPosts, readRsocCounts, readSites, readTermGroups, readThemes,
  readTopic, readTsps, searchTopics, setTermGroupWeights, updatePost, updateTermGroup, updateTsp, uploadCreative,
  type Answer,
} from './platform.ts';

const STATE_FILE = 'state.json';
const CAMPAIGNS_DIR = 'campaigns';

// ------------------------------------------------------------- folder --

function readTermGroupFolders(folder: string, errors: string[]): TermGroupSource[] {
  const dir = path.join(folder, 'termgroups');
  if (!fs.existsSync(dir)) return [];
  const groups: TermGroupSource[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isFolderName(entry.name)) continue;
    const keywordsFile = path.join(dir, entry.name, 'keywords.txt');
    if (!fs.existsSync(keywordsFile)) {
      errors.push(`termgroups/${entry.name}: немає keywords.txt`);
      continue;
    }
    const keywords = parseKeywords(fs.readFileSync(keywordsFile, 'utf8'));
    const optionsFile = path.join(dir, entry.name, 'termgroup.yaml');
    const options = parseTermGroupOptions(fs.existsSync(optionsFile) ? fs.readFileSync(optionsFile, 'utf8') : null);
    if (!keywords.ok) errors.push(...keywords.errors.map(e => `termgroups/${entry.name}: ${e}`));
    if (!options.ok) errors.push(...options.errors.map(e => `termgroups/${entry.name}: ${e}`));
    if (keywords.ok && options.ok) groups.push({ name: entry.name, keywords: keywords.value, ...options.value });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

function readArticleFolders(folder: string, errors: string[]): ArticleSource[] {
  const dir = path.join(folder, 'articles');
  if (!fs.existsSync(dir)) return [];
  const articles: ArticleSource[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isFolderName(entry.name)) continue;
    const own = path.join(dir, entry.name);
    const file = path.join(own, 'article.md');
    if (!fs.existsSync(file)) {
      errors.push(`articles/${entry.name}: немає article.md`);
      continue;
    }
    // Pictures are read relative to the article folder and never above it.
    const readImage: ImageReader = ref => {
      const target = path.resolve(own, ref);
      if (!target.startsWith(own + path.sep) || !fs.existsSync(target)) return null;
      return { mime: mimeFor(path.extname(target)), base64: fs.readFileSync(target).toString('base64') };
    };
    const parsed = parseArticle(fs.readFileSync(file, 'utf8'), readImage);
    if (!parsed.ok) errors.push(...parsed.errors.map(e => `articles/${entry.name}: ${e}`));
    else articles.push({ name: entry.name, article: parsed.value });
  }
  return articles.sort((a, b) => a.name.localeCompare(b.name));
}

/** The campaign folder names a launch has, whatever is in them. */
function campaignFolders(folder: string): string[] {
  const dir = path.join(folder, CAMPAIGNS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && isFolderName(d.name))
    .map(d => d.name)
    .sort((a, b) => a.localeCompare(b));
}

/** The mp4 files at the top of `creatives/` — `rejected/` and anything else below it are not creatives to send. */
function creativeFiles(campaignFolder: string): string[] {
  const dir = path.join(campaignFolder, CREATIVES_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && /\.mp4$/i.test(d.name))
    .map(d => d.name)
    .sort((a, b) => a.localeCompare(b));
}

const fileHash = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/**
 * A campaign is read once it has creatives; before that its folder is the
 * buyer's draft — placeholders in the manifest and all — and the plan says
 * it was left out rather than refusing the whole launch over it.
 */
function readCampaignFolders(folder: string, topic: TopicManifest, errors: string[], notes: string[]): CampaignSource[] {
  const campaigns: CampaignSource[] = [];
  for (const name of campaignFolders(folder)) {
    const own = path.join(folder, CAMPAIGNS_DIR, name);
    const files = creativeFiles(own);
    if (files.length === 0) {
      notes.push(`campaigns/${name}: у creatives/ немає mp4 — кампанію пропущено`);
      continue;
    }
    const manifestFile = path.join(own, 'campaign.yaml');
    if (!fs.existsSync(manifestFile)) {
      errors.push(`campaigns/${name}: немає campaign.yaml`);
      continue;
    }
    const manifest = parseCampaignManifest(fs.readFileSync(manifestFile, 'utf8'), topic);
    if (!manifest.ok) {
      errors.push(...manifest.errors.map(e => `campaigns/${name}/campaign.yaml: ${e}`));
      continue;
    }
    const scriptFile = path.join(own, 'script.md');
    const script = fs.existsSync(scriptFile) ? fs.readFileSync(scriptFile, 'utf8').trim() : '';
    campaigns.push({
      name,
      manifest: manifest.value,
      script,
      creatives: files.map(file => ({ name: file, hash: fileHash(path.join(own, CREATIVES_DIR, file)) })),
    });
  }
  return campaigns;
}

/** Everything the folder says, or a refusal naming every problem at once. */
export function readLaunchContents(folder: string): LaunchContents {
  const errors: string[] = [];
  const notes: string[] = [];
  const manifest = parseTopicManifest(fs.readFileSync(path.join(folder, 'topic.yaml'), 'utf8'));
  if (!manifest.ok) errors.push(...manifest.errors.map(e => `topic.yaml: ${e}`));
  const termgroups = readTermGroupFolders(folder, errors);
  const articles = readArticleFolders(folder, errors);
  const campaigns = manifest.ok ? readCampaignFolders(folder, manifest.value, errors, notes) : [];
  if (!manifest.ok || errors.length > 0) throw new RefusedError(errors.join('\n'));
  return { topic: manifest.value, termgroups, articles, campaigns, notes };
}

export function readState(folder: string): LaunchState {
  const file = path.join(folder, STATE_FILE);
  let state = emptyState();
  if (fs.existsSync(file)) {
    const parsed = parseState(fs.readFileSync(file, 'utf8'));
    if (!parsed.ok) throw new RefusedError(parsed.errors.join('; '));
    state = parsed.value;
  }
  for (const name of campaignFolders(folder)) {
    const own = path.join(folder, CAMPAIGNS_DIR, name, STATE_FILE);
    if (!fs.existsSync(own)) continue;
    const parsed = parseCampaignState(fs.readFileSync(own, 'utf8'));
    if (!parsed.ok) throw new RefusedError(parsed.errors.map(e => `campaigns/${name}/${e}`).join('; '));
    state.campaigns[name] = parsed.value;
  }
  return state;
}

/** Written whole and renamed into place: a crash mid-write leaves the old file, not half of a new one. */
function writeJson(file: string, value: unknown): void {
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

/** The topic's file without the campaigns, and each campaign's file beside its manifest. */
function writeState(folder: string, state: LaunchState): void {
  const { campaigns, ...topic } = state;
  writeJson(path.join(folder, STATE_FILE), topic);
  for (const [name, own] of Object.entries(campaigns)) {
    const dir = path.join(folder, CAMPAIGNS_DIR, name);
    if (!fs.existsSync(dir)) continue;
    writeJson(path.join(dir, STATE_FILE), own);
  }
}

// ----------------------------------------------------------- snapshot --

function client(config: SaConfig): PlatformClient {
  const state = platformState(config);
  if (!state.ready) throw new RefusedError(state.note);
  return new PlatformClient(state);
}

/** The topic by the state's id, plus every topic the search finds under either name. */
async function findTopics(api: PlatformClient, topic: TopicManifest, state: LaunchState): Promise<Snapshot['topics']> {
  const topics: Snapshot['topics'] = [];
  if (state.topic_id !== null) {
    const known = await readTopic(api, state.topic_id);
    if (known !== null) topics.push(known);
  }
  for (const term of new Set([topic.internal_name, topic.name])) {
    for (const found of await searchTopics(api, term)) {
      if (!topics.some(t => t.id === found.id)) topics.push(found);
    }
  }
  return topics;
}

export async function readSnapshot(api: PlatformClient, topic: TopicManifest, state: LaunchState): Promise<Snapshot> {
  const siteId = Number(topic.site);
  const [countries, sites, topics, pixels, adAccounts, themes, rsocCounts, languages] = await Promise.all([
    readCountries(api),
    readSites(api),
    findTopics(api, topic, state),
    readPixels(api, topic.traffic_source),
    // A placeholder site cannot be asked about; the plan refuses it by name.
    Number.isInteger(siteId) && siteId > 0 ? readAdAccounts(api, siteId, topic.traffic_source) : Promise.resolve([]),
    readThemes(api),
    readRsocCounts(api),
    readLanguages(api),
  ]);
  const directories = { countries, sites, pixels, adAccounts, themes, rsocCounts, languages };
  // The rest is filtered by the topic `plan` will settle on — the same rule, asked once in core.
  const choice = chooseTopic(topics, topic, state);
  if (choice.kind !== 'known' && choice.kind !== 'found') {
    return { ...directories, topics, configurations: [], termGroups: [], posts: [], creatives: [], tsps: [], builders: [], campaigns: [] };
  }
  const topicId = choice.id;
  const userId = topics.find(t => t.id === topicId)?.user_id ?? 0;
  const [configurations, termGroups, posts, creatives, tsps, builders] = await Promise.all([
    readConfigurations(api, topicId), readTermGroups(api, topicId), readPosts(api, topicId),
    readCreatives(api, topicId), readTsps(api, topicId, userId), readBuilders(api, topicId),
  ]);
  // The campaign list is read for the campaigns the builders made, and only those: it is what says whether an old one is live.
  const campaigns = await readCampaigns(api, builders.flatMap(b => b.campaigns.map(c => c.id)));
  return { ...directories, topics, configurations, termGroups, posts, creatives, tsps, builders, campaigns };
}

// --------------------------------------------------------------- plan --

export interface Planned {
  folder: string;
  contents: LaunchContents;
  state: LaunchState;
  /** The whole topic's plan, or one campaign's when asked for one. */
  plan: Plan;
  campaign: string | null;
  /** One line per campaign folder, from the whole plan — what the tree offers on each. */
  outline: CampaignOutline[];
}

/** The plan for the topic, or — with `campaign` — the part of it one campaign needs. */
/** Launch keys with an apply in flight: one writer of a state file at a time, not merely one process. */
const applying = new Set<string>();

/**
 * The plan, and the ids it found on the way written down. Nothing is sent
 * to the platform; what the snapshot resolved — an entity already there, a
 * campaign the platform made from a builder — goes into `state.json` now,
 * because an empty plan is never applied and the tab never offers to, so
 * this is the only moment those ids would ever land. Not while an apply is
 * running: that job is the file's writer until it stops.
 */
export async function planLaunch(config: SaConfig, launchKey: string, campaign: string | null = null): Promise<Planned> {
  const folder = launchFolder(config, launchKey);
  if (campaign !== null && !campaignFolders(folder).includes(campaign)) {
    throw new RefusedError(`кампанії \`${campaign}\` немає в ${launchKey}/campaigns`);
  }
  const contents = readLaunchContents(folder);
  const read = readState(folder);
  const snapshot = await readSnapshot(client(config), contents.topic, read);
  const whole = makePlan(contents, snapshot, read);
  const state = applying.has(launchKey) ? read : adoptResolved(read, whole);
  if (state !== read) writeState(folder, state);
  return {
    folder, contents, state, campaign,
    plan: campaign === null ? whole : narrowPlan(whole, campaign),
    outline: campaignOutline(whole, campaignFolders(folder)),
  };
}

/** What `sa plan` prints and the launches tab reads: the steps with readable bodies, and where the folder stands. */
export interface PlanDescription {
  launchKey: string;
  topic: string;
  campaign: string | null;
  steps: PlanPreview['steps'];
  warnings: string[];
  errors: string[];
  resolved: PlanPreview['resolved'];
  outline: CampaignOutline[];
  state: LaunchState;
}

export function describePlan(planned: Planned): PlanDescription {
  const shown = previewPlan(planned.plan);
  return {
    launchKey: planned.contents.topic.launch_key,
    topic: planned.contents.topic.name,
    campaign: planned.campaign,
    steps: shown.steps,
    warnings: shown.warnings,
    errors: shown.errors,
    resolved: shown.resolved,
    outline: planned.outline,
    state: planned.state,
  };
}

// -------------------------------------------------------------- apply --

/** A step that cannot go on. The job stops here and says why. */
class StepError extends Error {}

/** A cancel between steps, or during a pause: not a failure, and not an error line. */
class CancelledApply extends Error {}

interface Run {
  api: PlatformClient;
  folder: string;
  job: Job;
  state: LaunchState;
  contents: LaunchContents;
  /** Ids created or resolved during this run, by folder name. */
  termgroups: Record<string, number>;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** A pause the job can be cancelled out of. */
async function pause(run: Run, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until && !run.job.cancelled) await sleep(Math.min(200, until - Date.now()));
}

const resolveTopic = (run: Run, ref: TopicRef): number => {
  if (typeof ref === 'number') return ref;
  if (run.state.topic_id === null) throw new StepError('топік ще не створено, а крок його потребує');
  return run.state.topic_id;
};

const resolveTermGroup = (run: Run, ref: TermGroupRef): number => {
  if (typeof ref === 'number') return ref;
  const id = run.termgroups[ref.termgroup] ?? run.state.termgroups[ref.termgroup];
  if (id === undefined) throw new StepError(`термгрупу \`${ref.termgroup}\` ще не створено, а крок її потребує`);
  return id;
};

const resolvePost = (run: Run, ref: PostRef): number => {
  if (typeof ref === 'number') return ref;
  const id = run.state.articles[ref.article]?.id;
  if (id === undefined) throw new StepError(`статтю \`${ref.article}\` ще не опубліковано, а крок її потребує`);
  return id;
};

const campaignState = (run: Run, campaign: string): CampaignState => run.state.campaigns[campaign] ?? emptyCampaignState();

const resolveCreative = (run: Run, ref: CreativeRef): number => {
  if (typeof ref === 'number') return ref;
  const own = campaignState(run, ref.campaign);
  if ('headline' in ref) {
    if (own.headline === null || own.headline.text !== ref.headline) throw new StepError(`headline «${ref.headline}» ще не створено, а крок його потребує`);
    return own.headline.id;
  }
  const id = own.creatives[ref.file]?.id;
  if (id === undefined) throw new StepError(`креатив \`${ref.file}\` кампанії ${ref.campaign} ще не завантажено, а крок його потребує`);
  return id;
};

/** A profile by id, with its name where some campaign's state knows it, or the one the named campaign's step made. */
const resolveTsp = (run: Run, ref: TspRef): { id: number; name: string } => {
  if (typeof ref === 'number') {
    const known = Object.values(run.state.campaigns).find(c => c.tsp?.id === ref)?.tsp;
    return { id: ref, name: known?.name ?? '' };
  }
  const tsp = campaignState(run, ref.tsp).tsp;
  if (tsp === null) throw new StepError(`TSP кампанії ${ref.tsp} ще не створено, а крок його потребує`);
  return tsp;
};

/**
 * Start applying. Refused outright when the plan has errors or there is
 * nothing to do; otherwise the job id, to be watched like an export. The ids
 * the snapshot resolved are written to the state before the first step — the
 * plan already did, this is the same write again for the run's own copy.
 */
export async function startApply(
  config: SaConfig, launchKey: string, confirmed: boolean, campaign: string | null = null,
): Promise<{ id: string | null; steps: number }> {
  if (!confirmed) throw new RefusedError('apply без явного підтвердження не виконується: sa apply <key> --confirm');
  if (applying.has(launchKey)) throw new RefusedError(`залив \`${launchKey}\` уже застосовується — дочекайтесь, поки та задача закінчиться`);
  const planned = await planLaunch(config, launchKey, campaign);
  if (planned.plan.errors.length > 0) throw new RefusedError('план має помилки:\n' + planned.plan.errors.join('\n'));
  const state = adoptResolved(planned.state, planned.plan);
  if (state !== planned.state) writeState(planned.folder, state);
  if (planned.plan.steps.length === 0) return { id: null, steps: 0 };

  const job = createJob(planned.plan.steps.length, new Map(), 'sa-apply-');
  const run: Run = { api: client(config), folder: planned.folder, job, state, contents: planned.contents, termgroups: {} };
  applying.add(launchKey);
  void runSteps(run, planned.plan.steps).finally(() => applying.delete(launchKey));
  return { id: job.id, steps: planned.plan.steps.length };
}

async function runSteps(run: Run, steps: readonly PlanStep[]): Promise<void> {
  let crashed: Error | null = null;
  try {
    for (const [index, step] of steps.entries()) {
      if (run.job.cancelled) break;
      if (index > 0) {
        // Moving from one campaign to the next is where a person takes the longer breath.
        const previous = campaignOf(steps[index - 1]!);
        const own = campaignOf(step);
        const kind = previous !== null && own !== null && previous !== own ? 'campaign' : 'step';
        await pause(run, pauseBefore(kind, DEFAULT_QUEUE));
      }
      if (run.job.cancelled) break;
      run.job.active.clear();
      run.job.active.add(step.label);
      try {
        await runStep(run, step);
        run.job.outputs.push({ name: step.label, file: '' });
      } catch (e) {
        if (!(e instanceof CancelledApply)) run.job.errors.push({ name: step.label, message: (e as Error).message });
        // A step that stopped leaves the chain where it is: the next apply
        // plans again from the state and the platform, and carries on.
        break;
      }
    }
  } catch (e) {
    crashed = e as Error;
  }
  settleJob(run.job, crashed);
}

/** Write the state as it is now, with the pending write set or cleared. */
function commit(run: Run, change: (state: LaunchState) => LaunchState): void {
  run.state = change(run.state);
  writeState(run.folder, run.state);
}

/** The same, for one campaign's state. */
function commitCampaign(run: Run, campaign: string, change: (state: CampaignState) => CampaignState): void {
  commit(run, state => ({ ...state, campaigns: { ...state.campaigns, [campaign]: change(state.campaigns[campaign] ?? emptyCampaignState()) } }));
}

/**
 * The list as it stood, written to the state before the first send — into
 * the campaign's file for a campaign step, the topic's otherwise.
 */
function notePending(run: Run, step: PlanStep, seen: number[]): void {
  const campaign = campaignOf(step);
  if (campaign !== null) {
    commitCampaign(run, campaign, own => ({ ...own, pending: { step: step.kind, key: campaign, before: seen } }));
  } else {
    const key = 'name' in step ? step.name : step.kind;
    commit(run, state => ({ ...state, pending: { step: step.kind, key, before: seen } }));
  }
}

/**
 * One write under the queue policy: send, and on an uncertain answer read
 * the list back before sending again. `find` names the entity in a fresh
 * list; `send` performs the write; `seen` is the list as it was before.
 */
async function underPolicy(
  run: Run,
  seen: readonly number[],
  send: () => Promise<Answer>,
  find: (before: readonly number[]) => Promise<number | null>,
): Promise<{ answer: Answer | null; id: number | null }> {
  const history: Attempt[] = [];
  let answer: Answer | null = null;
  let foundId: number | null = null;
  for (;;) {
    const next = nextAction(history);
    if (next.action === 'done') return { answer, id: foundId };
    if (next.action === 'stop') throw new StepError(next.reason + (answer?.status === 'error' ? ` (${answer.text})` : ''));
    if (next.action === 'send' || next.action === 'retry') {
      // The backoff, then the jitter every write gets; a cancel during either
      // means nothing more is sent — a request already in flight is let finish.
      if (next.action === 'retry') await pause(run, next.delayMs);
      await pause(run, pauseBefore('write', DEFAULT_QUEUE));
      if (run.job.cancelled) throw new CancelledApply('скасовано');
      answer = await send();
      history.push({ kind: 'write', outcome: toOutcome(answer) });
      continue;
    }
    // read-back
    try {
      foundId = await find(seen);
      history.push({ kind: 'read', outcome: { status: 'ok', found: foundId !== null } });
    } catch {
      history.push({ kind: 'read', outcome: { status: 'timeout' } });
    }
  }
}

/** A create: the list before, noted in the state, then the write under the policy. */
async function withPolicy(
  run: Run,
  step: PlanStep,
  before: () => Promise<number[]>,
  send: () => Promise<Answer>,
  find: (before: readonly number[]) => Promise<number | null>,
): Promise<{ answer: Answer | null; id: number | null; seen: number[] }> {
  const seen = await before();
  notePending(run, step, seen);
  const { answer, id } = await underPolicy(run, seen, send, find);
  return { answer, id, seen };
}

const toOutcome = (answer: Answer): Attempt['outcome'] =>
  answer.status === 'ok' ? { status: 'ok' } : answer.status === 'timeout' ? { status: 'timeout' } : { status: 'error', code: answer.code };

async function runStep(run: Run, step: PlanStep): Promise<void> {
  const { api } = run;
  switch (step.kind) {
    case 'topic.create': {
      const internal = step.body.internal_name;
      const matches = async (): Promise<number[]> =>
        (await searchTopics(api, internal)).filter(t => t.internal_name === internal).map(t => t.id);
      const { answer, id } = await withPolicy(run, step, matches, () => createTopic(api, step.body), freshIn(matches));
      const topicId = createdId(answer ?? { status: 'timeout' }, 'topic') ?? id;
      if (topicId === null) throw new StepError('платформа не повернула id топіка, і read-back його не знайшов');
      commit(run, state => ({ ...state, topic_id: topicId, pending: null }));
      return;
    }
    case 'configuration.create': {
      const topicId = resolveTopic(run, step.topic);
      const list = async (): Promise<number[]> => (await readConfigurations(api, topicId)).map(c => c.id);
      const fresh = freshIn(list);
      const { id, seen } = await withPolicy(run, step, list, () => createConfiguration(api, topicId, step.body), fresh);
      // The answer carries no id: the read-back is how it is learned even after a clean ok.
      const configurationId = id ?? await fresh(seen);
      if (configurationId === null) throw new StepError('конфігурацію створено, але read-back її не бачить');
      commit(run, state => ({ ...state, configuration_id: configurationId, pending: null }));
      return;
    }
    case 'termgroup.create': {
      const topicId = resolveTopic(run, step.topic);
      const list = async (): Promise<number[]> =>
        (await readTermGroups(api, topicId)).filter(g => g.name === step.name).map(g => g.id);
      const { answer, id } = await withPolicy(run, step, list, () => createTermGroup(api, topicId, step.body), freshIn(list));
      const groupId = createdId(answer ?? { status: 'timeout' }, 'termGroup') ?? id;
      if (groupId === null) throw new StepError('платформа не повернула id термгрупи, і read-back її не знайшов');
      run.termgroups[step.name] = groupId;
      commit(run, state => ({ ...state, termgroups: { ...state.termgroups, [step.name]: groupId }, pending: null }));
      return;
    }
    case 'termgroup.update': {
      await written(run, step, () => updateTermGroup(api, step.id, step.body));
      run.termgroups[step.name] = step.id;
      commit(run, state => ({ ...state, termgroups: { ...state.termgroups, [step.name]: step.id }, pending: null }));
      return;
    }
    case 'termgroup.weight': {
      const topicId = resolveTopic(run, step.topic);
      const weights = step.body.map(w => ({ id: resolveTermGroup(run, w.id), weight: w.weight }));
      await written(run, step, () => setTermGroupWeights(api, topicId, weights));
      commit(run, state => ({ ...state, pending: null }));
      return;
    }
    case 'article.create': {
      const topicId = resolveTopic(run, step.body.topic_ids[0]!);
      const fields = { ...step.body, topic_ids: [String(topicId)] };
      const list = async (): Promise<number[]> =>
        (await readPosts(api, topicId)).filter(p => p.title === step.body.title).map(p => p.id);
      const fresh = freshIn(list);
      const { id, seen } = await withPolicy(run, step, list, () => createPost(api, fields), fresh);
      const postId = id ?? await fresh(seen);
      if (postId === null) throw new StepError('статтю відправлено, але read-back її не бачить у топіку');
      commit(run, state => ({ ...state, articles: { ...state.articles, [step.name]: { id: postId, hash: step.hash } }, pending: null }));
      return;
    }
    case 'article.update': {
      const topicId = resolveTopic(run, step.body.topic_ids[0]!);
      const fields = { ...step.body, topic_ids: [String(topicId)] };
      await written(run, step, () => updatePost(api, step.id, fields));
      commit(run, state => ({ ...state, articles: { ...state.articles, [step.name]: { id: step.id, hash: step.hash } }, pending: null }));
      return;
    }
    case 'creatives.upload': {
      // One list before all the files and one after; each file its own
      // request under the policy, whose read-back looks for that name alone.
      const topicId = resolveTopic(run, step.body.topic_ids[0]!);
      const fields = { ...step.body, topic_ids: [String(topicId)] };
      const dir = path.join(run.folder, CAMPAIGNS_DIR, step.campaign, CREATIVES_DIR);
      const videos = async () => (await readCreatives(api, topicId)).filter(c => c.media_type === 'Video');
      const seen = (await videos()).map(c => c.id);
      notePending(run, step, seen);
      for (const file of step.files) {
        if (run.job.cancelled) throw new CancelledApply('скасовано');
        run.job.active.clear();
        run.job.active.add(`${step.label} · ${file}`);
        const bytes = fs.readFileSync(path.join(dir, file));
        await underPolicy(
          run, seen,
          () => uploadCreative(api, fields, { name: file, bytes }),
          async before => matchUploads(before, await videos(), [file]).ids[file] ?? null,
        );
      }
      const match = matchUploads(seen, await videos(), step.files);
      const hashes = new Map(run.contents.campaigns.find(c => c.name === step.campaign)?.creatives.map(c => [c.name, c.hash]) ?? []);
      commitCampaign(run, step.campaign, own => ({
        ...own,
        creatives: {
          ...own.creatives,
          ...Object.fromEntries(Object.entries(match.ids).map(([name, id]) => [name, { id, hash: hashes.get(name) ?? '' }])),
        },
        // A file the read-back did not show keeps the pending list: the next plan tells its twin by it.
        pending: match.missing.length === 0 ? null : own.pending,
      }));
      for (const name of match.ambiguous) {
        run.job.outputs.push({ name: `${step.campaign}: \`${name}\` є двічі серед нових записів — взято новіший`, file: '' });
      }
      if (match.missing.length > 0) {
        throw new StepError(`після завантаження read-back не бачить у топіку: ${match.missing.join(', ')} — повторний apply дозавантажить їх`);
      }
      return;
    }
    case 'headline.create': {
      const topicId = resolveTopic(run, step.body.topic_ids[0]!);
      const list = async (): Promise<number[]> =>
        (await readCreatives(api, topicId)).filter(c => c.media_type === 'Headline' && headlineText(c.headline) === step.text).map(c => c.id);
      const fresh = freshIn(list);
      const { id, seen } = await withPolicy(run, step, list, () => createHeadline(api, { ...step.body, topic_ids: [String(topicId)] }), fresh);
      const headlineId = id ?? await fresh(seen);
      if (headlineId === null) throw new StepError('headline відправлено, але read-back його не бачить у топіку');
      commitCampaign(run, step.campaign, own => ({ ...own, headline: { id: headlineId, text: step.text }, pending: null }));
      return;
    }
    case 'tsp.create': {
      const topicId = resolveTopic(run, step.body.topic_id);
      const userId = await topicUser(run, topicId);
      const names = new Map<number, string>();
      const alike = async (): Promise<number[]> => {
        const own = (await readTsps(api, topicId, userId)).filter(t => sameTsp(t.fields, step.fields));
        for (const t of own) names.set(t.id, t.name);
        return own.map(t => t.id);
      };
      const fresh = freshIn(alike);
      const { id, seen } = await withPolicy(run, step, alike, () => createTsp(api, { ...step.body, topic_id: topicId }), fresh);
      // The answer is a bare `success`: the read-back is where the id and the composed name come from.
      const tspId = id ?? await fresh(seen);
      if (tspId === null) throw new StepError('TSP відправлено, але read-back його не бачить серед профілів байера');
      commitCampaign(run, step.campaign, own => ({ ...own, tsp: { id: tspId, name: names.get(tspId) ?? '' }, pending: null }));
      return;
    }
    case 'tsp.update': {
      const topicId = resolveTopic(run, step.body.topic_id);
      await written(run, step, () => updateTsp(api, step.id, step.name, { ...step.body, topic_id: topicId }));
      commitCampaign(run, step.campaign, own => ({ ...own, tsp: { id: step.id, name: step.name }, pending: null }));
      return;
    }
    case 'builder.create': {
      const topicId = resolveTopic(run, step.body.topic_id);
      const postId = resolvePost(run, step.body.post_id);
      const creativeIds = step.body.creative_repo_ids.map(ref => resolveCreative(run, ref));
      const tsps = step.body.traffic_source_profile_ids.map(ref => resolveTsp(run, ref));
      // A profile no campaign's file names yet — one the topic already had — is read for the name the platform gave it.
      if (tsps.some(t => t.name === '')) {
        const list = await readTsps(api, topicId, await topicUser(run, topicId));
        for (const t of tsps) t.name = list.find(p => p.id === t.id)?.name ?? t.name;
      }
      const termGroupIds = step.body.term_group_ids.map(ref => resolveTermGroup(run, ref));
      // What this campaign shares with an earlier one — the headline, the
      // profile — goes into its own file too, so the file reads whole.
      const own = campaignState(run, step.campaign);
      const first = step.body.creative_repo_ids[0];
      const headline = own.headline ?? (typeof first === 'object' && 'headline' in first ? { id: creativeIds[0]!, text: first.headline } : null);
      const tsp = own.tsp ?? tsps[0] ?? null;
      if (headline !== own.headline || tsp !== own.tsp) commitCampaign(run, step.campaign, state => ({ ...state, headline, tsp }));
      const fields = {
        ...step.body,
        topic_id: String(topicId),
        post_id: String(postId),
        traffic_source_profile_ids: tsps.map(t => String(t.id)),
        creative_repo_ids: creativeIds.map(String),
        term_group_ids: termGroupIds.map(String),
      };
      const list = async (): Promise<number[]> =>
        (await readBuilders(api, topicId)).filter(b => b.post_id === postId && sameSet(b.creative_ids, creativeIds)).map(b => b.id);
      const { answer, id } = await withPolicy(run, step, list, () => createBuilder(api, fields), freshIn(list));
      const builderId = createdId(answer ?? { status: 'timeout' }, 'campaignBuilder') ?? id;
      if (builderId === null) throw new StepError('платформа не повернула id builder, і read-back його не знайшов');
      // The campaign itself the platform makes later, after review; the next
      // plan picks up its id and name. On a relaunch the one being replaced
      // goes into the history here, the moment it stops being current.
      commitCampaign(run, step.campaign, state => ({
        ...state,
        builder: { id: builderId, campaign_id: null, campaign_name: null },
        history: step.retires === null ? state.history : withRetired(state.history, step.retires),
        pending: null,
      }));
      return;
    }
    case 'campaign.pause': {
      await written(run, step, () => pauseCampaigns(api, step.body));
      commitCampaign(run, step.campaign, state => ({
        ...state,
        history: state.history.map(h => (h.builder.campaign_id !== null && step.body.campaign_ids.includes(h.builder.campaign_id) ? { ...h, fate: 'paused' } : h)),
        pending: null,
      }));
      return;
    }
  }
}

/** The buyer the topic belongs to, for the profile list that filters by buyer and not by topic. */
async function topicUser(run: Run, topicId: number): Promise<number> {
  const topic = await readTopic(run.api, topicId);
  return topic?.user_id ?? 0;
}

/** The read-back for a create: the list again, and the id in it that the `before` list lacked. */
const freshIn = (list: () => Promise<number[]>) =>
  async (seen: readonly number[]): Promise<number | null> => firstNew(seen, await list());

/**
 * An update under the policy. It creates nothing, so an uncertain answer is
 * simply sent again after a backoff — the read-back has nothing to find.
 */
async function written(run: Run, step: PlanStep, send: () => Promise<Answer>): Promise<void> {
  await withPolicy(run, step, async () => [], send, async () => null);
}
