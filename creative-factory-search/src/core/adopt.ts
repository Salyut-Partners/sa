// `sa adopt` and the launches tab's import: a launch folder made from a topic
// that already exists on the platform — the site, topic, keys, articles and
// the campaigns it runs. Pure: the server reads the topic, its
// configurations, term groups, posts, builders, profiles and creatives, and
// this decides what files the folder gets and what the state file says.
// Videos are not taken: they stay on the platform, and a file the buyer puts
// into an imported campaign later is a new creative — a relaunch.
//
// The state carries a fingerprint of each adopted article: the hash the
// plan would compute from the converted `article.md`. The plan compares the
// file with that fingerprint rather than with the platform, so an article
// that came back from HTML through markdown does not look changed, and the
// first plan after an adopt is empty.
import { parseArticle, type ImageReader } from './article.ts';
import {
  emptyCampaignState, headlineText, isRejected, judgeRetired, type BuilderRef, type CampaignState, type PlatformBuilder, type PlatformCampaign,
  type PlatformCreative, type PlatformTsp, type Pixel, type RetiredCampaign,
} from './campaign-plan.ts';
import { htmlToMarkdown, type PictureRef } from './html-markdown.ts';
import { internalName, isLaunchKey, LAUNCH_DIRS, type LaunchTree, TRAFFIC_SOURCES, type TrafficSource, type TspManifest } from './launch.ts';
import { LOCALE_ENGLISH, LOCALE_IDS } from './locales.ts';
import { campaignFolderName, renderCampaignYaml } from './matrix.ts';
import {
  articleHash, emptyState, type Country, type LaunchState, type PlatformConfiguration, type PlatformPostDetail, type PlatformTermGroup, type PlatformTopic,
} from './plan.ts';
import YAML from 'yaml';

/** What a builder was linked to that the buyer-wide list does not say: its profile, and — before a campaign was made — its term group and cabinet. Off `GET /campaign-builder/<id>`. */
export interface BuilderLinks {
  tsp: number | null;
  term_group: number | null;
  ad_account: string | null;
}

/** The platform's side of the campaigns an import takes: the topic's creatives, profiles, the builders' links, the campaign list. */
export interface CampaignImport {
  creatives: PlatformCreative[];
  tsps: PlatformTsp[];
  /** Builder id → its links, for the builders the server read them for. */
  links: Record<number, BuilderLinks>;
  campaigns: PlatformCampaign[];
  countries: Country[];
}

export interface AdoptInput {
  launchKey: string;
  topic: PlatformTopic;
  configurations: PlatformConfiguration[];
  termGroups: PlatformTermGroup[];
  posts: PlatformPostDetail[];
  /** The topic's builders — where its cabinets and pixels are read off. */
  builders: PlatformBuilder[];
  /** The buyer's pixels per source, to name the pixel a builder used. */
  pixels: Pixel[];
  vertical: string | null;
  /** The campaigns to lay out as folders; without it the topic comes alone, its campaigns left to a matrix. */
  campaigns?: CampaignImport;
}

/** What `sa adopt` lays out: the tree, the state, and what was left for a hand. */
export interface Adopted {
  tree: LaunchTree;
  state: LaunchState;
  /** Pictures to fetch into the folder: article folder → its pictures. */
  pictures: { folder: string; picture: PictureRef }[];
  notes: string[];
}

/** Why an adopt cannot start, in a sentence, or null when it can. */
export function checkAdopt(existingKeys: readonly string[], adoptedTopicIds: readonly number[], launchKey: string, topicId: number): string | null {
  if (!Number.isInteger(topicId) || topicId <= 0) return `id топіка має бути додатним числом, отримано \`${topicId}\``;
  if (!isLaunchKey(launchKey)) {
    return `launch key має вигляд \`ai-vadim-sperm-it\`: малі літери, цифри й дефіси, щонайменше два сегменти; отримано \`${launchKey}\``;
  }
  if (existingKeys.includes(launchKey)) return `залив \`${launchKey}\` уже є — тека існує`;
  if (adoptedTopicIds.includes(topicId)) return `топік ${topicId} уже підхоплено іншою текою заливу`;
  return null;
}

/** A platform name as a folder: lower case, dashes for anything else, trimmed; or the fallback when nothing survives. */
export function folderNameFor(name: string, fallback: string): string {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '').replace(/-{2,}/g, '-');
  if (slug === '' || !/^[a-z0-9]/.test(slug)) return fallback;
  if (slug.length <= MAX_FOLDER_NAME) return slug;
  // Cut at a dash where there is one past the middle, so a long title ends on a whole word.
  const cut = slug.slice(0, MAX_FOLDER_NAME);
  const dash = cut.lastIndexOf('-');
  return (dash > MAX_FOLDER_NAME / 2 ? cut.slice(0, dash) : cut).replace(/[-._]+$/g, '') || fallback;
}

const MAX_FOLDER_NAME = 60;

/** Distinct names: a taken one gets `-2`, `-3`. */
function distinct(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map(name => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name}-${n}`;
  });
}

/** One scalar on one line: the library folds long strings at 80 columns otherwise, which breaks a front matter written line by line. */
const yamlText = (value: string): string => YAML.stringify(value, { lineWidth: 0 }).trim();

/**
 * The cabinets, off the builders: each distinct (source, cabinet, pixel) is
 * one alias, `tk-1`, `fb-1`… A builder whose campaign the platform has not
 * made yet names its pixel and source but no cabinet, so the cabinet is a
 * placeholder to fill. No builders at all: one placeholder per source the
 * configurations name, or one TikTok placeholder.
 */
function cabinets(input: AdoptInput, notes: string[]): { alias: string; source: TrafficSource; ad_account: string; pixel: string; pixelName: string | null }[] {
  const short: Record<TrafficSource, string> = { tiktok: 'tk', facebook: 'fb' };
  const found = new Map<string, { source: TrafficSource; ad_account: string; pixel: string }>();
  for (const b of input.builders) {
    const source = sourceOfBuilder(b);
    const account = cabinetOf(b, input.campaigns?.links[b.id]) ?? 'REPLACE_AD_ACCOUNT_ID';
    const key = `${source}|${account}|${b.pixel_id}`;
    if (!found.has(key)) found.set(key, { source, ad_account: account, pixel: String(b.pixel_id) });
  }
  if (found.size === 0) {
    const sources = [...new Set(input.configurations.map(c => c.traffic_source).filter((s): s is TrafficSource => (TRAFFIC_SOURCES as readonly string[]).includes(s)))];
    for (const source of sources.length > 0 ? sources : (['tiktok'] as TrafficSource[])) {
      found.set(source, { source, ad_account: 'REPLACE_AD_ACCOUNT_ID', pixel: 'REPLACE_PIXEL_ID' });
    }
    notes.push('у топіка ще немає зібраних кампаній — кабінети в topic.yaml є плейсхолдерами, впишіть ad_account і pixel');
  }
  const counters: Record<string, number> = {};
  return [...found.values()].map(c => {
    counters[c.source] = (counters[c.source] ?? 0) + 1;
    const pixel = input.pixels.find(p => String(p.id) === c.pixel);
    if (c.ad_account === 'REPLACE_AD_ACCOUNT_ID') notes.push(`кабінет ${short[c.source]}-${counters[c.source]}: builder з пікселем ${c.pixel} ще не має кампанії, id кабінету невідомий — впишіть ad_account`);
    return { alias: `${short[c.source]}-${counters[c.source]}`, ...c, pixelName: pixel?.name ?? null };
  });
}

/**
 * The folder for an adopted topic. Term groups become `termgroups/<name>/`
 * with the live keys, and a `termgroup.yaml` where the platform name is not
 * a folder name or the weight, country or language say something. Posts
 * become `articles/<slug>/article.md` from their HTML, pictures listed for
 * the server to fetch into `images/`. With `campaigns`, each set-up the topic
 * runs becomes `campaigns/<name>/` — see `importCampaigns`. The state holds
 * every id and the articles' fingerprints.
 */
export function adoptTopic(input: AdoptInput): Adopted {
  const notes: string[] = [];
  const { topic } = input;
  const state: LaunchState = { ...emptyState(), topic_id: topic.id };
  const files: LaunchTree['files'] = [];
  const dirs: string[] = [...LAUNCH_DIRS];
  const pictures: Adopted['pictures'] = [];

  // -- site: the topic has none of its own; its posts do.
  const siteIds = [...new Set(input.posts.map(p => p.site_id).filter(id => id > 0))];
  const site = siteIds[0] === undefined ? 'REPLACE_SITE_ID' : String(siteIds[0]);
  if (siteIds.length === 0) notes.push('у топіка немає статей, сайт невідомий — впишіть `site` у topic.yaml');
  if (siteIds.length > 1) notes.push(`статті топіка лежать на різних сайтах (${siteIds.join(', ')}) — у topic.yaml узято ${site}, перевірте`);

  // -- configurations: one per source.
  for (const c of input.configurations) {
    if ((TRAFFIC_SOURCES as readonly string[]).includes(c.traffic_source) && state.configurations[c.traffic_source] === undefined) {
      state.configurations[c.traffic_source] = c.id;
    }
  }

  const accounts = cabinets(input, notes);
  const topicYaml = [
    '# Топік підхоплено з платформи: sa adopt. Один топік = один тікет = ця тека.',
    `launch_key: ${input.launchKey}`,
    `name: ${yamlText(topic.name)}`,
    `internal_name: ${topic.internal_name !== '' ? topic.internal_name : internalName(topic.name)}`,
    '# Ніша (вертикаль): jobs, loans… Таба заливів групує топіки за нею.',
    `vertical: ${yamlText(input.vertical ?? '')}`,
    '# Гео заливу кодами країн — мітки `geo` на тікеті.',
    'geo: []',
    '# Сайт (домен), на якому публікуються статті. З постів топіка.',
    `site: "${site}"`,
    '# Кабінети, знайдені по зібраних кампаніях топіка: джерело, id кабінету й піксель кожного.',
    'accounts:',
    ...accounts.flatMap(a => [
      `  ${a.alias}:${a.pixelName !== null ? `  # піксель «${a.pixelName}»` : ''}`,
      `    source: ${a.source}`,
      `    ad_account: "${a.ad_account}"`,
      `    pixel: "${a.pixel}"`,
    ]),
    '# Автоправила з пресетів репозиторію, які стоятимуть на топіку.',
    'rules: []',
    '',
  ].join('\n');
  files.push({ path: 'topic.yaml', content: topicYaml });
  if (topic.internal_name !== '' && topic.internal_name !== internalName(topic.name)) {
    notes.push(`internal_name на платформі \`${topic.internal_name}\` не є назвою без пробілів — topic.yaml не пройде валідацію, поки не звірите`);
  }

  // -- term groups
  const groupFolders = distinct(input.termGroups.map((g, i) => folderNameFor(g.name, `tg-${i + 1}`)));
  const weights = input.termGroups.map(g => g.weight);
  const weightsSum = weights.reduce((s, w) => s + w, 0);
  const shares = equalShares(Math.max(1, input.termGroups.length));
  const weightsMatter = input.termGroups.length > 0 && weightsSum === 100 && weights.some((w, i) => w !== shares[i]);
  if (input.termGroups.length > 0 && weightsSum !== 100) notes.push(`ваги термгруп на платформі дають ${weightsSum}, не 100 — у теку записано рівні частки, plan запропонує виставити їх`);
  input.termGroups.forEach((g, i) => {
    const folder = groupFolders[i]!;
    dirs.push(`termgroups/${folder}`);
    files.push({ path: `termgroups/${folder}/keywords.txt`, content: g.terms.join('\n') + (g.terms.length > 0 ? '\n' : '') });
    const options: string[] = [];
    if (folder !== g.name) options.push(`name: ${yamlText(g.name)}`);
    if (weightsMatter) options.push(`weight: ${g.weight}`);
    if (g.country !== 'All' && g.country !== '') options.push(`country: ${yamlText(g.country)}`);
    if (g.language !== 'All' && g.language !== '') options.push(`language: ${yamlText(g.language)}`);
    if (options.length > 0) files.push({ path: `termgroups/${folder}/termgroup.yaml`, content: options.join('\n') + '\n' });
    if (g.terms.length === 0) notes.push(`термгрупа «${g.name}» на платформі без ключів — keywords.txt порожній, plan відмовиться, поки не впишете`);
    state.termgroups[folder] = g.id;
  });

  // -- articles
  const own = input.posts.filter(p => p.topic_ids.length === 0 || p.topic_ids.includes(topic.id));
  const articleFolders = distinct(own.map((p, i) => folderNameFor(p.slug !== '' ? p.slug : p.title, `article-${i + 1}`)));
  own.forEach((post, i) => {
    const folder = articleFolders[i]!;
    const converted = htmlToMarkdown(post.description);
    const front = [
      '---',
      `title: ${yamlText(post.title)}`,
      `country: [${post.country.map(yamlText).join(', ')}]`,
      `language: ${yamlText(post.language === '' ? 'All' : post.language)}`,
      '---',
    ].join('\n');
    const markdown = `${front}\n\n${converted.markdown}`;
    dirs.push(`articles/${folder}`);
    if (converted.pictures.length > 0) dirs.push(`articles/${folder}/images`);
    files.push({ path: `articles/${folder}/article.md`, content: markdown });
    for (const picture of converted.pictures) pictures.push({ folder: `articles/${folder}`, picture });
    // The fingerprint: what the plan will hash once it reads this file back
    // with every picture in place. A data URL's bytes are here; a linked
    // picture's are fetched by the server, which then asks `articleFingerprint`
    // again with the files on disk. An empty hash means the plan syncs it.
    const fingerprint = articleFingerprint(markdown, path => {
      const ref = converted.pictures.find(p => p.path === path);
      const data = ref === undefined ? null : /^data:([^;]+);base64,(.*)$/s.exec(ref.src);
      return data === null ? { mime: 'image/jpeg', base64: '' } : { mime: data[1]!, base64: data[2]! };
    }, site, post.country);
    if (fingerprint === null) notes.push(`стаття «${post.title}»: після конвертації не читається — виправте article.md, plan запропонує оновити її`);
    state.articles[folder] = { id: post.id, hash: fingerprint ?? '' };
    if (post.description.trim() === '') notes.push(`стаття «${post.title}» на платформі без тексту — article.md порожній, plan відмовиться, поки не впишете`);
  });
  if (input.posts.length > own.length) notes.push(`${input.posts.length - own.length} статей зі списку належать іншим топікам — пропущено`);

  // -- campaigns: one folder per set-up, its relaunches folded into the history. No videos: they stay on the platform.
  if (input.campaigns !== undefined) {
    for (const laid of importCampaigns(input, input.campaigns, accounts, state, notes)) {
      dirs.push(`campaigns/${laid.folder}`, `campaigns/${laid.folder}/creatives`);
      files.push({ path: `campaigns/${laid.folder}/campaign.yaml`, content: laid.yaml });
      files.push({ path: `campaigns/${laid.folder}/script.md`, content: laid.script === '' ? '' : `${laid.script}\n` });
      state.campaigns[laid.folder] = laid.state;
    }
  }

  return { tree: { dirs, files }, state, pictures, notes };
}

/**
 * The hash the plan computes for an `article.md` — with the pictures read
 * the way the plan reads them — or null when the file does not parse. Written
 * into the state as the adopted article's fingerprint.
 */
export function articleFingerprint(markdown: string, readImage: ImageReader, site: string, countries: readonly string[]): string | null {
  const parsed = parseArticle(markdown, readImage);
  return parsed.ok ? articleHash(parsed.value, { site }, countries) : null;
}

/** Equal shares that add up to exactly 100 — the plan's own rule, so a platform at equal shares needs no `weight`. */
function equalShares(count: number): number[] {
  const base = Math.floor(100 / count);
  const extra = 100 - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

// ---------------------------------------------------------- campaigns --

const sourceOfBuilder = (b: PlatformBuilder): TrafficSource => TRAFFIC_SOURCES.find(s => s === b.traffic_source) ?? 'tiktok';

/** The cabinet a builder went out from: on its campaign once made, in its links before. */
const cabinetOf = (b: PlatformBuilder, links: BuilderLinks | undefined): string | null =>
  b.campaigns.find(c => c.ad_account != null && c.ad_account !== '')?.ad_account ?? (links?.ad_account || null);

const termGroupOf = (b: PlatformBuilder, links: BuilderLinks | undefined): number | null =>
  b.campaigns.find(c => c.term_group_id !== null)?.term_group_id ?? links?.term_group ?? null;

/**
 * The set-up a builder is one launch of: article, term group, source, cabinet,
 * pixel, country and language. A relaunch is a new builder of the same set-up, and the
 * buyer never runs two live campaigns on one — so a set-up is one folder.
 */
const setUpKey = (b: PlatformBuilder, links: BuilderLinks | undefined): string =>
  [b.post_id, termGroupOf(b, links) ?? '?', sourceOfBuilder(b), cabinetOf(b, links) ?? '?', b.pixel_id, (b.country ?? 'All').toLowerCase(), (b.language ?? 'All').toLowerCase()].join('|');

/** The builders by set-up, each oldest first — ids grow with time. */
function setUps(builders: readonly PlatformBuilder[], links: Record<number, BuilderLinks>): PlatformBuilder[][] {
  const groups = new Map<string, PlatformBuilder[]>();
  for (const b of [...builders].sort((x, y) => x.id - y.id)) {
    const key = setUpKey(b, links[b.id]);
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.values()];
}

/**
 * The builders an import reads the links of: the newest of every set-up, for
 * its profile. A builder without a campaign has to have its links read first,
 * since its set-up is only known through them — pass what is known so far.
 */
export const newestOfSetUps = (builders: readonly PlatformBuilder[], links: Record<number, BuilderLinks>): number[] =>
  setUps(builders, links).map(group => group[group.length - 1]!.id);

const madeCampaign = (b: PlatformBuilder, campaigns: readonly PlatformCampaign[]): PlatformCampaign | undefined =>
  b.campaigns[0] === undefined ? undefined : campaigns.find(c => c.id === b.campaigns[0]!.id);

/** Whether the newest campaign of a set-up was taken down: there is nothing left to run, so it is not imported. */
const takenDown = (newest: PlatformBuilder, campaigns: readonly PlatformCampaign[]): boolean =>
  madeCampaign(newest, campaigns)?.status.toUpperCase() === 'DELETED';

const refOf = (b: PlatformBuilder): BuilderRef => ({ id: b.id, campaign_id: b.campaigns[0]?.id ?? null, campaign_name: b.campaigns[0]?.name ?? null });

/** The builder's videos by file name, without a hash: the files are not on disk, and one put there later is a new creative. */
function videosOf(b: PlatformBuilder, creatives: readonly PlatformCreative[]): CampaignState['creatives'] {
  const videos: CampaignState['creatives'] = {};
  for (const id of b.creative_ids) {
    const found = creatives.find(c => c.id === id && c.media_type === 'Video' && c.original_filename !== null);
    if (found !== undefined) videos[found.original_filename!] = { id, hash: '' };
  }
  return videos;
}

/** The language a country's creatives speak, where the profile targets none. */
const COUNTRY_LANGUAGE: Record<string, string> = {
  DE: 'de', AT: 'de', CH: 'de', IT: 'it', ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', FR: 'fr', BE: 'fr', NL: 'nl',
  PL: 'pl', TR: 'tr', SE: 'sv', PT: 'pt', BR: 'pt', IL: 'he', HU: 'hu',
};

/** The editor's language id for a campaign: the profile's language when it names one, else the country's, else English. */
function languageOf(tspLanguage: string, countryCode: string): string {
  const wanted = tspLanguage.trim().toLowerCase();
  if (wanted !== '' && wanted !== 'all') {
    const named = LOCALE_IDS.find(id => {
      const english = LOCALE_ENGLISH[id].toLowerCase();
      return english.includes(wanted) || wanted.includes(english);
    });
    if (named !== undefined) return named;
  }
  return COUNTRY_LANGUAGE[countryCode.toUpperCase()] ?? 'en';
}

const tspManifestOf = (f: PlatformTsp['fields']): TspManifest => ({
  budget: f.budget, bid: f.bid, launch_tomorrow: f.launch_tomorrow, end_date: f.end_date,
  age: f.age.length === 0 ? ['All'] : f.age, gender: f.gender || 'All', devices: f.devices.length === 0 ? ['All'] : f.devices,
  os: f.os.length === 0 ? ['All'] : f.os, schedule: [], language: f.language || 'All',
});

interface LaidCampaign { folder: string; yaml: string; script: string; state: CampaignState }

/**
 * The campaign folders of an import: for every set-up whose newest campaign
 * is still there, a manifest from the newest builder and its profile, the
 * script its videos carry, and the state — the newest builder current, the
 * older ones its history with the fate the platform shows. A set-up whose
 * term group, article or cabinet the topic folder does not have is left out
 * and named.
 */
function importCampaigns(
  input: AdoptInput,
  from: CampaignImport,
  accounts: readonly { alias: string; source: TrafficSource; ad_account: string; pixel: string }[],
  state: LaunchState,
  notes: string[],
): LaidCampaign[] {
  const laid: LaidCampaign[] = [];
  for (const group of setUps(input.builders, from.links)) {
    const newest = group[group.length - 1]!;
    const links = from.links[newest.id];
    const at = `builder ${newest.id}`;
    if (takenDown(newest, from.campaigns)) {
      notes.push(`${at}: останню кампанію ${newest.campaigns[0]!.id} знято з платформи — зв'язку не імпортовано`);
      continue;
    }
    const termGroupId = termGroupOf(newest, links);
    const termgroup = Object.entries(state.termgroups).find(([, id]) => id === termGroupId)?.[0];
    const article = Object.entries(state.articles).find(([, a]) => a.id === newest.post_id)?.[0];
    const cabinet = cabinetOf(newest, links);
    const account = accounts.find(a => a.source === sourceOfBuilder(newest) && a.ad_account === (cabinet ?? 'REPLACE_AD_ACCOUNT_ID') && a.pixel === String(newest.pixel_id));
    const missing = [
      termgroup === undefined ? `термгрупи ${termGroupId ?? '(невідомої)'}` : null,
      article === undefined ? `статті ${newest.post_id}` : null,
      account === undefined ? 'кабінету' : null,
    ].filter((m): m is string => m !== null);
    if (missing.length > 0) {
      notes.push(`${at}: у теці топіка немає ${missing.join(', ')} — кампанію не імпортовано`);
      continue;
    }

    const profile = links?.tsp == null ? undefined : from.tsps.find(t => t.id === links.tsp);
    // The builder may target All while its profile targets one country — the country the campaign runs in.
    const location = profile?.fields.location ?? [];
    const countryName = (newest.country ?? 'All').toLowerCase() !== 'all' ? newest.country! : location.length === 1 ? location[0]! : 'All';
    const country = countryName.toLowerCase() === 'all' ? 'All' : from.countries.find(c => c.name.toLowerCase() === countryName.toLowerCase())?.code ?? countryName;
    const listed = madeCampaign(newest, from.campaigns);
    let tsp: TspManifest;
    if (profile !== undefined) tsp = tspManifestOf(profile.fields);
    else {
      tsp = { ...tspManifestOf({ budget: listed?.budget ?? 20, bid: listed?.bid ?? 0.45, location: [], language: 'All', gender: 'All', age: [], devices: [], os: [], launch_tomorrow: true, end_date: null, scheduled: false }) };
      notes.push(`${at}: TSP кампанії не знайдено — у campaign.yaml бюджет ${tsp.budget} і бід ${tsp.bid}${listed === undefined ? ' як плейсхолдери' : ' зі списку кампаній'}, решта як All`);
    }
    if (profile?.fields.scheduled === true) notes.push(`${at}: TSP має розклад по годинах — у campaign.yaml його немає, перезалив піде без розкладу`);
    const language = languageOf(tsp.language, country);

    const headlineCreative = from.creatives.find(c => c.media_type === 'Headline' && newest.creative_ids.includes(c.id));
    const headline = headlineCreative === undefined ? '' : headlineText(headlineCreative.headline);
    if (headline === '') notes.push(`${at}: headline кампанії не знайдено — у campaign.yaml плейсхолдер`);
    if (newest.theme == null) notes.push(`${at}: тема статті невідома — у campaign.yaml плейсхолдер`);
    const script = from.creatives.find(c => c.media_type === 'Video' && newest.creative_ids.includes(c.id) && (c.ad_script ?? '').trim() !== '')?.ad_script?.trim() ?? '';

    const yaml = renderCampaignYaml({
      termgroup: termgroup!, article: article!, language, country, account: account!.alias,
      theme: newest.theme ?? 'REPLACE_THEME_ID', rsoc_count: newest.rsoc_count ?? 5, keyword_rotation: newest.keyword_rotation ?? false,
      headline: headline === '' ? 'REPLACE_HEADLINE' : headline, tsp,
    });
    const history: RetiredCampaign[] = group.slice(0, -1).map(b => ({
      builder: refOf(b), creatives: videosOf(b, from.creatives), fate: judgeRetired(b, from.campaigns).fate,
    }));
    laid.push({
      folder: campaignFolderName({ language, country, account: account!.alias, termgroup: termgroup!, article: article! }),
      yaml,
      script,
      state: {
        ...emptyCampaignState(),
        builder: refOf(newest),
        creatives: videosOf(newest, from.creatives),
        headline: headlineCreative === undefined || headline === '' ? null : { id: headlineCreative.id, text: headline },
        tsp: profile === undefined ? null : { id: profile.id, name: profile.name },
        history,
      },
    });
  }
  const names = distinct(laid.map(l => l.folder));
  return laid.map((l, i) => ({ ...l, folder: names[i]! }));
}

// ------------------------------------------------------------- import --

/** A topic on the platform the buyer can import: its set-ups counted, and how many of them are live or rejected now. */
export interface ImportableTopic {
  topicId: number;
  name: string;
  campaigns: number;
  active: number;
  rejected: number;
}

/**
 * The buyer's topics that no launch folder has yet, read off the buyer's
 * builders — each carries its topic — so one list read answers for all of
 * them. A set-up whose newest campaign was taken down is not counted.
 */
export function importableTopics(builders: readonly PlatformBuilder[], campaigns: readonly PlatformCampaign[], adoptedTopicIds: readonly number[]): ImportableTopic[] {
  const byTopic = new Map<number, PlatformBuilder[]>();
  for (const b of builders) {
    if (adoptedTopicIds.includes(b.topic_id)) continue;
    byTopic.set(b.topic_id, [...(byTopic.get(b.topic_id) ?? []), b]);
  }
  return [...byTopic.entries()].map(([topicId, own]) => {
    const newest = setUps(own, {}).map(g => g[g.length - 1]!).filter(b => !takenDown(b, campaigns));
    return {
      topicId,
      name: own.find(b => (b.topic_name ?? '') !== '')?.topic_name ?? `topic ${topicId}`,
      campaigns: newest.length,
      active: newest.filter(b => madeCampaign(b, campaigns)?.status.toUpperCase() === 'ACTIVE').length,
      rejected: newest.filter(isRejected).length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** A launch key for a topic being imported: its name as a folder, at least two segments, and not one already taken. */
export function suggestLaunchKey(name: string, taken: readonly string[]): string {
  let base = folderNameFor(name, 'topic').replace(/[._]+/g, '-').replace(/-{2,}/g, '-').replace(/-+$/, '');
  if (!isLaunchKey(base)) base = `${base}-topic`;
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`;
  return key;
}
