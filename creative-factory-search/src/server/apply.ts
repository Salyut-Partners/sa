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
import fs from 'node:fs';
import path from 'node:path';
import { parseArticle, type ImageReader } from '../core/article.ts';
import { isFolderName, mimeFor } from '../core/batch-folder.ts';
import { parseTopicManifest, type TopicManifest } from '../core/launch.ts';
import {
  chooseTopic, emptyState, firstNew, parseKeywords, parseState, parseTermGroupOptions, plan as makePlan, previewPlan,
  type ArticleSource, type LaunchContents, type LaunchState, type Plan, type PlanStep, type Snapshot,
  type TermGroupRef, type TermGroupSource, type TopicRef,
} from '../core/plan.ts';
import { DEFAULT_QUEUE, nextAction, pauseBefore, type Attempt } from '../core/queue.ts';
import { launchFolder } from './batches.ts';
import type { SaConfig } from './config.ts';
import { createJob, settleJob, type Job } from './jobs.ts';
import { RefusedError } from './launches.ts';
import {
  createConfiguration, createdId, createPost, createTermGroup, createTopic, PlatformClient, platformState,
  readConfigurations, readCountries, readPosts, readSites, readTermGroups, readTopic, searchTopics,
  setTermGroupWeights, updatePost, updateTermGroup, type Answer,
} from './platform.ts';

const STATE_FILE = 'state.json';

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

/** Everything the folder says, or a refusal naming every problem at once. */
export function readLaunchContents(folder: string): LaunchContents {
  const errors: string[] = [];
  const manifest = parseTopicManifest(fs.readFileSync(path.join(folder, 'topic.yaml'), 'utf8'));
  if (!manifest.ok) errors.push(...manifest.errors.map(e => `topic.yaml: ${e}`));
  const termgroups = readTermGroupFolders(folder, errors);
  const articles = readArticleFolders(folder, errors);
  if (!manifest.ok || errors.length > 0) throw new RefusedError(errors.join('\n'));
  return { topic: manifest.value, termgroups, articles };
}

export function readState(folder: string): LaunchState {
  const file = path.join(folder, STATE_FILE);
  if (!fs.existsSync(file)) return emptyState();
  const parsed = parseState(fs.readFileSync(file, 'utf8'));
  if (!parsed.ok) throw new RefusedError(parsed.errors.join('; '));
  return parsed.value;
}

/** Written whole and renamed into place: a crash mid-write leaves the old file, not half of a new one. */
function writeState(folder: string, state: LaunchState): void {
  const file = path.join(folder, STATE_FILE);
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(temp, file);
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
  const [countries, sites, topics] = await Promise.all([readCountries(api), readSites(api), findTopics(api, topic, state)]);
  // The rest is filtered by the topic `plan` will settle on — the same rule, asked once in core.
  const choice = chooseTopic(topics, topic, state);
  if (choice.kind !== 'known' && choice.kind !== 'found') return { topics, configurations: [], termGroups: [], posts: [], countries, sites };
  const topicId = choice.id;
  const [configurations, termGroups, posts] = await Promise.all([
    readConfigurations(api, topicId), readTermGroups(api, topicId), readPosts(api, topicId),
  ]);
  return { topics, configurations, termGroups, posts, countries, sites };
}

// --------------------------------------------------------------- plan --

export interface Planned {
  folder: string;
  contents: LaunchContents;
  state: LaunchState;
  plan: Plan;
}

export async function planLaunch(config: SaConfig, launchKey: string): Promise<Planned> {
  const folder = launchFolder(config, launchKey);
  const contents = readLaunchContents(folder);
  const state = readState(folder);
  const snapshot = await readSnapshot(client(config), contents.topic, state);
  return { folder, contents, state, plan: makePlan(contents, snapshot, state) };
}

/** What `sa plan` prints: the steps with readable bodies, and where the folder stands. */
export function describePlan(planned: Planned): unknown {
  const shown = previewPlan(planned.plan);
  return {
    launchKey: planned.contents.topic.launch_key,
    topic: planned.contents.topic.name,
    steps: shown.steps,
    warnings: shown.warnings,
    errors: shown.errors,
    resolved: shown.resolved,
    state: planned.state,
  };
}

// -------------------------------------------------------------- apply --

/** A step that cannot go on. The job stops here and says why. */
class StepError extends Error {}

/** A cancel between steps, or during a pause: not a failure, and not an error line. */
class CancelledApply extends Error {}

/** Launch keys with an apply in flight: one writer of a state file at a time, not merely one process. */
const applying = new Set<string>();

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

/**
 * Start applying. Refused outright when the plan has errors or there is
 * nothing to do; otherwise the job id, to be watched like an export. The ids
 * the snapshot resolved are written to the state before the first step, so a
 * plan that found everything already there still leaves a complete file.
 */
export async function startApply(config: SaConfig, launchKey: string, confirmed: boolean): Promise<{ id: string | null; steps: number }> {
  if (!confirmed) throw new RefusedError('apply без явного підтвердження не виконується: sa apply <key> --confirm');
  if (applying.has(launchKey)) throw new RefusedError(`залив \`${launchKey}\` уже застосовується — дочекайтесь, поки та задача закінчиться`);
  const planned = await planLaunch(config, launchKey);
  if (planned.plan.errors.length > 0) throw new RefusedError('план має помилки:\n' + planned.plan.errors.join('\n'));
  const state = adopt(planned.state, planned.plan);
  if (state !== planned.state) writeState(planned.folder, state);
  if (planned.plan.steps.length === 0) return { id: null, steps: 0 };

  const job = createJob(planned.plan.steps.length, new Map(), 'sa-apply-');
  const run: Run = { api: client(config), folder: planned.folder, job, state, contents: planned.contents, termgroups: {} };
  applying.add(launchKey);
  void runSteps(run, planned.plan.steps).finally(() => applying.delete(launchKey));
  return { id: job.id, steps: planned.plan.steps.length };
}

/** The state with what the plan resolved from the snapshot written in. Identity kept when nothing was new. */
function adopt(state: LaunchState, plan: Plan): LaunchState {
  const next: LaunchState = {
    ...state,
    topic_id: plan.resolved.topic_id ?? state.topic_id,
    configuration_id: plan.resolved.configuration_id ?? state.configuration_id,
    termgroups: { ...state.termgroups, ...plan.resolved.termgroups },
    articles: { ...state.articles },
  };
  for (const [name, id] of Object.entries(plan.resolved.articles)) {
    if (next.articles[name]?.id !== id) next.articles[name] = { id, hash: '' };
  }
  return JSON.stringify(next) === JSON.stringify(state) ? state : next;
}

async function runSteps(run: Run, steps: readonly PlanStep[]): Promise<void> {
  let crashed: Error | null = null;
  try {
    for (const [index, step] of steps.entries()) {
      if (run.job.cancelled) break;
      if (index > 0) await pause(run, pauseBefore('step', DEFAULT_QUEUE));
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

/**
 * One step under the queue policy: send, and on an uncertain answer read
 * the list back before sending again. `find` names the entity in a fresh
 * list; `send` performs the write; `before` is the list as it was, written
 * to the state before the first send.
 */
async function withPolicy(
  run: Run,
  step: PlanStep,
  before: () => Promise<number[]>,
  send: () => Promise<Answer>,
  find: (before: readonly number[]) => Promise<number | null>,
): Promise<{ answer: Answer | null; id: number | null; seen: number[] }> {
  const key = 'name' in step ? step.name : step.kind;
  const seen = await before();
  commit(run, state => ({ ...state, pending: { step: step.kind, key, before: seen } }));
  const history: Attempt[] = [];
  let answer: Answer | null = null;
  let foundId: number | null = null;
  for (;;) {
    const next = nextAction(history);
    if (next.action === 'done') return { answer, id: foundId, seen };
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
  }
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
