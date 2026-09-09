// The plan: what the platform will be asked to do, computed from the launch
// folder and a snapshot of what the platform already holds. Pure, and the one
// place the create-or-update decisions live, so they are tested here and the
// server only carries them out.
//
// Three inputs. The folder's contents — manifests, keywords, articles already
// converted. The snapshot — the topic and everything under it, read from the
// platform just before. And the state file — the ids earlier applies wrote.
// The output is an ordered list of calls with their bodies, for a person to
// read and approve, plus the ids the snapshot resolved that the state did not
// yet know, for the server to write down.
import YAML from 'yaml';
import type { Article } from './article.ts';
import {
  planCampaigns, previewTspBody, type CampaignSnapshot, type CampaignSource, type CampaignState, type CampaignStep,
  type PostRef, type ResolvedCampaign,
} from './campaign-plan.ts';
import type { ParseResult, TopicManifest } from './launch.ts';
import { hashText } from './visual-key.ts';

// ------------------------------------------------------------- folder --

export interface TermGroupSource {
  /** The folder under `termgroups/`, which is also the group's name on the platform. */
  name: string;
  keywords: string[];
  /** From `termgroup.yaml`, or null for an equal share. */
  weight: number | null;
  country: string;
  language: string;
}

export interface ArticleSource {
  /** The folder under `articles/`. */
  name: string;
  article: Article;
}

export interface LaunchContents {
  topic: TopicManifest;
  termgroups: TermGroupSource[];
  articles: ArticleSource[];
  campaigns: CampaignSource[];
  /** What the folder reader left out and why — a campaign with no creatives yet, say. Shown as warnings. */
  notes: string[];
}

/**
 * `keywords.txt`: one key per line. Blank lines and `#` comments are skipped.
 * A key that appears twice is refused here, where the buyer can fix the
 * file, rather than by the platform after the group exists.
 */
export function parseKeywords(text: string): ParseResult<string[]> {
  const keys: string[] = [];
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const fold = line.toLowerCase();
    const first = seen.get(fold);
    if (first !== undefined) {
      duplicates.push(first);
      continue;
    }
    seen.set(fold, line);
    keys.push(line);
  }
  const errors = [...new Set(duplicates)].map(k => `ключ \`${k}\` повторюється у keywords.txt`);
  if (keys.length === 0) errors.push('keywords.txt порожній: жодного ключа');
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: keys };
}

export interface TermGroupOptions {
  weight: number | null;
  country: string;
  language: string;
}

/** The optional `termgroup.yaml` beside the keys; absent means an equal share, All, All. */
export function parseTermGroupOptions(source: string | null): ParseResult<TermGroupOptions> {
  if (source === null || source.trim() === '') return { ok: true, value: { weight: null, country: 'All', language: 'All' } };
  let data: unknown;
  try {
    data = YAML.parse(source);
  } catch (e) {
    return { ok: false, errors: ['termgroup.yaml не yaml: ' + (e as Error).message] };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, errors: ['termgroup.yaml має бути набором полів'] };
  }
  const bag = data as Record<string, unknown>;
  const errors: string[] = [];
  let weight: number | null = null;
  if (bag['weight'] !== undefined && bag['weight'] !== null) {
    const value = Number(bag['weight']);
    if (Number.isInteger(value) && value > 0 && value <= 100) weight = value;
    else errors.push('termgroup.yaml: `weight` має бути цілим числом від 1 до 100');
  }
  const text = (field: string): string => {
    const value = bag[field];
    if (value === undefined || value === null) return 'All';
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    errors.push(`termgroup.yaml: \`${field}\` має бути назвою`);
    return 'All';
  };
  const country = text('country');
  const language = text('language');
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { weight, country, language } };
}

// -------------------------------------------------------------- state --

/**
 * A write in flight: which step, which folder entry, and the ids the topic
 * already held before the request went out. Written before the send so that
 * a crash between the platform's answer and the state file leaves enough to
 * tell the new entity from its older namesakes.
 */
export interface PendingWrite {
  step: string;
  key: string;
  before: number[];
}

export interface LaunchState {
  topic_id: number | null;
  configuration_id: number | null;
  /** Folder name → term group id. */
  termgroups: Record<string, number>;
  /** Folder name → post id and the hash of what was last sent. */
  articles: Record<string, { id: number; hash: string }>;
  pending: PendingWrite | null;
  /** Campaign folder → its own `state.json`, read and written beside its manifest. */
  campaigns: Record<string, CampaignState>;
}

export const emptyState = (): LaunchState => ({
  topic_id: null, configuration_id: null, termgroups: {}, articles: {}, pending: null, campaigns: {},
});

const isBag = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asId = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

/** The topic's `state.json` read back, tolerant of fields a later version added. Campaign states are read from their own files. */
export function parseState(text: string): ParseResult<LaunchState> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: ['state.json не читається: ' + (e as Error).message] };
  }
  if (!isBag(data)) return { ok: false, errors: ['state.json має бути об\'єктом'] };
  const termgroups: Record<string, number> = {};
  if (isBag(data['termgroups'])) {
    for (const [name, id] of Object.entries(data['termgroups'])) {
      const value = asId(id);
      if (value !== null) termgroups[name] = value;
    }
  }
  const articles: LaunchState['articles'] = {};
  if (isBag(data['articles'])) {
    for (const [name, raw] of Object.entries(data['articles'])) {
      if (!isBag(raw)) continue;
      const id = asId(raw['id']);
      if (id !== null) articles[name] = { id, hash: typeof raw['hash'] === 'string' ? raw['hash'] : '' };
    }
  }
  let pending: PendingWrite | null = null;
  const raw = data['pending'];
  if (isBag(raw) && typeof raw['step'] === 'string' && typeof raw['key'] === 'string' && Array.isArray(raw['before'])) {
    pending = { step: raw['step'], key: raw['key'], before: raw['before'].map(asId).filter((v): v is number => v !== null) };
  }
  return {
    ok: true,
    value: {
      topic_id: asId(data['topic_id']),
      configuration_id: asId(data['configuration_id']),
      termgroups,
      articles,
      pending,
      campaigns: {},
    },
  };
}

// ----------------------------------------------------------- snapshot --

export interface PlatformTopic { id: number; name: string; internal_name: string; user_id: number }
export interface PlatformConfiguration { id: number; name: string; topic_id: number; country: string; traffic_source: string }
export interface PlatformTermGroup { id: number; name: string; terms: string[]; weight: number; country: string; language: string }
export interface PlatformPost {
  id: number;
  title: string;
  status: string;
  site_id: number;
  country: string[];
  language: string;
  topic_ids: number[];
}
export interface Country { name: string; code: string }
export interface Site { id: number; url: string }

/**
 * What the platform holds that this launch cares about. `topics` is the
 * read-back list — every topic whose internal_name is the manifest's, or the
 * one the state names — and the rest is filtered by that topic.
 */
export interface Snapshot extends CampaignSnapshot {
  topics: PlatformTopic[];
  configurations: PlatformConfiguration[];
  termGroups: PlatformTermGroup[];
  posts: PlatformPost[];
  sites: Site[];
}

/** `All`, a two-letter code, or a name in any case — into the name the platform stores. */
export function resolveCountry(value: string, countries: readonly Country[]): ParseResult<string> {
  const wanted = value.trim();
  if (wanted.toLowerCase() === 'all') return { ok: true, value: 'All' };
  const fold = wanted.toLowerCase();
  const found = countries.find(c => c.code.toLowerCase() === fold) ?? countries.find(c => c.name.toLowerCase() === fold);
  if (found === undefined) return { ok: false, errors: [`країни \`${wanted}\` немає в довіднику платформи (код DE або назва Germany)`] };
  return { ok: true, value: found.name };
}

// --------------------------------------------------------------- plan --

/** An id known now, or the one the topic step of this same plan will produce. */
export type TopicRef = number | { after: 'topic' };
/** A term group id known now, or the one this plan creates under that folder name. */
export type TermGroupRef = number | { termgroup: string };

export interface TermGroupBody { name: string; country: string; language: string; terms: string[] }

export interface ArticleBody {
  title: string;
  site_id: string;
  post_type: 'Monetized';
  language: string;
  topic_ids: TopicRef[];
  countries: string[];
  status: 'Publish';
  description: string;
}

export type PlanStep =
  | { kind: 'topic.create'; label: string; body: { name: string; internal_name: string } }
  | { kind: 'configuration.create'; label: string; topic: TopicRef; body: { name: string; country: string; traffic_source: string; special_categories: [] } }
  | { kind: 'termgroup.create'; label: string; name: string; topic: TopicRef; body: TermGroupBody }
  | { kind: 'termgroup.update'; label: string; name: string; id: number; body: TermGroupBody }
  | { kind: 'termgroup.weight'; label: string; topic: TopicRef; body: { id: TermGroupRef; weight: number }[] }
  | { kind: 'article.create'; label: string; name: string; hash: string; body: ArticleBody }
  | { kind: 'article.update'; label: string; name: string; id: number; hash: string; body: ArticleBody }
  | CampaignStep;

/** Ids the snapshot answered that the state did not hold — to be written down even when there is nothing to send. */
export interface Resolved {
  topic_id: number | null;
  configuration_id: number | null;
  termgroups: Record<string, number>;
  articles: Record<string, number>;
  campaigns: Record<string, ResolvedCampaign>;
}

export interface Plan {
  steps: PlanStep[];
  /** Things worth knowing that do not stop the apply. */
  warnings: string[];
  /** Things that do. An apply with errors is refused. */
  errors: string[];
  resolved: Resolved;
}

/** The hash of what an article sends, so an unchanged one is not re-sent and a changed one is. */
export const articleHash = (article: Article, topic: TopicManifest, countries: readonly string[]): string =>
  hashText(JSON.stringify([article.title, topic.site, article.language, countries, article.html]));

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Equal shares that add up to exactly 100: the remainder goes to the first
 * groups, one point each, so three groups are 34/33/33 and not 33/33/33.
 */
function equalShares(count: number): number[] {
  const base = Math.floor(100 / count);
  const extra = 100 - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * The one id in `after` that was not in `before` — the read-back's set
 * difference, which is how an entity the platform created without answering
 * an id is told from its namesakes. Null when nothing is new; the first when
 * several are, which the callers treat as ambiguity of their own.
 */
export const firstNew = (before: readonly number[], after: readonly number[]): number | null =>
  after.find(id => !before.includes(id)) ?? null;

/**
 * Among namesakes, the one a write in flight made: the one not in the list
 * taken before the send. `ambiguous` when several are new — the write went
 * out more than once — and undefined when none is.
 */
export function newcomerOf<T extends { id: number }>(twins: readonly T[], before: readonly number[]): T | 'ambiguous' | undefined {
  const fresh = twins.filter(t => !before.includes(t.id));
  if (fresh.length === 1) return fresh[0];
  return fresh.length > 1 ? 'ambiguous' : undefined;
}

/** The same, keyed on the topic state's pending write. Undefined when it is not this step's, or does not single one out. */
function newcomer<T extends { id: number }>(twins: readonly T[], state: LaunchState, step: string, key: string): T | undefined {
  const pending = state.pending;
  if (pending === null || pending.step !== step || pending.key !== key) return undefined;
  const made = newcomerOf(twins, pending.before);
  return made === 'ambiguous' ? undefined : made;
}

export type TopicChoice =
  | { kind: 'known'; id: number }
  | { kind: 'found'; id: number }
  | { kind: 'ambiguous'; ids: number[] }
  | { kind: 'none' };

/**
 * Which topic on the platform is this launch's: the state's, else the one
 * carrying the manifest's internal_name, else — among namesakes — the one the
 * interrupted create made. The server's snapshot asks the same question to
 * know what to filter by, so the rule lives here once.
 */
export function chooseTopic(topics: readonly PlatformTopic[], topic: TopicManifest, state: LaunchState): TopicChoice {
  if (state.topic_id !== null && topics.some(t => t.id === state.topic_id)) return { kind: 'known', id: state.topic_id };
  const byName = topics.filter(t => t.internal_name === topic.internal_name);
  if (byName.length === 1) return { kind: 'found', id: byName[0]!.id };
  if (byName.length > 1) {
    const made = newcomer(byName, state, 'topic.create', 'topic.create');
    return made === undefined ? { kind: 'ambiguous', ids: byName.map(t => t.id) } : { kind: 'found', id: made.id };
  }
  return { kind: 'none' };
}

export function plan(contents: LaunchContents, snapshot: Snapshot, state: LaunchState): Plan {
  const steps: PlanStep[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const resolved: Resolved = { topic_id: null, configuration_id: null, termgroups: {}, articles: {}, campaigns: {} };
  const { topic } = contents;
  warnings.push(...contents.notes);

  // -- site: every article needs it, and a placeholder is the commonest mistake.
  const siteId = Number(topic.site);
  if (!Number.isInteger(siteId) || siteId <= 0) {
    errors.push(`поле \`site\` у topic.yaml має бути id сайту з платформи, отримано \`${topic.site}\``);
  } else if (!snapshot.sites.some(s => s.id === siteId)) {
    errors.push(`сайту з id ${siteId} немає на платформі; є: ${snapshot.sites.map(s => `${s.id} (${s.url})`).join(', ') || 'жодного'}`);
  }

  // -- topic
  let topicRef: TopicRef;
  const choice = chooseTopic(snapshot.topics, topic, state);
  if (choice.kind === 'known') {
    topicRef = choice.id;
  } else if (choice.kind === 'found') {
    topicRef = choice.id;
    warnings.push(`топік \`${topic.internal_name}\` уже є на платформі (id ${topicRef}) — знайдено read-back, id буде записано в state.json`);
  } else if (choice.kind === 'ambiguous') {
    errors.push(`на платформі два топіки з internal_name \`${topic.internal_name}\` (id ${choice.ids.join(', ')}) — вкажіть topic_id у state.json руками`);
    topicRef = choice.ids[0]!;
  } else {
    if (state.topic_id !== null) warnings.push(`топіка з id ${state.topic_id} зі state.json на платформі немає — буде створено новий`);
    topicRef = { after: 'topic' };
    steps.push({
      kind: 'topic.create',
      label: `створити топік «${topic.name}» (${topic.internal_name})`,
      body: { name: topic.name, internal_name: topic.internal_name },
    });
  }
  if (typeof topicRef === 'number') resolved.topic_id = topicRef;

  // -- configuration: one per topic, no id in the answer, so the read-back is the list.
  if (typeof topicRef === 'number') {
    const configuration = (state.configuration_id === null
      ? undefined
      : snapshot.configurations.find(c => c.id === state.configuration_id)) ?? snapshot.configurations[0];
    if (configuration !== undefined) {
      resolved.configuration_id = configuration.id;
      if (state.configuration_id !== configuration.id) {
        warnings.push(`конфігурація топіка вже є (id ${configuration.id}) — id буде записано в state.json`);
      }
    } else {
      steps.push(configurationStep(topic, topicRef));
    }
  } else {
    steps.push(configurationStep(topic, topicRef));
  }

  // -- term groups
  const names = new Set<string>();
  const shares = equalShares(Math.max(1, contents.termgroups.length));
  const explicit = contents.termgroups.filter(g => g.weight !== null);
  if (explicit.length > 0 && explicit.length < contents.termgroups.length) {
    errors.push('вага задана не в усіх термгрупах: або в кожній `termgroup.yaml`, або в жодній');
  }
  const explicitSum = explicit.reduce((sum, g) => sum + (g.weight ?? 0), 0);
  if (explicit.length === contents.termgroups.length && explicit.length > 0 && explicitSum !== 100) {
    errors.push(`ваги термгруп мають давати в сумі 100, зараз ${explicitSum}`);
  }
  const weights: { id: TermGroupRef; weight: number }[] = [];
  let weightsDiffer = false;
  contents.termgroups.forEach((group, index) => {
    if (names.has(group.name)) errors.push(`термгрупа \`${group.name}\` двічі`);
    names.add(group.name);
    const country = resolveCountry(group.country, snapshot.countries);
    if (!country.ok) errors.push(`термгрупа \`${group.name}\`: ${country.errors.join('; ')}`);
    const body: TermGroupBody = {
      name: group.name,
      country: country.ok ? country.value : group.country,
      language: group.language,
      terms: group.keywords,
    };
    const wanted = group.weight ?? shares[index]!;
    const stateId = state.termgroups[group.name];
    const twins = snapshot.termGroups.filter(t => t.name === group.name);
    const existing = (stateId === undefined ? undefined : snapshot.termGroups.find(t => t.id === stateId))
      ?? (twins.length === 1 ? twins[0] : newcomer(twins, state, 'termgroup.create', group.name));
    if (existing === undefined && twins.length > 1) {
      errors.push(`у топіку кілька термгруп \`${group.name}\` (id ${twins.map(t => t.id).join(', ')}) — вкажіть id у state.json руками`);
      return;
    }
    if (existing === undefined) {
      if (stateId !== undefined) warnings.push(`термгрупи \`${group.name}\` (id ${stateId}) на платформі немає — буде створено нову`);
      steps.push({ kind: 'termgroup.create', label: `створити термгрупу «${group.name}» (${group.keywords.length} ключів)`, name: group.name, topic: topicRef, body });
      weights.push({ id: { termgroup: group.name }, weight: wanted });
      weightsDiffer = true;
      return;
    }
    resolved.termgroups[group.name] = existing.id;
    if (stateId !== existing.id) warnings.push(`термгрупа \`${group.name}\` уже є (id ${existing.id}) — id буде записано в state.json`);
    if (!sameList(existing.terms, body.terms) || existing.country !== body.country || existing.language !== body.language) {
      steps.push({ kind: 'termgroup.update', label: `оновити термгрупу «${group.name}» (${group.keywords.length} ключів)`, name: group.name, id: existing.id, body });
    }
    weights.push({ id: existing.id, weight: wanted });
    if (existing.weight !== wanted) weightsDiffer = true;
  });
  if (weightsDiffer && contents.termgroups.length > 0) {
    steps.push({
      kind: 'termgroup.weight',
      label: `виставити ваги термгруп: ${weights.map(w => w.weight).join('/')}`,
      topic: topicRef,
      body: weights,
    });
  }

  // -- articles
  const titles = new Set<string>();
  for (const { name, article } of contents.articles) {
    if (titles.has(article.title)) errors.push(`дві статті з заголовком «${article.title}» — платформа розрізняє їх лише за ним`);
    titles.add(article.title);
    const countries: string[] = [];
    for (const raw of article.countries) {
      const country = resolveCountry(raw, snapshot.countries);
      if (country.ok) countries.push(country.value);
      else errors.push(`стаття \`${name}\`: ${country.errors.join('; ')}`);
    }
    const body: ArticleBody = {
      title: article.title,
      site_id: topic.site,
      post_type: 'Monetized',
      language: article.language,
      topic_ids: [topicRef],
      countries,
      status: 'Publish',
      description: article.html,
    };
    const hash = articleHash(article, topic, countries);
    const stateEntry = state.articles[name];
    let existing = stateEntry === undefined ? undefined : snapshot.posts.find(p => p.id === stateEntry.id);
    if (existing === undefined) {
      const twins = snapshot.posts.filter(p => p.title === article.title);
      if (twins.length === 1) existing = twins[0];
      else if (twins.length > 1) {
        // The list taken before the interrupted write says which of the
        // namesakes was there already; the one it does not name is ours.
        existing = newcomer(twins, state, 'article.create', name);
        if (existing === undefined) {
          errors.push(`у топіку кілька постів «${article.title}» (id ${twins.map(p => p.id).join(', ')}) — вкажіть id у state.json руками`);
        }
      }
    }
    if (existing === undefined) {
      if (stateEntry !== undefined) warnings.push(`поста \`${name}\` (id ${stateEntry.id}) у топіку немає — буде опубліковано новий`);
      steps.push({ kind: 'article.create', label: `опублікувати статтю «${article.title}»`, name, hash, body });
      continue;
    }
    resolved.articles[name] = existing.id;
    if (stateEntry?.id !== existing.id) {
      warnings.push(`стаття «${article.title}» уже є в топіку (id ${existing.id}) — id буде записано в state.json, вміст синхронізовано`);
    }
    if (stateEntry?.id === existing.id && stateEntry.hash === hash) continue;
    steps.push({ kind: 'article.update', label: `оновити статтю «${article.title}» (id ${existing.id})`, name, id: existing.id, hash, body });
  }

  // -- campaigns: after everything they point at, with ids where known and refs to this plan's own steps otherwise.
  const termGroupRefs: Record<string, TermGroupRef> = {};
  for (const group of contents.termgroups) termGroupRefs[group.name] = resolved.termgroups[group.name] ?? { termgroup: group.name };
  const postRefs: Record<string, PostRef> = {};
  for (const { name } of contents.articles) postRefs[name] = resolved.articles[name] ?? { article: name };
  const campaigns = planCampaigns(
    { topic, topicRef, campaigns: contents.campaigns, termgroups: contents.termgroups, articles: contents.articles, termGroupRefs, postRefs },
    snapshot, state.campaigns,
  );
  steps.push(...campaigns.steps);
  warnings.push(...campaigns.warnings);
  errors.push(...campaigns.errors);
  resolved.campaigns = campaigns.resolved;

  return { steps, warnings, errors, resolved };
}

// -------------------------------------------------------- one campaign --

/** Which campaign a step belongs to; the topic-level steps belong to none. */
export const campaignOf = (step: PlanStep): string | null => ('campaign' in step ? step.campaign : null);

const CAMPAIGN_PREFIX = /^campaigns\/([^/:]+)(?:\/[^:]*)?:/;
/** The campaign a plan line is about, by the `campaigns/<name>:` prefix every campaign line carries, or null for a topic line. */
export const campaignOfLine = (line: string): string | null => CAMPAIGN_PREFIX.exec(line)?.[1] ?? null;

/** The campaigns a step's body refers to for things this same plan makes — the ones its own campaign is not. */
function leansOn(step: PlanStep): { campaign: string; kind: CampaignStep['kind'] }[] {
  if (step.kind !== 'builder.create') return [];
  const needs: { campaign: string; kind: CampaignStep['kind'] }[] = [];
  for (const ref of step.body.traffic_source_profile_ids) {
    if (typeof ref === 'object') needs.push({ campaign: ref.tsp, kind: 'tsp.create' });
  }
  for (const ref of step.body.creative_repo_ids) {
    if (typeof ref === 'object') needs.push({ campaign: ref.campaign, kind: 'headline' in ref ? 'headline.create' : 'creatives.upload' });
  }
  return needs;
}

/**
 * The plan for one campaign of the topic: every topic-level step, the
 * campaign's own, and the steps of other campaigns it leans on — a profile
 * or a headline another campaign's step makes first. Warnings and errors of
 * the other campaigns are left out, so a manifest half-written in one folder
 * does not stop the launch of another; what is resolved stays whole, being
 * facts about the platform rather than choices.
 */
export function narrowPlan(planned: Plan, campaign: string): Plan {
  const own = planned.steps.filter(s => campaignOf(s) === campaign);
  const kept = new Set<PlanStep>(planned.steps.filter(s => campaignOf(s) === null));
  const queue = [...own];
  while (queue.length > 0) {
    const step = queue.shift()!;
    if (kept.has(step)) continue;
    kept.add(step);
    for (const need of leansOn(step)) {
      for (const other of planned.steps) {
        if (campaignOf(other) === need.campaign && other.kind === need.kind && !kept.has(other)) queue.push(other);
      }
    }
  }
  const mine = (line: string): boolean => {
    const about = campaignOfLine(line);
    return about === null || about === campaign;
  };
  return {
    steps: planned.steps.filter(s => kept.has(s)),
    warnings: planned.warnings.filter(mine),
    errors: planned.errors.filter(mine),
    resolved: planned.resolved,
  };
}

export interface CampaignOutline {
  name: string;
  /** Steps of the campaign's own in the plan. */
  steps: number;
  /** Whether the plan replaces a campaign already built — or is still pausing the one it replaced. */
  relaunch: boolean;
  errors: number;
}

/** One line per campaign folder, for a tree that offers «Залити» or «Перезалити» and knows which. */
export function campaignOutline(planned: Plan, names: readonly string[]): CampaignOutline[] {
  return names.map(name => ({
    name,
    steps: planned.steps.filter(s => campaignOf(s) === name).length,
    relaunch: planned.steps.some(s => (s.kind === 'builder.create' && s.campaign === name && s.retires !== null) || (s.kind === 'campaign.pause' && s.campaign === name)),
    errors: planned.errors.filter(line => campaignOfLine(line) === name).length,
  }));
}

function configurationStep(topic: TopicManifest, topicRef: TopicRef): PlanStep {
  return {
    kind: 'configuration.create',
    label: `створити конфігурацію топіка (${topic.traffic_source}, All)`,
    topic: topicRef,
    body: { name: topic.name, country: 'All', traffic_source: topic.traffic_source, special_categories: [] },
  };
}

/** A step as shown: the same fields, with the bodies made readable. */
export type ShownStep = { kind: PlanStep['kind']; label: string } & Record<string, unknown>;

export interface PlanPreview extends Omit<Plan, 'steps'> {
  steps: ShownStep[];
}

/**
 * The plan as a person reads it: the same steps and the whole article, with
 * each inlined picture's base64 replaced by its size and the TSP's schedule
 * grid folded into a line. The words are what the buyer approves; a megabyte
 * of base64 is not something to read.
 */
export function previewPlan(planned: Plan): PlanPreview {
  const steps: ShownStep[] = planned.steps.map(step => {
    if (step.kind === 'tsp.create' || step.kind === 'tsp.update') return { ...step, body: previewTspBody(step.body) };
    if (step.kind !== 'article.create' && step.kind !== 'article.update') return step;
    const description = step.body.description.replace(
      /src="data:([^;"]+);base64,([^"]*)"/g,
      (_, mime: string, data: string) => `src="data:${mime};base64,… (${Math.round(data.length * 3 / 4 / 1024)} КБ картинки inline)"`,
    );
    return { ...step, body: { ...step.body, description } };
  });
  return { ...planned, steps };
}
