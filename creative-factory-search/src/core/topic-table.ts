// The topic table: what the launches tab shows for one topic. Source →
// cabinet → campaigns, each campaign in exactly three states — what is on
// disk, whether it is launched, what the platform says — and a totals row.
// Pure: the server reads the folder, the state files and the buyer's
// platform status; this decides what they mean; the tab draws it.
//
// Spend, ROI and clicks are deliberately not here: the platform has them, and
// two versions of that truth would be one too many.
import { describeRejection, isRejected, type AdAccount, type CampaignState, type PlatformBuilder, type PlatformCampaign } from './campaign-plan.ts';
import { parseCampaignManifest, parseTopicManifest, type TopicManifest, type TrafficSource } from './launch.ts';
import { campaignsOf, type TreeCampaign } from './launches-tree.ts';
import type { CampaignOutline, LaunchState } from './plan.ts';

// ------------------------------------------------------------- inputs --

/** A topic folder as the table reads it: the tree's listing plus the manifests and scripts of its campaigns. */
export interface TopicFolder {
  key: string;
  topicYaml: string | null;
  /** Paths under the folder, relative, forward slashes — the same listing the tree gets. */
  paths: string[];
  /** Campaign folder → its `campaign.yaml` text, for the ones that have one. */
  manifests: Record<string, string>;
  /** Campaign folder → whether `script.md` has any words. */
  scripts: Record<string, boolean>;
  /** The batches under `sources/`, oldest first. */
  batches: string[];
  /** Campaign folder → file under `creatives/` → its hash, as the plan computes it; what tells a launched campaign's files changed without the plan. */
  hashes?: Record<string, Record<string, string>>;
}

/**
 * What the platform says about the buyer, read once for all their topics:
 * every builder with its status, rejection and the bot's verdicts, every
 * campaign with its status, and the cabinets it still lists per source.
 * `at` is when; `note` why there is nothing.
 */
export interface PlatformStatus {
  builders: PlatformBuilder[];
  campaigns: PlatformCampaign[];
  /** The cabinets the platform lists, per source it was read for; a source missing was not read, and says nothing about its cabinets. */
  adAccounts?: Partial<Record<TrafficSource, AdAccount[]>>;
  at: string | null;
  note: string | null;
}

export const emptyPlatformStatus = (note: string | null = null): PlatformStatus => ({ builders: [], campaigns: [], at: null, note });

// ------------------------------------------------------------ columns --

/** State one: the folder. */
export interface DiskColumn {
  creatives: number;
  rejected: number;
  script: boolean;
  /** Why the manifest is not usable, or null when it is. */
  problem: string | null;
  /** Whether the files under `creatives/` are not the ones the launched campaign was built with — names or bytes. */
  changed: boolean;
}

/** State two: the launch, from `state.json`, the disk, and the plan once it is counted. */
export type LaunchKind =
  /** No creatives yet: the buyer's draft, not offered for launch. */
  | 'draft'
  | 'unbuilt'
  | 'built'
  /** Built, and the files differ from what it was built with — seen on disk, before any plan. */
  | 'changed'
  /** Built, and the folder differs: a relaunch is what the plan offers. */
  | 'relaunch'
  /** The plan refuses this campaign; the folder needs fixing. */
  | 'errors';

export interface LaunchColumn {
  kind: LaunchKind;
  label: string;
  /** The campaign's own steps in the plan; 0 when the plan is not read. */
  steps: number;
  errors: number;
}

/** State three: the platform. */
export type PlatformKind =
  /** Not on the platform: no builder in the state. */
  | 'none'
  /** The state names a builder the platform's list does not show. */
  | 'unknown'
  /** Waiting for the platform's review. */
  | 'review'
  | 'rejected'
  /** Approved, the campaign not made yet. */
  | 'approved'
  /** The campaign exists but is not live yet — pending at the source, or not in the list. */
  | 'pending'
  | 'active'
  | 'paused'
  | 'deleted';

export interface PlatformColumn {
  kind: PlatformKind;
  label: string;
  /** The rejection in a line, for a rejected builder. */
  reason: string | null;
  builderId: number | null;
  campaignId: number | null;
  campaignName: string | null;
  /** The daily budget and the bid the platform's list shows for the campaign, once it does. */
  budget: number | null;
  bid: number | null;
  /** Where to look in the admin, when there is something to look at. */
  url: string | null;
}

/**
 * The admin's campaign builder page. The admin is a single-page app and no
 * route that opens one builder or one campaign by id is known yet, so every
 * link goes to this list — the page where a builder's status and rejection
 * are — with the ids beside it in the tooltip and the copied text.
 */
export const BUILDER_ADMIN_URL = 'https://admin.digifor.io/acquisition/campaign-builder';

// --------------------------------------------------------------- rows --

export interface TableCampaign {
  name: string;
  language: string | null;
  country: string | null;
  /** The term group and article folders the manifest names, or null when it does not read. */
  termgroup: string | null;
  article: string | null;
  /** The cabinet alias the manifest names, or null when it names none the topic has. */
  account: string | null;
  disk: DiskColumn;
  launch: LaunchColumn;
  platform: PlatformColumn;
}

export interface Totals {
  campaigns: number;
  built: number;
  active: number;
  rejected: number;
  withoutCreatives: number;
}

export interface TableAccount {
  alias: string;
  /** The cabinet's id: the manifest's, or — where `sa adopt` left a placeholder — the one its launched campaigns went out from; null when neither says. */
  adAccount: string | null;
  /** The cabinet's name as the platform lists it — its list of cabinets, else the buyer's builders; null when neither names it. */
  adAccountName: string | null;
  campaigns: TableCampaign[];
  totals: Totals;
}

export interface TableSource {
  /** `tiktok`, `facebook`, or `NO_CABINET` for campaigns whose manifest names no cabinet the topic has. */
  source: TrafficSource | typeof NO_CABINET;
  accounts: TableAccount[];
  totals: Totals;
}

export interface TopicTable {
  key: string;
  name: string;
  /** The topic's id on the platform, from the state; null before the first launch. */
  topicId: number | null;
  /** Why the topic manifest could not be read, or null. */
  problem: string | null;
  sources: TableSource[];
  totals: Totals;
  batches: string[];
  /** When the platform was last asked, and why it could not be, for the header. */
  platformAt: string | null;
  platformNote: string | null;
}

/** Where campaigns without a cabinet of the topic go. */
export const NO_CABINET = 'без кабінету';

// --------------------------------------------------------- the columns --

export const emptyTotals = (): Totals => ({ campaigns: 0, built: 0, active: 0, rejected: 0, withoutCreatives: 0 });

function totalsOf(campaigns: readonly TableCampaign[]): Totals {
  return {
    campaigns: campaigns.length,
    built: campaigns.filter(c => c.launch.kind === 'built' || c.launch.kind === 'changed' || c.launch.kind === 'relaunch').length,
    active: campaigns.filter(c => c.platform.kind === 'active').length,
    rejected: campaigns.filter(c => c.platform.kind === 'rejected').length,
    withoutCreatives: campaigns.filter(c => c.disk.creatives === 0).length,
  };
}

const sumTotals = (list: readonly Totals[]): Totals => list.reduce((sum, t) => ({
  campaigns: sum.campaigns + t.campaigns, built: sum.built + t.built, active: sum.active + t.active,
  rejected: sum.rejected + t.rejected, withoutCreatives: sum.withoutCreatives + t.withoutCreatives,
}), emptyTotals());

/**
 * The launch state: whether the campaign reached a builder, and what the plan
 * would do now. Without a plan the state file alone answers built or not.
 */
export function launchColumn(disk: DiskColumn, state: CampaignState | undefined, outline: CampaignOutline | undefined): LaunchColumn {
  const built = state?.builder !== null && state?.builder !== undefined;
  if (disk.creatives === 0) return { kind: 'draft', label: built ? 'залита · креативів у теці немає' : 'без креативів', steps: 0, errors: 0 };
  if (disk.problem !== null) return { kind: 'errors', label: 'налаштування кампанії не читаються', steps: 0, errors: 1 };
  if (outline === undefined) {
    if (!built) return { kind: 'unbuilt', label: 'не залита', steps: 0, errors: 0 };
    return disk.changed ? { kind: 'changed', label: 'файли змінились після заливу', steps: 0, errors: 0 } : { kind: 'built', label: 'залита', steps: 0, errors: 0 };
  }
  if (outline.errors > 0) return { kind: 'errors', label: `${outline.errors} помилок у плані — виправте кампанію`, steps: outline.steps, errors: outline.errors };
  if (outline.relaunch) return { kind: 'relaunch', label: 'є різниця — треба перезалив', steps: outline.steps, errors: 0 };
  if (built) return { kind: 'built', label: outline.steps > 0 ? `залита · ${outline.steps} кроків у плані` : 'залита', steps: outline.steps, errors: 0 };
  if (outline.steps === 0) return { kind: 'unbuilt', label: 'не залита · план порожній', steps: 0, errors: 0 };
  return { kind: 'unbuilt', label: `не залита · ${outline.steps} кроків`, steps: outline.steps, errors: 0 };
}

/** Whether the files on disk are not the set the launched campaign was built with: a name added or gone, or a remade file. */
function filesChanged(hashes: Record<string, string> | undefined, state: CampaignState | undefined): boolean {
  if (hashes === undefined || state?.builder === null || state?.builder === undefined) return false;
  const known = state.creatives;
  const names = Object.keys(hashes);
  return names.length !== Object.keys(known).length || names.some(name => known[name]?.hash !== hashes[name]);
}

/**
 * The platform's word on the campaign: the builder the state names, matched
 * by id in the buyer's list, and the campaign it made, matched in the
 * campaign list. Nothing is inferred from names.
 */
export function platformColumn(state: CampaignState | undefined, platform: PlatformStatus | null): PlatformColumn {
  const none: PlatformColumn = { kind: 'none', label: 'не залита', reason: null, builderId: null, campaignId: null, campaignName: null, budget: null, bid: null, url: null };
  const builderRef = state?.builder ?? null;
  if (builderRef === null) return none;
  const own = { builderId: builderRef.id, campaignId: builderRef.campaign_id, campaignName: builderRef.campaign_name, budget: null, bid: null, url: BUILDER_ADMIN_URL };
  if (platform === null || platform.at === null) return { ...own, kind: 'unknown', label: 'платформа ще не опитана', reason: null };
  const builder = platform.builders.find(b => b.id === builderRef.id);
  if (builder === undefined) return { ...own, kind: 'unknown', label: 'у списку платформи цієї кампанії не видно', reason: null };
  if (isRejected(builder)) {
    const reason = builder.rejection === null ? null : describeRejection(builder.rejection);
    return { ...own, kind: 'rejected', label: 'реджект', reason };
  }
  const made = builder.campaigns[0];
  const campaignId = made?.id ?? builderRef.campaign_id;
  const campaignName = made?.name ?? builderRef.campaign_name;
  const status = builder.status.toUpperCase();
  if (status !== 'APPROVED') return { ...own, kind: 'review', label: `на модерації (${builder.status})`, reason: null };
  if (campaignId === null) return { ...own, kind: 'approved', label: 'апрувнута · кампанії ще немає', reason: null, campaignId, campaignName };
  const record = platform.campaigns.find(c => c.id === campaignId);
  const at = { ...own, campaignId, campaignName, reason: null, budget: record?.budget ?? null, bid: record?.bid ?? null };
  if (record === undefined) return { ...at, kind: 'pending', label: 'кампанія є, у списку ще не видно' };
  const spelled = record.status.toUpperCase();
  if (spelled === 'ACTIVE') return { ...at, kind: 'active', label: 'активна' };
  if (spelled === 'PAUSED') return { ...at, kind: 'paused', label: 'на паузі' };
  if (spelled === 'DELETED') return { ...at, kind: 'deleted', label: 'знята' };
  return { ...at, kind: 'pending', label: `не жива (${record.status})` };
}

// --------------------------------------------------------------- table --

/** A cabinet id as `topic.yaml` holds it, or null for the placeholder `sa adopt` leaves when it could not learn one — never an id, never a name to show. */
const knownCabinet = (id: string | null): string | null => (id !== null && /^\d+$/.test(id) ? id : null);

interface Placed {
  row: TableCampaign;
  source: TrafficSource | typeof NO_CABINET;
  alias: string;
  adAccount: string | null;
}

function rowOf(folder: TopicFolder, topic: TopicManifest | null, tree: TreeCampaign, state: LaunchState, outline: CampaignOutline | undefined, platform: PlatformStatus | null): Placed {
  const yaml = folder.manifests[tree.name];
  let problem: string | null = null;
  let language: string | null = null;
  let country: string | null = null;
  let account: string | null = null;
  let termgroup: string | null = null;
  let article: string | null = null;
  if (yaml === undefined) problem = 'немає campaign.yaml';
  else if (topic === null) problem = 'topic.yaml не читається';
  else {
    const parsed = parseCampaignManifest(yaml, topic);
    if (parsed.ok) ({ language, country, account, termgroup, article } = parsed.value);
    else problem = parsed.errors.join('; ');
  }
  const own = state.campaigns[tree.name];
  const disk: DiskColumn = {
    creatives: tree.creatives, rejected: tree.rejected, script: folder.scripts[tree.name] === true, problem,
    changed: filesChanged(folder.hashes?.[tree.name], own),
  };
  const row: TableCampaign = {
    name: tree.name, language, country, termgroup, article, account, disk,
    launch: launchColumn(disk, own, outline),
    platform: platformColumn(own, platform),
  };
  const cabinet = topic !== null && account !== null ? topic.accounts[account] : undefined;
  if (cabinet === undefined) return { row, source: NO_CABINET, alias: NO_CABINET, adAccount: null };
  return { row, source: cabinet.source, alias: account!, adAccount: cabinet.ad_account };
}

/**
 * The table for one topic. Cabinets come in the manifest's order, sources in
 * the order the cabinets first name them; a cabinet with no campaigns is
 * still a row, so the buyer sees where the matrix left a hole — unless the
 * platform no longer lists it, when it goes with its campaigns. Campaigns
 * whose manifest names no cabinet of the topic close the table under
 * «без кабінету».
 */
export function buildTopicTable(
  folder: TopicFolder,
  state: LaunchState,
  outline: readonly CampaignOutline[] | null,
  platform: PlatformStatus | null,
): TopicTable {
  let topic: TopicManifest | null = null;
  let problem: string | null = null;
  if (folder.topicYaml === null) problem = 'немає topic.yaml';
  else {
    const parsed = parseTopicManifest(folder.topicYaml);
    if (parsed.ok) topic = parsed.value;
    else problem = 'topic.yaml: ' + parsed.errors.join('; ');
  }
  const outlines = new Map((outline ?? []).map(o => [o.name, o]));
  const placed = campaignsOf(folder.paths).map(tree => rowOf(folder, topic, tree, state, outlines.get(tree.name), platform));

  const listed = platform?.adAccounts ?? {};
  // A cabinet's name is the platform's list of cabinets first, and every campaign that went out from it after.
  const cabinetNames = new Map<string, string>();
  for (const list of Object.values(listed)) {
    for (const a of list ?? []) if (a.name !== '') cabinetNames.set(String(a.id), a.name);
  }
  // The cabinet each builder's campaign went out from — what names a cabinet `sa adopt` could only leave a placeholder for.
  const builderCabinets = new Map<number, string>();
  for (const b of platform?.builders ?? []) {
    for (const c of b.campaigns) {
      if (c.ad_account == null || c.ad_account === '') continue;
      if (!builderCabinets.has(b.id)) builderCabinets.set(b.id, c.ad_account);
      if (c.ad_account_name != null && c.ad_account_name !== '' && !cabinetNames.has(c.ad_account)) cabinetNames.set(c.ad_account, c.ad_account_name);
    }
  }
  const learnedCabinet = (alias: string): string | null => {
    for (const p of placed) {
      if (p.alias !== alias || p.row.platform.builderId === null) continue;
      const id = builderCabinets.get(p.row.platform.builderId);
      if (id !== undefined) return id;
    }
    return null;
  };
  const sources = new Map<TrafficSource | typeof NO_CABINET, Map<string, TableAccount>>();
  const accountOf = (source: TrafficSource | typeof NO_CABINET, alias: string, written: string | null): TableAccount => {
    const bySource = sources.get(source) ?? new Map<string, TableAccount>();
    sources.set(source, bySource);
    const known = bySource.get(alias);
    if (known !== undefined) return known;
    const adAccount = source === NO_CABINET ? null : knownCabinet(written) ?? learnedCabinet(alias);
    const adAccountName = adAccount === null ? null : cabinetNames.get(adAccount) ?? null;
    const own = { alias, adAccount, adAccountName, campaigns: [], totals: emptyTotals() };
    bySource.set(alias, own);
    return own;
  };
  for (const [alias, cabinet] of Object.entries(topic?.accounts ?? {})) accountOf(cabinet.source, alias, cabinet.ad_account);
  for (const p of placed) accountOf(p.source, p.alias, p.adAccount).campaigns.push(p.row);

  // A cabinet the platform no longer lists for its source is banned or frozen:
  // its campaigns are neither shown nor counted. Only a list that was read can
  // say so, and only of a cabinet whose id is known.
  const dead = (source: TrafficSource | typeof NO_CABINET, account: TableAccount): boolean => {
    if (source === NO_CABINET || account.adAccount === null) return false;
    const list = listed[source];
    return list !== undefined && !list.some(a => String(a.id) === account.adAccount);
  };
  for (const [source, accounts] of sources) {
    for (const [alias, account] of accounts) if (dead(source, account)) accounts.delete(alias);
    if (accounts.size === 0) sources.delete(source);
  }

  const tableSources: TableSource[] = [...sources.entries()]
    .sort(([a], [b]) => (a === NO_CABINET ? 1 : b === NO_CABINET ? -1 : 0))
    .map(([source, accounts]) => {
      const list = [...accounts.values()].map(a => ({ ...a, totals: totalsOf(a.campaigns) }));
      return { source, accounts: list, totals: sumTotals(list.map(a => a.totals)) };
    });
  return {
    key: folder.key,
    name: topic?.name ?? folder.key,
    topicId: state.topic_id,
    problem,
    sources: tableSources,
    totals: sumTotals(tableSources.map(s => s.totals)),
    batches: [...folder.batches],
    platformAt: platform?.at ?? null,
    platformNote: platform?.note ?? null,
  };
}

/** The campaigns «Що буде залито» on the topic ticks: not built, with steps and without errors. Relaunches have their own button. */
export const launchable = (table: TopicTable): string[] =>
  table.sources.flatMap(s => s.accounts.flatMap(a => a.campaigns.filter(c => c.launch.kind === 'unbuilt' && c.launch.steps > 0).map(c => c.name)));

// ---------------------------------------------------------- clipboard --

const topicLine = (table: TopicTable): string =>
  `Топік: ${table.name} — ${table.key} (${table.topicId === null ? 'на платформі ще немає' : `topic ${table.topicId}`})`;

const cabinetWords = (account: TableAccount | undefined): string => {
  if (account === undefined || account.adAccount === null) return 'без кабінету';
  return account.adAccountName === null ? `кабінет ${account.adAccount}` : `кабінет «${account.adAccountName}» (${account.adAccount})`;
};

const platformWords = (p: PlatformColumn): string => [
  p.label + (p.reason !== null ? ` — ${p.reason}` : ''),
  p.builderId !== null ? `builder ${p.builderId}` : null,
  p.campaignId !== null ? `кампанія ${p.campaignId}${p.campaignName !== null ? ` «${p.campaignName}»` : ''}` : null,
  p.budget !== null ? `бюджет ${p.budget}` : null,
  p.bid !== null ? `бід ${p.bid}` : null,
].filter((part): part is string => part !== null).join(' · ');

const placed = (table: TopicTable): { campaign: TableCampaign; account: TableAccount }[] =>
  table.sources.flatMap(s => s.accounts.flatMap(account => account.campaigns.map(campaign => ({ campaign, account }))));

const geoWords = (c: TableCampaign): string => `${c.language ?? '?'}-${c.country ?? '?'}`;

/**
 * A campaign as text to paste into a chat with Claude: which topic, which
 * folder by its full path, what is in it and what the platform calls it —
 * enough to find the creatives or the campaign without asking.
 */
export function campaignClipboard(table: TopicTable, name: string, topicFolder: string): string {
  const found = placed(table).find(p => p.campaign.name === name);
  if (found === undefined) return `${topicLine(table)}\nКампанія: ${name}\nТека: ${topicFolder}/campaigns/${name}`;
  const { campaign: c, account } = found;
  const about = [geoWords(c), cabinetWords(account), c.termgroup !== null ? `термгрупа ${c.termgroup}` : null, c.article !== null ? `стаття ${c.article}` : null]
    .filter((part): part is string => part !== null).join(' · ');
  return [
    topicLine(table),
    `Кампанія: ${c.name} — ${about}`,
    `Тека: ${topicFolder}/campaigns/${c.name}`,
    `Креативи: ${c.disk.creatives} mp4 у creatives/${c.disk.rejected > 0 ? `, ${c.disk.rejected} у creatives/rejected/` : ''}`,
    `Платформа: ${platformWords(c.platform)}`,
  ].join('\n');
}

/** A topic as text to paste: its folder and every campaign in a line, with its state on the platform. */
export function topicClipboard(table: TopicTable, topicFolder: string): string {
  const rows = placed(table);
  return [
    topicLine(table),
    `Тека: ${topicFolder}`,
    `Кампанії (${rows.length}):`,
    ...rows.map(({ campaign: c, account }) => `- ${c.name} — ${geoWords(c)} · ${cabinetWords(account)} · ${c.disk.creatives} mp4 · ${platformWords(c.platform)}`),
  ].join('\n');
}
