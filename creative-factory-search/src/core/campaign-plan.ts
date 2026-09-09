// The campaign half of the plan: creatives, headline, Traffic Source Profile
// and Campaign Builder for every `campaigns/<name>/` folder. Pure, like
// `plan.ts`, which calls it once the topic-level refs are settled.
//
// A campaign is create-only on the platform: nothing here ever plans an
// update to a builder. What can be updated in place — the TSP — is, and only
// while the campaign it belongs to has not been built. The ids of what the
// platform holds live in the campaign's own `state.json`, next to the hash of
// each file that went up, so a remade creative is told from an unchanged one.
//
// Once built, a campaign whose creatives changed is relaunched: a new builder
// from the same post and term group with the new creative ids, and the old
// campaign retired into the folder's history — paused, when it is live and
// already spending, and left alone otherwise, as the vault's stop rules say.
import type { CampaignManifest, TopicManifest, TspManifest } from './launch.ts';
import type { ParseResult } from './launch.ts';
import {
  newcomerOf, resolveCountry, type ArticleSource, type Country, type PendingWrite, type TermGroupRef,
  type TermGroupSource, type TopicRef,
} from './plan.ts';

// ------------------------------------------------------------- folder --

export interface CreativeSource {
  /** The file name under `creatives/`, which is what the platform stores as `original_filename`. */
  name: string;
  /** A digest of the bytes, so a file re-exported under the same name is seen as a new creative. */
  hash: string;
}

export interface CampaignSource {
  /** The folder under `campaigns/`. */
  name: string;
  manifest: CampaignManifest;
  /** `script.md`, trimmed: the `ad_script` every creative of the campaign carries. */
  script: string;
  creatives: CreativeSource[];
}

// -------------------------------------------------------------- state --

export interface BuilderRef { id: number; campaign_id: number | null; campaign_name: string | null }

/**
 * What became of a campaign this folder no longer runs. `live` is the one
 * open case — left alone because it has not spent yet, or the list did not
 * show it — and is asked about again on every plan until it settles.
 */
export type RetiredFate = 'unpublished' | 'deleted' | 'paused' | 'live';

/** An earlier campaign of the folder: what it was built from, and how it ended. */
export interface RetiredCampaign {
  builder: BuilderRef;
  creatives: Record<string, { id: number; hash: string }>;
  fate: RetiredFate;
}

export interface CampaignState {
  /** File name → creative repo id and the hash of the file that was sent. */
  creatives: Record<string, { id: number; hash: string }>;
  headline: { id: number; text: string } | null;
  /** The profile's id and the name the platform composed for it. */
  tsp: { id: number; name: string } | null;
  /** The builder's id, and the campaign it produced once the platform has made it. */
  builder: BuilderRef | null;
  pending: PendingWrite | null;
  /** Every campaign the folder ran before the current one, oldest first. */
  history: RetiredCampaign[];
}

export const emptyCampaignState = (): CampaignState => ({ creatives: {}, headline: null, tsp: null, builder: null, pending: null, history: [] });

const FATES: readonly RetiredFate[] = ['unpublished', 'deleted', 'paused', 'live'];

const isBag = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asId = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);
const asText = (v: unknown): string => (typeof v === 'string' ? v : '');

const creativesOf = (raw: unknown): CampaignState['creatives'] => {
  const creatives: CampaignState['creatives'] = {};
  if (!isBag(raw)) return creatives;
  for (const [name, entry] of Object.entries(raw)) {
    if (!isBag(entry)) continue;
    const id = asId(entry['id']);
    if (id !== null) creatives[name] = { id, hash: asText(entry['hash']) };
  }
  return creatives;
};

const builderOf = (raw: unknown): BuilderRef | null => {
  if (!isBag(raw) || asId(raw['id']) === null) return null;
  return { id: asId(raw['id'])!, campaign_id: asId(raw['campaign_id']), campaign_name: typeof raw['campaign_name'] === 'string' ? raw['campaign_name'] : null };
};

/** A campaign's `state.json` read back, tolerant of fields a later version added. */
export function parseCampaignState(text: string): ParseResult<CampaignState> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: ['state.json не читається: ' + (e as Error).message] };
  }
  if (!isBag(data)) return { ok: false, errors: ['state.json має бути об\'єктом'] };
  const state = emptyCampaignState();
  state.creatives = creativesOf(data['creatives']);
  const headline = data['headline'];
  if (isBag(headline) && asId(headline['id']) !== null) state.headline = { id: asId(headline['id'])!, text: asText(headline['text']) };
  const tsp = data['tsp'];
  if (isBag(tsp) && asId(tsp['id']) !== null) state.tsp = { id: asId(tsp['id'])!, name: asText(tsp['name']) };
  state.builder = builderOf(data['builder']);
  if (Array.isArray(data['history'])) {
    for (const raw of data['history']) {
      if (!isBag(raw)) continue;
      const builder = builderOf(raw['builder']);
      const fate = FATES.find(f => f === raw['fate']);
      if (builder !== null && fate !== undefined) state.history.push({ builder, creatives: creativesOf(raw['creatives']), fate });
    }
  }
  const pending = data['pending'];
  if (isBag(pending) && typeof pending['step'] === 'string' && typeof pending['key'] === 'string' && Array.isArray(pending['before'])) {
    state.pending = { step: pending['step'], key: pending['key'], before: pending['before'].map(asId).filter((v): v is number => v !== null) };
  }
  return { ok: true, value: state };
}

// ----------------------------------------------------------- snapshot --

export interface PlatformCreative {
  id: number;
  /** `Video` or `Headline`. */
  media_type: string;
  original_filename: string | null;
  /** The headline's HTML, for a `Headline` entry. */
  headline: string | null;
  status: string;
  ad_script: string | null;
}

/** What a buyer sets on a profile, normalised, so two profiles can be compared. */
export interface TspFields {
  budget: number;
  bid: number;
  location: string[];
  language: string;
  gender: string;
  age: string[];
  devices: string[];
  os: string[];
  launch_tomorrow: boolean;
  end_date: string | null;
  /** Whether any day of the week is ticked in the schedule; a row of unticked days is no schedule. */
  scheduled: boolean;
}

export interface PlatformTsp {
  id: number;
  /** Composed by the platform: `AIaviaDEhr-tk-DE-db-20`. */
  name: string;
  topic_id: number;
  fields: TspFields;
}

export interface PlatformBuilder {
  id: number;
  topic_id: number;
  post_id: number;
  pixel_id: number;
  status: string;
  /** Every creative repo entry it was built with, headline included. */
  creative_ids: number[];
  /** The campaigns the platform made from it — empty until it has. */
  campaigns: { id: number; name: string; term_group_id: number | null }[];
}

/**
 * A campaign as the platform's campaign list shows it: the status the buyer
 * can change, whether the source has it (`campaign_id` is null until then),
 * and what the analytics window holds. The list carries no spend, so `spend`
 * is null unless the platform starts sending one; revenue is the other sign
 * that the first cent has landed.
 */
export interface PlatformCampaign {
  id: number;
  name: string;
  /** `ACTIVE`, `PAUSED`, `PENDING`, `DELETED` as the list spells them. */
  status: string;
  published: boolean;
  revenue: number;
  spend: number | null;
}

/** `ad_account_id` is the TikTok account the pixel was made under — routinely not the cabinet it is launched from, so it is shown, not checked. */
export interface Pixel { id: number; name: string; ad_account_id: string }
export interface AdAccount { id: number; name: string; account_id: string }
export interface Theme { id: number; key: string; title: string }

/** The part of the platform snapshot the campaign steps read. */
export interface CampaignSnapshot {
  countries: Country[];
  creatives: PlatformCreative[];
  tsps: PlatformTsp[];
  builders: PlatformBuilder[];
  /** The campaigns the topic's builders made, as far as the campaign list showed them. */
  campaigns: PlatformCampaign[];
  pixels: Pixel[];
  adAccounts: AdAccount[];
  themes: Theme[];
  rsocCounts: number[];
  /** Language names as the platform lists them. */
  languages: string[];
}

// --------------------------------------------------------------- refs --

export type PostRef = number | { article: string };
/** A creative id known now, or the one this plan uploads for that campaign and file — or the headline it makes. */
export type CreativeRef = number | { campaign: string; file: string } | { campaign: string; headline: string };
/** A profile id known now, or the one this plan creates for that campaign. */
export type TspRef = number | { tsp: string };

// -------------------------------------------------------------- steps --

export interface UploadBody {
  grade: 'New';
  language: string;
  ad_script: string;
  media_type: 'Video';
  traffic_sources: string[];
  topic_ids: TopicRef[];
  countries: string[];
}

export interface HeadlineBody {
  grade: 'Strong';
  countries: string[];
  headlines: string[];
  primary_texts: string[];
  descriptions: string[];
  language: string;
  source: string;
  topic_ids: TopicRef[];
}

export interface TspBody {
  topic_id: TopicRef;
  traffic_source: string;
  cbo: 0;
  acb_budget_type: '';
  acb_schedule: 0;
  budget_type: 'Daily Budget';
  schedule: never[];
  schedule_time_zone: '';
  lunch_tomorrow: 0 | 1;
  end_date: 0 | string;
  quantity: 1;
  budget: number;
  age_from: string[];
  gender: string;
  location: string[];
  language: string;
  device_os: string[] | null;
  bid: string;
  schedule_cells: boolean[][];
  devices: string[];
}

export interface BuilderBody {
  topic_id: TopicRef;
  country: string;
  site_id: string;
  post_id: PostRef;
  language: string;
  monetization_type: 'RSOC';
  rsoc_count: string;
  conversion_event_type: 'Purchase';
  pixel_id: string;
  traffic_source: string;
  traffic_source_profile_ids: TspRef[];
  creative_repo_ids: CreativeRef[];
  term_group_ids: TermGroupRef[];
  ad_account_ids: string[];
  use_ad_title_as_referrer_ad_text: '0';
  use_keyword_rotation: '0' | '1';
  themes: string[];
}

/** The pause as the admin's bulk update sends it: campaign ids, never builder ids. */
export interface PauseBody { status: 'PAUSED'; campaign_ids: number[] }

export type CampaignStep =
  | { kind: 'creatives.upload'; label: string; campaign: string; files: string[]; body: UploadBody }
  | { kind: 'headline.create'; label: string; campaign: string; text: string; body: HeadlineBody }
  | { kind: 'tsp.create'; label: string; campaign: string; fields: TspFields; body: TspBody }
  | { kind: 'tsp.update'; label: string; campaign: string; id: number; name: string; body: TspBody }
  | {
    kind: 'builder.create'; label: string; campaign: string; from: { account: string; pixel: string; theme: string }; body: BuilderBody;
    /** The campaign this one replaces, for the state's history — null for a first build. */
    retires: RetiredCampaign | null;
  }
  | { kind: 'campaign.pause'; label: string; campaign: string; body: PauseBody };

/** Ids the snapshot answered for a campaign that its state did not hold. Same shape as the state, minus `pending`. */
export type ResolvedCampaign = Omit<CampaignState, 'pending'>;

export interface CampaignPlan {
  steps: CampaignStep[];
  warnings: string[];
  errors: string[];
  resolved: Record<string, ResolvedCampaign>;
}

// ----------------------------------------------------------- headline --

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', szlig: 'ß' };

/** The words of a headline as stored — markup off, entities decoded, whitespace folded — so two spellings of one headline compare equal. */
export function headlineText(html: string | null): string {
  if (html === null) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The headline as the admin's editor sends it: one bold paragraph. */
export const headlineHtml = (text: string): string => `<p><strong>${escapeHtml(text.trim())}</strong></p>`;

// ---------------------------------------------------------------- TSP --

export const AGE_BANDS = ['13-17', '18-24', '25-34', '35-44', '45-54', '55+'] as const;
export const GENDERS = ['All', 'Male', 'Female'] as const;

const sortedList = (list: readonly string[]): string[] => [...list].map(s => s.trim()).sort();
const allOnly = (list: readonly string[]): string[] => (list.some(v => v.toLowerCase() === 'all') ? ['All'] : sortedList(list));

/** The manifest's TSP block as comparable fields, with the country and language already resolved. */
export function tspFieldsOf(tsp: TspManifest, location: string, language: string): TspFields {
  return {
    budget: tsp.budget,
    bid: tsp.bid,
    location: [location],
    language,
    gender: tsp.gender,
    age: allOnly(tsp.age),
    devices: allOnly(tsp.devices),
    os: tsp.os.some(v => v.toLowerCase() === 'all') ? [] : sortedList(tsp.os),
    launch_tomorrow: tsp.launch_tomorrow,
    end_date: tsp.end_date,
    scheduled: tsp.schedule.length > 0,
  };
}

const canon = (f: TspFields): string => JSON.stringify({
  ...f, location: sortedList(f.location), age: sortedList(f.age), devices: sortedList(f.devices), os: sortedList(f.os),
});

export const sameTsp = (a: TspFields, b: TspFields): boolean => canon(a) === canon(b);

/** The grid the admin sends beside an empty schedule: nine rows of twenty-four, none ticked. */
const emptyScheduleCells = (): boolean[][] => Array.from({ length: 9 }, () => Array.from({ length: 24 }, () => false));

function tspBody(topic: TopicManifest, topicRef: TopicRef, fields: TspFields): TspBody {
  return {
    topic_id: topicRef,
    traffic_source: topic.traffic_source,
    cbo: 0,
    acb_budget_type: '',
    acb_schedule: 0,
    budget_type: 'Daily Budget',
    schedule: [],
    schedule_time_zone: '',
    lunch_tomorrow: fields.launch_tomorrow ? 1 : 0,
    end_date: fields.end_date ?? 0,
    quantity: 1,
    budget: fields.budget,
    age_from: fields.age,
    gender: fields.gender,
    location: fields.location,
    language: fields.language,
    device_os: fields.os.length === 0 ? null : fields.os,
    bid: String(fields.bid),
    schedule_cells: emptyScheduleCells(),
    devices: fields.devices,
  };
}

// ---------------------------------------------------------- read-back --

export interface UploadMatch {
  ids: Record<string, number>;
  /** Names that more than one new entry carried — the newest was taken. */
  ambiguous: string[];
  /** Names no new entry carried. */
  missing: string[];
}

/**
 * Which new entry is which file: the entries the list holds now that it did
 * not hold before the uploads, paired with the expected names by
 * `original_filename`. Two new entries under one name — a retry the platform
 * took twice — are both ours, so the newest is taken and the name reported.
 */
export function matchUploads(before: readonly number[], after: readonly PlatformCreative[], names: readonly string[]): UploadMatch {
  const fresh = after.filter(c => c.media_type === 'Video' && !before.includes(c.id));
  const match: UploadMatch = { ids: {}, ambiguous: [], missing: [] };
  for (const name of names) {
    const own = fresh.filter(c => c.original_filename === name).map(c => c.id);
    if (own.length === 0) match.missing.push(name);
    else {
      if (own.length > 1) match.ambiguous.push(name);
      match.ids[name] = Math.max(...own);
    }
  }
  return match;
}

// ------------------------------------------------------------ relaunch --

export interface Verdict {
  fate: RetiredFate;
  /** Whether a pause is to be sent now. */
  pause: boolean;
  /** Why, for the plan's reader. */
  note: string;
}

/**
 * What to do about a campaign the folder no longer runs, from what the
 * platform shows of it. Three cases the PRD names — rejected before it was
 * published, taken down by the provider, live — and the vault's rule inside
 * the third: a status is only changed once the campaign is in the analytics,
 * which is when its first cent has been spent. Until then the platform would
 * stop tracking it, so it is left alone and the buyer told.
 */
export function judgeRetired(builder: PlatformBuilder | undefined, campaigns: readonly PlatformCampaign[]): Verdict {
  if (builder === undefined) return { fate: 'deleted', pause: false, note: 'builder на платформі вже немає — паузити нема чого' };
  const made = builder.campaigns[0];
  if (made === undefined) return { fate: 'unpublished', pause: false, note: 'кампанію не опубліковано (реджект до публікації) — паузити нема чого' };
  const record = campaigns.find(c => c.id === made.id);
  const who = `кампанію ${made.id} «${made.name}»`;
  if (record === undefined) {
    return { fate: 'live', pause: false, note: `${who} не знайдено в списку кампаній платформи — статус не чіпаю; перевірте її руками` };
  }
  const status = record.status.toUpperCase();
  if (status === 'DELETED') return { fate: 'deleted', pause: false, note: `${who} провайдер уже зняв` };
  if (status === 'PAUSED') return { fate: 'paused', pause: false, note: `${who} вже на паузі` };
  if (!record.published || status === 'PENDING') return { fate: 'unpublished', pause: false, note: `${who} ще не опубліковано (${record.status}) — паузити нема чого` };
  if (status !== 'ACTIVE') return { fate: 'unpublished', pause: false, note: `${who} має статус ${record.status} — не жива, паузити нема чого` };
  if ((record.spend ?? 0) > 0 || record.revenue > 0) return { fate: 'live', pause: true, note: `${who} жива й уже в аналітиці — буде поставлена на паузу` };
  return {
    fate: 'live', pause: false,
    note: `${who} жива, але ще не в аналітиці (спенду немає) — статус не чіпаю, інакше платформа перестане її трекати; за потреби зупиніть групу руками або опустіть бід у мінімум`,
  };
}

/** The history with one record put in — replacing the entry for the same builder, so a plan run twice does not list it twice. */
export const withRetired = (history: readonly RetiredCampaign[], record: RetiredCampaign): RetiredCampaign[] =>
  history.some(h => h.builder.id === record.builder.id)
    ? history.map(h => (h.builder.id === record.builder.id ? record : h))
    : [...history, record];

const builderRef = (builder: PlatformBuilder): BuilderRef => {
  const made = builder.campaigns[0];
  return { id: builder.id, campaign_id: made?.id ?? null, campaign_name: made?.name ?? null };
};

/** The pause step for a retired campaign, when its verdict asks for one. */
const pauseStep = (campaign: string, record: RetiredCampaign): CampaignStep => ({
  kind: 'campaign.pause',
  label: `${campaign}: поставити на паузу стару кампанію ${record.builder.campaign_id} «${record.builder.campaign_name ?? ''}»`,
  campaign,
  body: { status: 'PAUSED', campaign_ids: [record.builder.campaign_id!] },
});

// --------------------------------------------------------------- plan --

export interface CampaignPlanInput {
  topic: TopicManifest;
  topicRef: TopicRef;
  campaigns: CampaignSource[];
  termgroups: TermGroupSource[];
  articles: ArticleSource[];
  /** Folder name → id or the ref this plan's own step produces. */
  termGroupRefs: Record<string, TermGroupRef>;
  postRefs: Record<string, PostRef>;
}

const findTheme = (themes: readonly Theme[], wanted: string): Theme | undefined => {
  const fold = wanted.trim().toLowerCase();
  return themes.find(t => String(t.id) === fold) ?? themes.find(t => t.key.toLowerCase() === fold) ?? themes.find(t => t.title.toLowerCase() === fold);
};

const findLanguage = (languages: readonly string[], wanted: string): string | undefined => {
  const fold = wanted.trim().toLowerCase();
  if (fold === 'all') return 'All';
  return languages.find(l => l.toLowerCase() === fold);
};

export const sameSet = (a: readonly number[], b: readonly number[]): boolean => {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/** Among twins, the one the campaign's interrupted write of this kind made — or the newest of several, which a retry the platform took twice leaves. */
function madeBy<T extends { id: number }>(state: CampaignState, step: CampaignStep['kind'], campaign: string, twins: readonly T[]): T | undefined {
  const pending = state.pending;
  if (pending === null || pending.step !== step || pending.key !== campaign) return undefined;
  const made = newcomerOf(twins, pending.before);
  if (made !== 'ambiguous') return made;
  return twins.filter(t => !pending.before.includes(t.id)).reduce((newest, t) => (t.id > newest.id ? t : newest));
}

export function planCampaigns(input: CampaignPlanInput, snapshot: CampaignSnapshot, states: Record<string, CampaignState>): CampaignPlan {
  const steps: CampaignStep[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const resolved: Record<string, ResolvedCampaign> = {};
  const { topic, topicRef } = input;

  // -- one name, one file, across the whole plan: the read-back pairs by name.
  const owners = new Map<string, string>();
  for (const c of input.campaigns) {
    for (const file of c.creatives) {
      const owner = owners.get(file.name);
      if (owner !== undefined && owner !== c.name) {
        errors.push(`файл \`${file.name}\` є і в campaigns/${owner}, і в campaigns/${c.name} — платформа зіставляє за ім'ям, перейменуйте один`);
      }
      owners.set(file.name, c.name);
    }
  }

  const videos = snapshot.creatives.filter(c => c.media_type === 'Video');
  const headlines = snapshot.creatives.filter(c => c.media_type === 'Headline');
  /** Headline text → the campaign whose step in this plan makes it. */
  const headlineMakers = new Map<string, string>();
  /** The campaigns whose `tsp.create` is in this plan, with the fields, for the ones after them to share. */
  const tspMakers: { campaign: string; fields: TspFields }[] = [];

  for (const c of input.campaigns) {
    const state = states[c.name] ?? emptyCampaignState();
    const own: string[] = [];
    const at = `campaigns/${c.name}`;
    const m = c.manifest;

    // -- what the manifest points at
    const account = topic.accounts[m.account];
    if (account === undefined) own.push(`кабінету \`${m.account}\` немає в topic.yaml; є: ${Object.keys(topic.accounts).join(', ')}`);
    const adAccount = account === undefined ? undefined : snapshot.adAccounts.find(a => String(a.id) === account.ad_account);
    if (account !== undefined && adAccount === undefined) {
      own.push(`кабінет \`${m.account}\`: ad_account ${account.ad_account} немає серед кабінетів платформи для цього сайту й джерела; є: ${snapshot.adAccounts.map(a => `${a.id} (${a.name})`).join(', ') || 'жодного'}`);
    }
    const pixel = account === undefined ? undefined : snapshot.pixels.find(p => String(p.id) === account.pixel);
    if (account !== undefined && pixel === undefined) {
      own.push(`кабінет \`${m.account}\`: пікселя ${account.pixel} немає на платформі; є: ${snapshot.pixels.map(p => `${p.id} (${p.name})`).join(', ') || 'жодного'}`);
    }
    const theme = findTheme(snapshot.themes, m.theme);
    if (theme === undefined) own.push(`теми \`${m.theme}\` немає на платформі; є: ${snapshot.themes.map(t => `${t.id} (${t.key}, ${t.title})`).join(', ')}`);
    if (!snapshot.rsocCounts.includes(m.rsoc_count)) own.push(`rsoc_count ${m.rsoc_count} платформа не приймає; можна: ${snapshot.rsocCounts.join(', ')}`);
    const country = resolveCountry(m.country, snapshot.countries);
    if (!country.ok) own.push(...country.errors);
    const countryName = country.ok ? country.value : m.country;
    const language = findLanguage(snapshot.languages, m.tsp.language);
    if (language === undefined) own.push(`tsp: мови \`${m.tsp.language}\` немає в довіднику платформи`);
    for (const band of m.tsp.age) {
      if (band.toLowerCase() !== 'all' && !(AGE_BANDS as readonly string[]).includes(band)) own.push(`tsp: вікової групи \`${band}\` немає; є: All, ${AGE_BANDS.join(', ')}`);
    }
    const gender = GENDERS.find(g => g.toLowerCase() === m.tsp.gender.toLowerCase());
    if (gender === undefined) own.push(`tsp: стать \`${m.tsp.gender}\` — має бути одна з ${GENDERS.join(', ')}`);
    if (m.tsp.schedule.length > 0) own.push('tsp: розклад по годинах поки не підтримується — форма запиту не знята з дампів; приберіть `schedule`');
    if (m.tsp.end_date !== null) warnings.push(`${at}: формат end_date у запиті TSP не звірений з дампами — перевірте профіль на платформі після apply`);
    const termGroupRef = input.termGroupRefs[m.termgroup];
    if (termGroupRef === undefined) own.push(`термгрупи \`${m.termgroup}\` немає в termgroups/; є: ${input.termgroups.map(g => g.name).join(', ') || 'жодної'}`);
    const postRef = input.postRefs[m.article];
    if (postRef === undefined) own.push(`статті \`${m.article}\` немає в articles/; є: ${input.articles.map(a => a.name).join(', ') || 'жодної'}`);
    const script = c.script.trim();
    if (script === '') own.push('script.md порожній — ad_script кожного креативу це скрипт кампанії');
    if (c.creatives.length === 0) own.push('у creatives/ немає жодного mp4 — кампанію нема з чого збирати');
    const headline = m.headline.trim();
    if (headline === '') own.push('headline порожній');

    if (own.length > 0) {
      errors.push(...own.map(e => `${at}: ${e}`));
      continue;
    }

    const result: ResolvedCampaign = { creatives: {}, headline: null, tsp: null, builder: null, history: state.history };
    resolved[c.name] = result;
    const built = state.builder !== null && snapshot.builders.some(b => b.id === state.builder!.id);
    const creativeRefs: CreativeRef[] = [];
    const ownIds: number[] = [];
    let everyIdKnown = true;

    // -- creatives: adopt what the list already shows under the name, upload the rest.
    const toUpload: string[] = [];
    for (const file of c.creatives) {
      const twins = videos.filter(v => v.original_filename === file.name);
      const known = state.creatives[file.name];
      const made = madeBy(state, 'creatives.upload', c.name, twins);
      let id: number | null = null;
      if (made !== undefined) {
        id = made.id;
        if (twins.filter(t => t.id !== made.id && !state.pending!.before.includes(t.id)).length > 0) {
          warnings.push(`${at}: обірване завантаження лишило кілька нових \`${file.name}\` — взято новіший (id ${id}), решта лишаються в репозиторії`);
        }
      } else if (known !== undefined && videos.some(v => v.id === known.id)) {
        // A changed hash is a remade creative: uploaded again whether or not
        // the campaign is built — after a build, that is the relaunch.
        if (known.hash === file.hash) id = known.id;
      } else if (known !== undefined) {
        warnings.push(`${at}: креативу \`${file.name}\` (id ${known.id}) у топіку немає — буде завантажено знову`);
      } else if (twins.length === 1) {
        id = twins[0]!.id;
        warnings.push(`${at}: \`${file.name}\` уже є в репозиторії топіка (id ${id}) — id буде записано в state.json`);
      } else if (twins.length > 1) {
        errors.push(`${at}: у топіку кілька креативів \`${file.name}\` (id ${twins.map(t => t.id).join(', ')}) — вкажіть id у state.json руками`);
        continue;
      }
      if (id !== null) {
        result.creatives[file.name] = { id, hash: file.hash };
        creativeRefs.push(id);
        ownIds.push(id);
      } else {
        toUpload.push(file.name);
        creativeRefs.push({ campaign: c.name, file: file.name });
        everyIdKnown = false;
      }
    }
    if (toUpload.length > 0) {
      steps.push({
        kind: 'creatives.upload',
        label: `${c.name}: завантажити ${toUpload.length} креативів у репозиторій топіка`,
        campaign: c.name,
        files: toUpload,
        body: {
          grade: 'New', language: 'All', ad_script: script, media_type: 'Video',
          traffic_sources: [topic.traffic_source], topic_ids: [topicRef], countries: [countryName],
        },
      });
    }

    // -- headline: one per text per topic; matched by its words.
    const sameText = headlines.filter(h => headlineText(h.headline) === headline);
    let headlineRef: CreativeRef;
    const madeHeadline = madeBy(state, 'headline.create', c.name, sameText);
    const knownHeadline = state.headline !== null && state.headline.text === headline ? headlines.find(h => h.id === state.headline!.id) : undefined;
    if (madeHeadline !== undefined) {
      headlineRef = madeHeadline.id;
    } else if (knownHeadline !== undefined) {
      headlineRef = knownHeadline.id;
    } else if (sameText.length > 0) {
      headlineRef = sameText[0]!.id;
      warnings.push(`${at}: headline «${headline}» уже є в топіку (id ${headlineRef}) — id буде записано в state.json`);
    } else if (headlineMakers.has(headline)) {
      headlineRef = { campaign: headlineMakers.get(headline)!, headline };
      everyIdKnown = false;
    } else {
      headlineMakers.set(headline, c.name);
      headlineRef = { campaign: c.name, headline };
      everyIdKnown = false;
      steps.push({
        kind: 'headline.create',
        label: `${c.name}: створити headline «${headline}»`,
        campaign: c.name,
        text: headline,
        body: {
          grade: 'Strong', countries: [countryName], headlines: [headlineHtml(headline)], primary_texts: [''], descriptions: [''],
          language: 'All', source: topic.traffic_source, topic_ids: [topicRef],
        },
      });
    }
    if (typeof headlineRef === 'number') {
      result.headline = { id: headlineRef, text: headline };
      ownIds.push(headlineRef);
    }

    // -- TSP: shared by every campaign of the topic with the same fields; updated in place until the campaign is built.
    const fields = tspFieldsOf({ ...m.tsp, gender: gender! }, countryName, language!);
    const body = tspBody(topic, topicRef, fields);
    let tspRef: TspRef;
    let knownTsp = state.tsp === null ? undefined : snapshot.tsps.find(t => t.id === state.tsp!.id);
    const alike = snapshot.tsps.filter(t => sameTsp(t.fields, fields));
    const madeTsp = madeBy(state, 'tsp.create', c.name, alike);
    // A profile another campaign of this folder also points at is theirs as
    // much as ours: changed fields mean a profile of our own, not a PUT that
    // pulls the ground from under what they will be built with.
    const sharedWith = knownTsp === undefined ? [] : Object.entries(states).filter(([name, own]) => name !== c.name && own.tsp?.id === knownTsp!.id).map(([name]) => name);
    if (knownTsp !== undefined && !sameTsp(knownTsp.fields, fields) && sharedWith.length > 0 && !built) {
      warnings.push(`${at}: TSP «${knownTsp.name}» (id ${knownTsp.id}) ділять ще ${sharedWith.join(', ')} — зміни полів дадуть цій кампанії власний профіль`);
      knownTsp = undefined;
    }
    if (knownTsp !== undefined) {
      tspRef = knownTsp.id;
      result.tsp = { id: knownTsp.id, name: knownTsp.name };
      if (!sameTsp(knownTsp.fields, fields)) {
        if (built) warnings.push(`${at}: TSP у campaign.yaml змінився, але кампанію вже зібрано — жива кампанія тримає свої значення, профіль не чіпаю`);
        else steps.push({ kind: 'tsp.update', label: `${c.name}: оновити TSP «${knownTsp.name}» (id ${knownTsp.id})`, campaign: c.name, id: knownTsp.id, name: knownTsp.name, body });
      }
    } else if (madeTsp !== undefined) {
      tspRef = madeTsp.id;
      result.tsp = { id: madeTsp.id, name: madeTsp.name };
    } else if (alike.length > 0) {
      const first = alike[0]!;
      tspRef = first.id;
      result.tsp = { id: first.id, name: first.name };
      warnings.push(`${at}: TSP з такими самими полями вже є в топіку («${first.name}», id ${first.id}) — його й буде використано`);
    } else {
      const maker = tspMakers.find(t => sameTsp(t.fields, fields));
      if (maker !== undefined) {
        tspRef = { tsp: maker.campaign };
      } else {
        tspMakers.push({ campaign: c.name, fields });
        tspRef = { tsp: c.name };
        steps.push({
          kind: 'tsp.create',
          label: `${c.name}: створити TSP (${countryName}, бюджет ${fields.budget}, бід ${fields.bid})`,
          campaign: c.name,
          fields,
          body,
        });
      }
    }

    // -- builder: found by what it was built from, else made. The one the
    // state names is current only while its creative set is the folder's;
    // otherwise it is the campaign being replaced.
    const knownBuilder = state.builder === null ? undefined : snapshot.builders.find(b => b.id === state.builder!.id);
    const current = knownBuilder !== undefined && everyIdKnown && sameSet(knownBuilder.creative_ids, ownIds) ? knownBuilder : undefined;
    const postId = typeof postRef === 'number' ? postRef : null;
    const twins = everyIdKnown && postId !== null
      ? snapshot.builders.filter(b => b.post_id === postId && sameSet(b.creative_ids, ownIds))
      : [];
    const madeBuilder = madeBy(state, 'builder.create', c.name, twins);
    const found = current ?? madeBuilder ?? (twins.length === 1 ? twins[0] : undefined);

    // -- the campaigns this folder no longer runs: the earlier ones, asked about again while open, and the one retiring now.
    const pauses: CampaignStep[] = [];
    let history = state.history;
    for (const earlier of state.history) {
      // The current builder can already be in the history: an apply that
      // wrote what the plan resolved and then stopped before building the new
      // one. It is judged once, below, as the one retiring.
      if (earlier.fate !== 'live' || earlier.builder.id === state.builder?.id) continue;
      const verdict = judgeRetired(snapshot.builders.find(b => b.id === earlier.builder.id), snapshot.campaigns);
      const record = { ...earlier, fate: verdict.fate };
      history = withRetired(history, record);
      if (verdict.pause) pauses.push(pauseStep(c.name, record));
      else if (verdict.fate === 'live') warnings.push(`${at}: ${verdict.note}`);
    }
    let retires: RetiredCampaign | null = null;
    if (knownBuilder !== undefined && knownBuilder.id !== found?.id) {
      const verdict = judgeRetired(knownBuilder, snapshot.campaigns);
      const kept = Object.fromEntries(Object.entries(state.creatives).filter(([, entry]) => knownBuilder.creative_ids.includes(entry.id)));
      retires = { builder: builderRef(knownBuilder), creatives: kept, fate: verdict.fate };
      history = withRetired(history, retires);
      warnings.push(`${at}: перезалив — креативи змінились після збірки кампанії ${knownBuilder.id}; нова кампанія це нове посилання, ключі Google стануть на неї від 30 хвилин до доби. Стара: ${verdict.note}`);
      if (verdict.pause) pauses.push(pauseStep(c.name, retires));
    }
    result.history = history;

    if (found !== undefined) {
      const made = found.campaigns[0];
      result.builder = { id: found.id, campaign_id: made?.id ?? null, campaign_name: made?.name ?? null };
      if (current === undefined) warnings.push(`${at}: кампанію з цих креативів і статті вже зібрано (builder ${found.id}) — id буде записано в state.json`);
      else if (state.builder!.campaign_id === null && made !== undefined) warnings.push(`${at}: платформа зробила кампанію ${made.id} «${made.name}» — id буде записано в state.json`);
      if (state.builder !== null && knownBuilder === undefined) warnings.push(`${at}: builder ${state.builder.id} зі state.json на платформі не знайдено — знайдено ${found.id}`);
      steps.push(...pauses);
      continue;
    }
    if (twins.length > 1) {
      errors.push(`${at}: у топіку кілька builder з цієї статті й цих креативів (id ${twins.map(b => b.id).join(', ')}) — вкажіть id у state.json руками`);
      continue;
    }
    if (state.builder !== null && knownBuilder === undefined) warnings.push(`${at}: builder ${state.builder.id} зі state.json на платформі немає — буде зібрано новий`);
    steps.push({
      kind: 'builder.create',
      label: retires === null
        ? `${c.name}: зібрати кампанію (${countryName}, ${m.termgroup} + ${m.article}, ${c.creatives.length} креативів)`
        : `${c.name}: перезалив — зібрати нову кампанію замість ${retires.builder.id} (${countryName}, ${m.termgroup} + ${m.article}, ${c.creatives.length} креативів)`,
      campaign: c.name,
      from: { account: `${adAccount!.name} (${adAccount!.id})`, pixel: `${pixel!.name} (${pixel!.id})`, theme: `${theme!.title} (${theme!.id})` },
      body: {
        topic_id: topicRef,
        country: countryName,
        site_id: topic.site,
        post_id: postRef!,
        language: 'All',
        monetization_type: 'RSOC',
        rsoc_count: String(m.rsoc_count),
        conversion_event_type: 'Purchase',
        pixel_id: String(pixel!.id),
        traffic_source: topic.traffic_source,
        traffic_source_profile_ids: [tspRef],
        creative_repo_ids: [headlineRef, ...creativeRefs],
        term_group_ids: [termGroupRef!],
        ad_account_ids: [String(adAccount!.id)],
        use_ad_title_as_referrer_ad_text: '0',
        use_keyword_rotation: m.keyword_rotation ? '1' : '0',
        themes: [String(theme!.id)],
      },
      retires,
    });
    // The old campaign is paused after the new one is up, not before.
    steps.push(...pauses);
  }

  return { steps, warnings, errors, resolved };
}

/** The schedule grid folded into a line, for a person reading the plan. */
export function previewTspBody(body: TspBody): Omit<TspBody, 'schedule_cells'> & { schedule_cells: string } {
  const ticked = body.schedule_cells.flat().filter(Boolean).length;
  const { schedule_cells, ...rest } = body;
  return { ...rest, schedule_cells: `${schedule_cells.length}×${schedule_cells[0]?.length ?? 0}, ${ticked === 0 ? 'жодної клітинки' : `${ticked} клітинок`}` };
}

