// A launch from the creatives tab: one press, one new campaign, nothing kept.
// There is no folder and no state file — the topic is read off the platform
// every time, and this decides the two things the press needs from it.
//
// `setsAndDefaults` turns the topic into sets — a term group and an article,
// whatever the campaigns built on them were called — and fills the form for
// each from the set's latest campaign, then the topic's, then the team's.
// `launchSteps` turns the filled form and the rendered files into the writes
// that make the campaign: the creatives the topic does not hold yet, the
// headline if the topic has none with those words, the profile if none has
// those fields, and the builder — always new, and always last, so a launch
// that stops half-way has bought nothing.
//
// Pure, like the rest of `core`: the server reads, runs and reports.
import { safeStem } from './batch.ts';
import { guessNiche } from './niche.ts';
import {
  AGE_BANDS, findLanguage, findTheme, GENDERS, headlineHtml, headlineText, resolveCountry, sameTsp, tspBody,
  type AdAccount, type BuilderBody, type BuilderLinks, type Country, type CreativeRef, type HeadlineBody, type Page, type Pixel, type PlatformBuilder,
  type PlatformCampaign, type PlatformCreative, type PlatformTopic, type PlatformTsp, type Theme, type TrafficSource, type TspBody,
  type TspFields, type TspRef, type UploadBody,
} from './platform-model.ts';

// ------------------------------------------------------------- inputs --

/** What the team launches with unless the buyer changes it for one launch. */
export interface TeamDefaults {
  budget: number;
  bid: number;
  /** Whether a profile starts tomorrow when the set's own campaign does not say. */
  launch_tomorrow: boolean;
  /**
   * The identity a cabinet's ads go out under, by name, where the cabinet's
   * business has one so called — the GB agent takes no default identity, the
   * P agent has no «Good Life» and goes out under its default. Empty: always the default.
   */
  identity: string;
  rsoc_count: number;
  /** A theme id, key or title; `dark` finds the team's dark theme by its name. */
  theme: string;
  headline: string;
  keyword_rotation: boolean;
  source: TrafficSource;
  /** The profile's audience language — `All`, whatever the creatives speak. */
  language: string;
  gender: string;
  age: string[];
  devices: string[];
  os: string[];
}

export const TEAM_DEFAULTS: TeamDefaults = {
  budget: 25,
  bid: 0.3,
  launch_tomorrow: false,
  identity: 'Good Life',
  rsoc_count: 6,
  theme: 'dark',
  headline: 'Learn more',
  keyword_rotation: false,
  source: 'tiktok',
  language: 'All',
  gender: 'All',
  age: ['All'],
  devices: ['All'],
  os: ['All'],
};

/** The team's defaults with whatever the buyer's config overrides, field by field; a field of the wrong type is ignored. */
export function teamDefaults(override: unknown): TeamDefaults {
  if (typeof override !== 'object' || override === null) return TEAM_DEFAULTS;
  const o = override as Record<string, unknown>;
  const num = (key: keyof TeamDefaults): number | undefined => (typeof o[key] === 'number' && (o[key] as number) > 0 ? (o[key] as number) : undefined);
  const text = (key: keyof TeamDefaults): string | undefined => (typeof o[key] === 'string' && (o[key] as string).trim() !== '' ? (o[key] as string).trim() : undefined);
  const list = (key: keyof TeamDefaults): string[] | undefined => (Array.isArray(o[key]) && (o[key] as unknown[]).every(v => typeof v === 'string') ? (o[key] as string[]) : undefined);
  const source = o['source'] === 'tiktok' || o['source'] === 'facebook' ? o['source'] : undefined;
  return {
    budget: num('budget') ?? TEAM_DEFAULTS.budget,
    bid: num('bid') ?? TEAM_DEFAULTS.bid,
    launch_tomorrow: typeof o['launch_tomorrow'] === 'boolean' ? o['launch_tomorrow'] : TEAM_DEFAULTS.launch_tomorrow,
    identity: typeof o['identity'] === 'string' ? o['identity'].trim() : TEAM_DEFAULTS.identity,
    rsoc_count: num('rsoc_count') ?? TEAM_DEFAULTS.rsoc_count,
    theme: text('theme') ?? TEAM_DEFAULTS.theme,
    headline: text('headline') ?? TEAM_DEFAULTS.headline,
    keyword_rotation: typeof o['keyword_rotation'] === 'boolean' ? o['keyword_rotation'] : TEAM_DEFAULTS.keyword_rotation,
    source: source ?? TEAM_DEFAULTS.source,
    language: text('language') ?? TEAM_DEFAULTS.language,
    gender: text('gender') ?? TEAM_DEFAULTS.gender,
    age: list('age') ?? TEAM_DEFAULTS.age,
    devices: list('devices') ?? TEAM_DEFAULTS.devices,
    os: list('os') ?? TEAM_DEFAULTS.os,
  };
}

/** One topic as the platform holds it, read for one traffic source: what the form and the steps are decided from. */
export interface TopicSnapshot {
  topic: PlatformTopic;
  termGroups: { id: number; name: string }[];
  posts: { id: number; title: string; site_id: number }[];
  builders: PlatformBuilder[];
  /** Builder id → its links, for the builders the server read them for — see `linksWanted`. */
  links: Record<number, BuilderLinks>;
  tsps: PlatformTsp[];
  campaigns: PlatformCampaign[];
  creatives: PlatformCreative[];
  countries: Country[];
  pixels: Pixel[];
  /** The pixels the buyer's campaigns went out with, across all their topics, the latest first — which of a niche's several pixels is theirs. */
  buyerPixels: number[];
  /** The cabinets the platform lists for the topic's site and the source — a cabinet it stopped listing is dead and not offered. */
  adAccounts: AdAccount[];
  /** The identities the source's businesses have. */
  pages: Page[];
  /**
   * The topic's video by the digest of its bytes, for the files of one launch
   * the topic holds under another name — uploaded by hand, or before the
   * upload name was tagged. The platform drops a second upload of the same
   * bytes without a word, so such a file is reused, never sent. Filled by the
   * server for the launch; absent elsewhere.
   */
  heldByDigest?: Record<string, number>;
  themes: Theme[];
  rsocCounts: number[];
  languages: string[];
}

// --------------------------------------------------------------- sets --

/** Every field of the form. Null is a field the buyer still has to fill. */
export interface LaunchForm {
  termGroupId: number;
  postId: number;
  /** The platform's id of the cabinet — never defaulted. */
  account: string | null;
  /** Country codes or names — several are one multi-geo profile — or `All`; empty is a field still to fill. */
  countries: string[];
  budget: number;
  bid: number;
  launch_tomorrow: boolean;
  pixel: string | null;
  /** The identity's id, or null for the cabinet's default. */
  page: string | null;
  source: TrafficSource;
  rsoc_count: number;
  /** A theme id, key or title. */
  theme: string;
  headline: string;
  keyword_rotation: boolean;
  language: string;
  gender: string;
  age: string[];
  devices: string[];
  os: string[];
  end_date: string | null;
}

/** The form without the set it is for. */
export type FormDefaults = Omit<LaunchForm, 'termGroupId' | 'postId'>;

/** A term group and an article that have had campaigns, newest first by their latest one. */
export interface LaunchSet {
  termGroup: { id: number; name: string };
  article: { id: number; title: string };
  /** How many campaigns the set has had, not counting the deleted. */
  campaigns: number;
  /** The builder the defaults were taken from. */
  latest: number;
  defaults: FormDefaults;
}

export interface TopicSets {
  sets: LaunchSet[];
  /** The form for a term group and article with no campaign yet. */
  newSet: FormDefaults;
  termGroups: { id: number; name: string }[];
  articles: { id: number; title: string }[];
  /** Why nothing can be launched on this topic, or null. */
  missing: string | null;
  /** The niche read off the topic's name, when it names one a pixel is for. */
  niche: string | null;
}

/**
 * The niche a pixel is for, read off its name: the team names pixels by niche
 * — «Джобс», «Лонс», «Авто», «Еком», with a number after on Facebook — and
 * that name is the only place the platform says it.
 */
const PIXEL_NICHES: Record<string, string> = { 'джобс': 'jobs', 'лонс': 'credits', 'авто': 'auto', 'еком': 'ecommerce' };

export const pixelNiche = (name: string): string | null => PIXEL_NICHES[name.toLowerCase().replace(/[^a-zа-яіїєґ]+/g, '')] ?? null;

/**
 * The pixel for a topic with no campaign of its own: the niche its name says,
 * and of that niche's pixels — one per business — the one the buyer last
 * launched with anywhere. None used yet, or no niche read: the buyer picks.
 */
function nichePixel(snapshot: TopicSnapshot, niche: string | null): string | null {
  if (niche === null) return null;
  const own = snapshot.pixels.filter(p => pixelNiche(p.name) === niche);
  const used = snapshot.buyerPixels.find(id => own.some(p => p.id === id));
  return used === undefined ? null : String(used);
}

/** The term group a builder was built with: on its campaign once made, in its links before. */
export const termGroupOf = (b: PlatformBuilder, links: BuilderLinks | undefined): number | null =>
  b.campaigns.find(c => c.term_group_id !== null)?.term_group_id ?? links?.term_group ?? null;

const madeCampaign = (b: PlatformBuilder, campaigns: readonly PlatformCampaign[]): PlatformCampaign | undefined =>
  b.campaigns[0] === undefined ? undefined : campaigns.find(c => c.id === b.campaigns[0]!.id);

/** Whether the campaign the builder made was deleted. A rejected or unpublished one still counts: it is what the buyer last set up. */
const deleted = (b: PlatformBuilder, campaigns: readonly PlatformCampaign[]): boolean =>
  madeCampaign(b, campaigns)?.status.toUpperCase() === 'DELETED';

const setKey = (termGroup: number, post: number): string => `${termGroup}|${post}`;

/** The builders that count, grouped by set, each group newest first — ids grow with time. */
function bySet(snapshot: Pick<TopicSnapshot, 'builders' | 'links' | 'campaigns'>): Map<string, PlatformBuilder[]> {
  const groups = new Map<string, PlatformBuilder[]>();
  for (const b of [...snapshot.builders].sort((x, y) => y.id - x.id)) {
    if (deleted(b, snapshot.campaigns)) continue;
    const group = termGroupOf(b, snapshot.links[b.id]);
    if (group === null) continue;
    const key = setKey(group, b.post_id);
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return groups;
}

/**
 * The builders whose own page the server has to read, in two passes. First
 * the ones without a campaign: their term group — their set — is only on
 * their page. Then, with those links in hand, the newest of every set: its
 * profile holds the budget, bid and start the form defaults to.
 */
export function linksWanted(snapshot: Pick<TopicSnapshot, 'builders' | 'links' | 'campaigns'>): number[] {
  const without = snapshot.builders.filter(b => b.campaigns.length === 0 && !(b.id in snapshot.links)).map(b => b.id);
  if (without.length > 0) return without;
  return [...bySet(snapshot).values()].map(group => group[0]!.id).filter(id => !(id in snapshot.links));
}

/** What one builder says about the form, where it says anything. */
interface Said {
  countries: string[];
  budget: number | null;
  bid: number | null;
  launch_tomorrow: boolean | null;
  pixel: string;
  page: string | null;
  headline: string | null;
}

/** The words of the headline the builder was built with, when the topic still holds it. */
function headlineOf(b: PlatformBuilder, snapshot: TopicSnapshot): string | null {
  const found = snapshot.creatives.find(c => c.media_type === 'Headline' && b.creative_ids.includes(c.id));
  const text = found === undefined ? '' : headlineText(found.headline);
  return text === '' ? null : text;
}

function said(b: PlatformBuilder, snapshot: TopicSnapshot): Said {
  const tspId = snapshot.links[b.id]?.tsp;
  const profile = tspId == null ? undefined : snapshot.tsps.find(t => t.id === tspId);
  const listed = madeCampaign(b, snapshot.campaigns);
  // The builder may target All while its profile targets one country or several — the countries the campaign runs in.
  const location = profile?.fields.location ?? [];
  const names = (b.country ?? 'All').toLowerCase() !== 'all' ? [b.country!] : location.length > 0 ? location : ['All'];
  const countries = names.some(n => n.toLowerCase() === 'all')
    ? ['All']
    : names.map(name => snapshot.countries.find(c => c.name.toLowerCase() === name.toLowerCase())?.code ?? name);
  return {
    countries,
    budget: profile?.fields.budget ?? listed?.budget ?? null,
    bid: profile?.fields.bid ?? listed?.bid ?? null,
    launch_tomorrow: profile?.fields.launch_tomorrow ?? null,
    pixel: String(b.pixel_id),
    page: b.page_id == null ? null : String(b.page_id),
    headline: headlineOf(b, snapshot),
  };
}

/** The first of the values that is known. */
const first = <T>(...values: (T | null | undefined)[]): T | null => values.find((v): v is T => v !== null && v !== undefined) ?? null;

/**
 * The topic as sets, newest first, each with the form filled from its latest
 * campaign; and the form for a new set. The cabinet is never filled — the
 * buyer picks it every time, and the pixel and identity are fitted to it then
 * (`forCabinet`). Countries come from the set alone; budget, bid, pixel and
 * headline fall back to the topic's latest campaign, then to the team — the
 * pixel to the niche's; the start is the set's, or the team's. The rest of
 * the form is the team's.
 */
export function setsAndDefaults(snapshot: TopicSnapshot, team: TeamDefaults): TopicSets {
  const niche = guessNiche(snapshot.topic.name, [...new Set(Object.values(PIXEL_NICHES))]);
  const groups = bySet(snapshot);
  const newest = [...groups.values()].map(g => g[0]!).sort((x, y) => y.id - x.id);
  const topicSaid = newest.map(b => said(b, snapshot));
  const topicFirst = <T>(pick: (s: Said) => T | null): T | null => first(...topicSaid.map(pick));

  const base: FormDefaults = {
    account: null,
    countries: [],
    budget: first(topicFirst(s => s.budget), team.budget)!,
    bid: first(topicFirst(s => s.bid), team.bid)!,
    launch_tomorrow: team.launch_tomorrow,
    pixel: first(topicFirst(s => s.pixel), nichePixel(snapshot, niche)),
    page: null,
    source: team.source,
    rsoc_count: team.rsoc_count,
    theme: team.theme,
    headline: first(topicFirst(s => s.headline), team.headline)!,
    keyword_rotation: team.keyword_rotation,
    language: team.language,
    gender: team.gender,
    age: team.age,
    devices: team.devices,
    os: team.os,
    end_date: null,
  };

  const sets: LaunchSet[] = [];
  for (const group of groups.values()) {
    const latest = group[0]!;
    const termGroup = snapshot.termGroups.find(g => g.id === termGroupOf(latest, snapshot.links[latest.id]));
    const article = snapshot.posts.find(p => p.id === latest.post_id);
    // A set whose term group or article the topic no longer has cannot be launched again.
    if (termGroup === undefined || article === undefined) continue;
    const own = said(latest, snapshot);
    sets.push({
      termGroup: { id: termGroup.id, name: termGroup.name },
      article: { id: article.id, title: article.title },
      campaigns: group.length,
      latest: latest.id,
      defaults: {
        ...base,
        countries: own.countries,
        budget: own.budget ?? base.budget,
        bid: own.bid ?? base.bid,
        launch_tomorrow: own.launch_tomorrow ?? team.launch_tomorrow,
        pixel: own.pixel,
        page: own.page,
        headline: own.headline ?? base.headline,
      },
    });
  }
  sets.sort((x, y) => y.latest - x.latest);

  const missing = snapshot.termGroups.length === 0 && snapshot.posts.length === 0
    ? 'у топіка немає ні термгрупи, ні статті — налаштуйте їх на платформі'
    : snapshot.termGroups.length === 0
      ? 'у топіка немає термгрупи — налаштуйте її на платформі'
      : snapshot.posts.length === 0 ? 'у топіка немає статті — налаштуйте її на платформі' : null;

  return {
    sets,
    newSet: base,
    termGroups: snapshot.termGroups.map(g => ({ id: g.id, name: g.name })),
    articles: snapshot.posts.map(p => ({ id: p.id, title: p.title })),
    missing,
    niche,
  };
}

/** A cabinet, pixel or identity as the form lists it: by id, with its name and business. */
export interface Listed { id: string; name: string; business: string }

/**
 * The pixel and identity once a cabinet is picked. A cabinet sees only its own
 * business's pixels and identities, and a pixel it cannot see goes out as no
 * pixel at all — so a pixel of another business becomes the pixel of the same
 * name in this one («Лонс» for «Лонс»), or nothing for the buyer to pick. The
 * identity stays when it is this business's; otherwise it is the team's by
 * name where the business has one so called, and the cabinet's default where not.
 * A business the platform did not say leaves both as they are.
 */
export function forCabinet(
  form: Pick<FormDefaults, 'pixel' | 'page'>, account: string | null,
  lists: { accounts: readonly Listed[]; pixels: readonly Listed[]; pages: readonly Listed[] }, identity: string,
): Pick<FormDefaults, 'pixel' | 'page'> {
  const business = lists.accounts.find(a => a.id === account)?.business ?? '';
  if (business === '') return { pixel: form.pixel, page: form.page };
  const pixel = lists.pixels.find(p => p.id === form.pixel);
  const same = (p: Listed): boolean => p.name.trim().toLowerCase() === pixel?.name.trim().toLowerCase();
  const fitted = pixel === undefined || pixel.business === '' || pixel.business === business
    ? form.pixel
    : lists.pixels.find(p => p.business === business && same(p))?.id ?? null;
  const page = lists.pages.find(p => p.id === form.page);
  const wanted = identity.trim().toLowerCase();
  const own = page !== undefined && page.business === business
    ? page.id
    : wanted === '' ? null : lists.pages.find(p => p.business === business && p.name.trim().toLowerCase() === wanted)?.id ?? null;
  return { pixel: fitted, page: own };
}

// -------------------------------------------------------------- steps --

/** A rendered or dropped mp4: its name, a digest of its bytes, and the script it speaks — the creative's `ad_script`, empty for a designer's file. */
export interface LaunchFile {
  name: string;
  hash: string;
  script: string;
}

/**
 * The name a file goes up under: its own with the first eight of its digest.
 * The platform keeps nothing but `original_filename`, so this is what tells an
 * unchanged creative — reused — from a remade one under the same name.
 */
export function uploadName(file: Pick<LaunchFile, 'name' | 'hash'>): string {
  const tag = file.hash.slice(0, 8);
  // A designer's file may be called anything; the platform gets letters, digits, `_` and `-`.
  const stem = safeStem(file.name) || 'creative';
  return stem.endsWith(`-${tag}`) ? `${stem}.mp4` : `${stem}-${tag}.mp4`;
}

/** The admin's list of builders, where the new campaign is found by its id. */
export const BUILDERS_URL = 'https://admin.digifor.io/acquisition/campaign-builder';

export type LaunchStep =
  | { kind: 'creative.upload'; label: string; file: string; upload: string; body: UploadBody }
  | { kind: 'headline.create'; label: string; text: string; body: HeadlineBody }
  | { kind: 'tsp.create'; label: string; fields: TspFields; body: TspBody }
  | { kind: 'builder.create'; label: string; body: BuilderBody };

/** What the launch reuses rather than makes — for the modal to say, and the retry to show it duplicated nothing. */
export interface Reused {
  creatives: { file: string; id: number }[];
  headline: number | null;
  tsp: number | null;
}

export type LaunchPlan =
  /** `found` says what is reused, a line each, for the progress to show as done before the first write. */
  | { ok: true; steps: LaunchStep[]; reused: Reused; found: string[]; warnings: string[] }
  | { ok: false; errors: string[] };

const allOnly = (list: readonly string[]): string[] => (list.length === 0 || list.some(v => v.toLowerCase() === 'all') ? ['All'] : [...list].map(s => s.trim()).sort());

/**
 * The writes one press makes, or every reason it cannot. Checked before
 * anything: the set is the topic's, the cabinet and pixel are listed and of
 * one business — the identity too — the theme, RSOC count, countries and
 * language are ones the platform takes. Then: every file the topic does not
 * hold, under its upload name or by its bytes, is uploaded — the same file
 * twice is one upload — the headline is made unless
 * the topic has one with those words, the profile unless one has those fields,
 * and the builder is made last, always.
 */
export function launchSteps(form: LaunchForm, snapshot: TopicSnapshot, files: readonly LaunchFile[]): LaunchPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const termGroup = snapshot.termGroups.find(g => g.id === form.termGroupId);
  if (termGroup === undefined) errors.push(`термгрупи ${form.termGroupId} у топіку немає`);
  const post = snapshot.posts.find(p => p.id === form.postId);
  if (post === undefined) errors.push(`статті ${form.postId} у топіку немає`);
  if (form.account === null || form.account.trim() === '') errors.push('не вибрано кабінет');
  const account = form.account === null ? undefined : snapshot.adAccounts.find(a => String(a.id) === form.account);
  if (form.account !== null && form.account.trim() !== '' && account === undefined) errors.push(`кабінету ${form.account} немає серед живих кабінетів платформи`);
  if (form.pixel === null || form.pixel.trim() === '') errors.push('не вибрано піксель');
  const pixel = form.pixel === null ? undefined : snapshot.pixels.find(p => String(p.id) === form.pixel);
  if (form.pixel !== null && form.pixel.trim() !== '' && pixel === undefined) errors.push(`пікселя ${form.pixel} немає на платформі`);
  const apart = (a: string | undefined, b: string | undefined): boolean => a !== undefined && b !== undefined && a !== '' && b !== '' && a !== b;
  if (account !== undefined && pixel !== undefined && apart(account.business_id, pixel.business_id)) {
    errors.push(`піксель «${pixel.name}» (${pixel.id}) з іншого бізнесу, ніж кабінет «${account.name}» — кабінет його не бачить, і кампанія піде без пікселя; оберіть «${pixel.name}» цього бізнесу`);
  }
  const page = form.page === null ? undefined : snapshot.pages.find(p => String(p.id) === form.page);
  if (form.page !== null && page === undefined) errors.push(`FP ${form.page} немає на платформі`);
  if (account !== undefined && page !== undefined && apart(account.business_id, page.business_id)) {
    errors.push(`FP «${page.name}» з іншого бізнесу, ніж кабінет «${account.name}» — оберіть FP цього бізнесу або default`);
  }
  const theme = findTheme(snapshot.themes, form.theme) ?? snapshot.themes.find(t => `${t.key} ${t.title}`.toLowerCase().includes(form.theme.trim().toLowerCase()));
  if (theme === undefined) errors.push(`теми «${form.theme}» немає на платформі; є: ${snapshot.themes.map(t => t.title).join(', ') || 'жодної'}`);
  if (!snapshot.rsocCounts.includes(form.rsoc_count)) errors.push(`RSOC ${form.rsoc_count} платформа не приймає; можна: ${snapshot.rsocCounts.join(', ')}`);
  let countryNames: string[] = [];
  const wantedCountries = form.countries.map(c => c.trim()).filter(c => c !== '');
  if (wantedCountries.length === 0) errors.push('не вибрано країну');
  for (const wanted of wantedCountries) {
    const country = resolveCountry(wanted, snapshot.countries);
    if (country.ok) countryNames.push(country.value);
    else errors.push(...country.errors);
  }
  // All among the countries is all of them; the same country twice is once.
  countryNames = countryNames.includes('All') ? ['All'] : [...new Set(countryNames)];
  const geo = countryNames.join(', ');
  if (!(form.budget > 0)) errors.push('бюджет має бути більшим за нуль');
  if (!(form.bid > 0)) errors.push('бід має бути більшим за нуль');
  const language = findLanguage(snapshot.languages, form.language);
  if (language === undefined) errors.push(`мови «${form.language}» немає в довіднику платформи`);
  const gender = GENDERS.find(g => g.toLowerCase() === form.gender.toLowerCase());
  if (gender === undefined) errors.push(`стать «${form.gender}» — має бути одна з ${GENDERS.join(', ')}`);
  for (const band of form.age) {
    if (band.toLowerCase() !== 'all' && !(AGE_BANDS as readonly string[]).includes(band)) errors.push(`вікової групи «${band}» немає; є: All, ${AGE_BANDS.join(', ')}`);
  }
  const headline = form.headline.trim();
  if (headline === '') errors.push('headline порожній');
  if (files.length === 0) errors.push('немає жодного креативу');
  const site = post?.site_id ?? 0;
  if (post !== undefined && !(site > 0)) errors.push(`у статті «${post.title}» немає сайту`);
  if (errors.length > 0) return { ok: false, errors };

  if (form.source === 'facebook') warnings.push('Facebook: форми TSP і builder не звірені з дампами адмінки — тіла складені за TikTok; перевірте кампанію на платформі після заливу');
  if (form.end_date !== null) warnings.push('формат end_date у запиті TSP не звірений з дампами — перевірте профіль на платформі після заливу');

  const topicId = snapshot.topic.id;
  const steps: LaunchStep[] = [];
  const reused: Reused = { creatives: [], headline: null, tsp: null };

  // -- creatives: what the topic holds under the upload name, or by its bytes under any name, is reused; the
  //    same bytes twice — a render and its copy dropped from disk, say — go up once, under the first name they came by.
  const videos = snapshot.creatives.filter(c => c.media_type === 'Video');
  const refs: CreativeRef[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.hash)) continue;
    seen.add(file.hash);
    const upload = uploadName(file);
    const held = videos.filter(v => v.original_filename === upload).sort((x, y) => y.id - x.id)[0]?.id ?? snapshot.heldByDigest?.[file.hash];
    if (held !== undefined) {
      reused.creatives.push({ file: file.name, id: held });
      refs.push(held);
      continue;
    }
    refs.push({ file: upload });
    steps.push({
      kind: 'creative.upload',
      label: `завантажити ${file.name}`,
      file: file.name,
      upload,
      body: {
        grade: 'New', language: 'All', ad_script: file.script.trim(), media_type: 'Video',
        traffic_sources: [form.source], topic_ids: [topicId], countries: countryNames,
      },
    });
  }

  // -- headline: one per text per topic.
  const held = snapshot.creatives.filter(c => c.media_type === 'Headline' && headlineText(c.headline) === headline).sort((x, y) => x.id - y.id)[0];
  let headlineRef: CreativeRef;
  if (held !== undefined) {
    headlineRef = held.id;
    reused.headline = held.id;
  } else {
    headlineRef = { headline };
    steps.push({
      kind: 'headline.create',
      label: `створити headline «${headline}»`,
      text: headline,
      body: {
        grade: 'Strong', countries: countryNames, headlines: [headlineHtml(headline)], primary_texts: [''], descriptions: [''],
        language: 'All', source: form.source, topic_ids: [topicId],
      },
    });
  }

  // -- profile: one with the same fields is the same profile.
  const fields: TspFields = {
    budget: form.budget,
    bid: form.bid,
    location: countryNames,
    language: language!,
    gender: gender!,
    age: allOnly(form.age),
    devices: allOnly(form.devices),
    os: form.os.some(v => v.toLowerCase() === 'all') || form.os.length === 0 ? [] : [...form.os].sort(),
    launch_tomorrow: form.launch_tomorrow,
    end_date: form.end_date,
    scheduled: false,
  };
  const alike = snapshot.tsps.filter(t => sameTsp(t.fields, fields)).sort((x, y) => x.id - y.id)[0];
  let tspRef: TspRef;
  if (alike !== undefined) {
    tspRef = alike.id;
    reused.tsp = alike.id;
  } else {
    tspRef = 'new';
    steps.push({
      kind: 'tsp.create',
      label: `створити TSP (${geo}, бюджет ${form.budget}, бід ${form.bid}${form.launch_tomorrow ? ', старт завтра' : ''})`,
      fields,
      body: tspBody(form.source, topicId, fields),
    });
  }

  // -- builder: always new, always last.
  steps.push({
    kind: 'builder.create',
    label: `створити кампанію (${geo}, ${termGroup!.name} + ${post!.title}, ${seen.size} креативів)`,
    body: {
      topic_id: topicId,
      // One country is the builder's; several are the profile's, and the builder targets All.
      country: countryNames.length === 1 ? countryNames[0]! : 'All',
      site_id: String(site),
      post_id: post!.id,
      language: 'All',
      monetization_type: 'RSOC',
      rsoc_count: String(form.rsoc_count),
      conversion_event_type: 'Purchase',
      pixel_id: String(pixel!.id),
      page_id: page === undefined ? null : String(page.id),
      traffic_source: form.source,
      traffic_source_profile_ids: [tspRef],
      creative_repo_ids: [headlineRef, ...refs],
      term_group_ids: [termGroup!.id],
      ad_account_ids: [String(account!.id)],
      use_ad_title_as_referrer_ad_text: '0',
      use_keyword_rotation: form.keyword_rotation ? '1' : '0',
      themes: [String(theme!.id)],
    },
  });

  const found = [
    ...reused.creatives.map(c => `${c.file} — уже в топіку (${c.id}), не вантажу`),
    ...(reused.headline === null ? [] : [`headline «${headline}» — знайдено в топіку (${reused.headline})`]),
    ...(reused.tsp === null ? [] : [`TSP знайдено (${reused.tsp}): ${geo}, бюджет ${form.budget}, бід ${form.bid}${form.launch_tomorrow ? ', старт завтра' : ''}`]),
  ];
  return { ok: true, steps, reused, found, warnings };
}

/**
 * A failed step in words the buyer can act on without Claude: what went wrong,
 * what to do, and — the step being before the campaign — that nothing was
 * bought. The platform's own reply, when there is one, stays at the end.
 */
export function plainFailure(kind: LaunchStep['kind'], message: string): string {
  const code = Number(/відповіла (\d{3})/.exec(message)?.[1] ?? NaN);
  const reply = /\((.*)\)\s*$/s.exec(message)?.[1]?.trim();
  const tail = reply === undefined || reply === '' ? '' : ` Платформа: ${reply}`;
  const free = kind === 'builder.create' ? '' : ' Кампанію ще не створено — нічого не оплачено; «Спробувати ще» не вантажить уже завантажене вдруге.';
  if (code === 401) return `Платформа не прийняла токен — він прострочений або не той. Оновіть його в ~/.config/sa/config.json (попросіть Claude: «онови токен»).${free}`;
  if (code === 403) return `Платформа не дає цього зробити з вашим токеном — доступу до топіка, кабінету чи пікселя немає.${tail}${free}`;
  if (code === 413) return `Файл завеликий для платформи — перезберіть його меншим або коротшим.${free}`;
  if (code >= 400 && code < 500) return `Платформа не прийняла запит (${code}) — щось у формі їй не підходить.${tail}${free}`;
  if (code >= 500) return `Платформа впала на своєму боці (${code}) — зачекайте хвилину і натисніть «Спробувати ще».${free}`;
  if (/не відповідає|timeout|спроб/i.test(message)) return `Платформа не відповідає — перевірте інтернет і натисніть «Спробувати ще».${free} (${message})`;
  return `${message}.${free}`.replace(/\.\./g, '.');
}

// ------------------------------------------------------------ sources --

/** A picture the creatives were made from: the name it would like in the folder, with its extension, and a digest of its bytes. */
export interface SourceFile {
  name: string;
  hash: string;
}

/** The topic's name as a folder: whatever a file system would read as a path or hide is replaced. */
export const topicFolder = (name: string): string =>
  name.replace(/[/\\:\u0000-\u001f]+/g, '_').replace(/^[.\s]+|\s+$/g, '') || 'topic';

/**
 * What a successful launch adds to the topic's sources folder, and under which
 * names: flat, one file per picture. A picture the folder already holds —
 * under any name — is not written again; a different picture under a taken
 * name gets `-2`, `-3`, like a batch folder does.
 */
export function placeSources(held: readonly SourceFile[], incoming: readonly SourceFile[]): SourceFile[] {
  const hashes = new Set(held.map(f => f.hash));
  const names = new Set(held.map(f => f.name.toLowerCase()));
  const out: SourceFile[] = [];
  for (const file of incoming) {
    if (hashes.has(file.hash)) continue;
    const dot = file.name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [file.name.slice(0, dot), file.name.slice(dot)] : [file.name, ''];
    let name = file.name;
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${stem}-${n}${ext}`;
    hashes.add(file.hash);
    names.add(name.toLowerCase());
    out.push({ name, hash: file.hash });
  }
  return out;
}
