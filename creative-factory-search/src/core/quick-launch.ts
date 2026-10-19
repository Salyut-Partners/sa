// A launch from the creatives tab: one press, a new campaign per row, nothing kept.
// There is no folder and no state file — the topic is read off the platform
// every time, and this decides the two things the press needs from it.
//
// `setsAndDefaults` turns the topic into sets — a term group and an article,
// whatever the campaigns built on them were called — and fills the form for
// each from the set's latest campaign, then the topic's, then the team's.
// `launchSteps` turns the filled form and the rendered files into the writes
// that make the campaign: the creatives the topic does not hold yet, the
// headline if the topic has none with those words, a profile for every budget
// and bid no profile has, and a builder per row — a cabinet with its own
// budget and bid — always new, and always last, so a launch that stops before
// them has bought nothing.
//
// Pure, like the rest of `core`: the server reads, runs and reports.
import { safeStem } from './batch.ts';
import { guessNiche } from './niche.ts';
import {
  AGE_BANDS, BID_STRATEGIES, FB_AGE_MAX, FB_AGE_MIN, findLanguage, findTheme, GENDERS, hasCap, headlineHtml, headlineText, markedFor, PERFORMANCE_GOALS,
  PLACEMENTS, resolveCountry, sameTsp, tspBody,
  type AdAccount, type BuilderBody, type BuilderLinks, type Country, type CreativeRef, type FacebookSettings, type HeadlineBody, type Page, type Pixel,
  type PlatformBuilder, type PlatformCampaign, type PlatformCreative, type PlatformTopic, type PlatformTsp, type Theme, type TrafficSource, type TspBody,
  type TspFields, type TspRef, type UploadBody,
} from './platform-model.ts';

// ------------------------------------------------------------- inputs --

/** What the team launches with unless the buyer changes it for one launch. */
export interface TeamDefaults {
  budget: number;
  bid: number;
  /** How much each campaign added to a launch bids over the one before: a ladder, so they do not meet in one auction. */
  bid_step: number;
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
  /** Facebook's own profile fields, start among them; TikTok does not read them. */
  facebook: FacebookSettings;
}

const FB_SETTINGS: FacebookSettings = {
  performance_goal: 'MAXIMIZE_NUMBER_OF_CONVERSIONS',
  bid_strategy: 'LOWEST_COST_WITH_BID_CAP',
  placements: 'advantage',
  age_from: FB_AGE_MIN,
  age_to: FB_AGE_MAX,
  launch_time: null,
};

export const TEAM_DEFAULTS: TeamDefaults = {
  budget: 25,
  bid: 0.3,
  bid_step: 0.05,
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
  facebook: FB_SETTINGS,
};

/** Facebook's: its own numbers, Bid Cap and start now, and no team page by name — a page is the set's or the buyer's latest. */
export const FB_TEAM_DEFAULTS: TeamDefaults = {
  ...TEAM_DEFAULTS,
  source: 'facebook',
  budget: 20,
  bid: 0.3,
  bid_step: 0.05,
  launch_tomorrow: false,
  identity: '',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isTime = (v: unknown): v is string => typeof v === 'string' && TIME.test(v);

/**
 * The team's defaults for a source with whatever the buyer's config overrides,
 * field by field; a field of the wrong type is ignored. Each source has its
 * block — `tiktok`, `facebook` — and the flat keys of the old config are
 * TikTok's; the top-level `source` is the one the form opens with, and the
 * source when none is asked for.
 */
export function teamDefaults(override: unknown, source?: TrafficSource): TeamDefaults {
  const config = (typeof override === 'object' && override !== null ? override : {}) as Record<string, unknown>;
  const wanted: TrafficSource = source ?? (config['source'] === 'facebook' ? 'facebook' : 'tiktok');
  const block = (key: TrafficSource): Record<string, unknown> =>
    (typeof config[key] === 'object' && config[key] !== null ? config[key] : {}) as Record<string, unknown>;
  if (wanted === 'facebook') return overridden(FB_TEAM_DEFAULTS, block('facebook'));
  if (typeof override !== 'object' || override === null) return TEAM_DEFAULTS;
  return overridden(TEAM_DEFAULTS, { ...config, ...block('tiktok') });
}

function overridden(base: TeamDefaults, o: Record<string, unknown>): TeamDefaults {
  const num = (key: keyof TeamDefaults): number | undefined => (typeof o[key] === 'number' && (o[key] as number) > 0 ? (o[key] as number) : undefined);
  const text = (key: keyof TeamDefaults): string | undefined => (typeof o[key] === 'string' && (o[key] as string).trim() !== '' ? (o[key] as string).trim() : undefined);
  const list = (key: keyof TeamDefaults): string[] | undefined => (Array.isArray(o[key]) && (o[key] as unknown[]).every(v => typeof v === 'string') ? (o[key] as string[]) : undefined);
  const option = <T extends string>(key: string, options: readonly T[], otherwise: T): T =>
    ((options as readonly string[]).includes(o[key] as string) ? (o[key] as T) : otherwise);
  const ageOf = (key: string, otherwise: number): number =>
    (Number.isInteger(o[key]) && (o[key] as number) >= FB_AGE_MIN && (o[key] as number) <= FB_AGE_MAX ? (o[key] as number) : otherwise);
  const fb = base.facebook;
  return {
    budget: num('budget') ?? base.budget,
    bid: num('bid') ?? base.bid,
    bid_step: num('bid_step') ?? base.bid_step,
    launch_tomorrow: typeof o['launch_tomorrow'] === 'boolean' ? o['launch_tomorrow'] : base.launch_tomorrow,
    identity: typeof o['identity'] === 'string' ? o['identity'].trim() : base.identity,
    rsoc_count: num('rsoc_count') ?? base.rsoc_count,
    theme: text('theme') ?? base.theme,
    headline: text('headline') ?? base.headline,
    keyword_rotation: typeof o['keyword_rotation'] === 'boolean' ? o['keyword_rotation'] : base.keyword_rotation,
    source: base.source,
    language: text('language') ?? base.language,
    gender: text('gender') ?? base.gender,
    age: list('age') ?? base.age,
    devices: list('devices') ?? base.devices,
    os: list('os') ?? base.os,
    facebook: {
      performance_goal: option('performance_goal', PERFORMANCE_GOALS, fb.performance_goal),
      bid_strategy: option('bid_strategy', BID_STRATEGIES, fb.bid_strategy),
      placements: option('placements', PLACEMENTS, fb.placements),
      age_from: ageOf('age_from', fb.age_from),
      age_to: ageOf('age_to', fb.age_to),
      launch_time: o['launch_time'] === null ? null : isTime(o['launch_time']) ? o['launch_time'] : fb.launch_time,
    },
  };
}

/** One topic as the platform holds it, read for one traffic source: what the form and the steps are decided from. */
export interface TopicSnapshot {
  /** The source it was read for: its cabinets, pixels and pages are that source's, and so are the defaults. */
  source: TrafficSource;
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
  /** The pages the buyer's campaigns of the source went out with, across all their topics, the latest first; read, like the pixels, when the topic has none of its own. */
  buyerPages: number[];
  /** The cabinets the platform lists for the topic's site and the source — a cabinet it stopped listing is dead and not offered. */
  adAccounts: AdAccount[];
  /** The identities (TikTok) or pages (Facebook) the source's businesses have. */
  pages: Page[];
  /**
   * The topic's video or image by the digest of its bytes, for the files of one launch
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

/** One campaign of a launch: a cabinet with its own budget and bid, and the pixel and identity of its business. */
export interface LaunchCampaign {
  /** The platform's id of the cabinet — never defaulted. */
  account: string | null;
  budget: number;
  bid: number;
  pixel: string | null;
  /** The identity's id, or null for the cabinet's default. */
  page: string | null;
}

/** Every field of the form. Null is a field the buyer still has to fill. */
export interface LaunchForm {
  termGroupId: number;
  postId: number;
  /** A campaign each, built in this order; a cabinet may be in several. */
  campaigns: LaunchCampaign[];
  /** Country codes or names — several are one multi-geo profile — or `All`; empty is a field still to fill. */
  countries: string[];
  launch_tomorrow: boolean;
  source: TrafficSource;
  rsoc_count: number;
  /** A theme id, key or title. */
  theme: string;
  headline: string;
  /** The ad's main text on Facebook; TikTok has none and sends it empty. */
  primary_text: string;
  /** Facebook's own profile fields — goal, strategy, placements, ages, the start. TikTok ignores them. */
  facebook: FacebookSettings;
  keyword_rotation: boolean;
  language: string;
  gender: string;
  age: string[];
  devices: string[];
  os: string[];
  end_date: string | null;
}

/**
 * The form without the set it is for, its rows not yet made: the budget and
 * bid the first row starts from, and the pixel and identity every row's are
 * fitted from (`forCabinet`).
 */
export type FormDefaults = Omit<LaunchForm, 'termGroupId' | 'postId' | 'campaigns'> & Pick<LaunchCampaign, 'budget' | 'bid' | 'pixel' | 'page'>;

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
  /**
   * The pages the buyer last launched with on the source, the topic's first,
   * then their other topics' — what a cabinet's page comes from when the set
   * gives none of its business (`forCabinet`).
   */
  recentPages: string[];
}

/**
 * The niche a pixel is for, read off its name: the team names pixels by niche
 * — «Джобс», «Лонс», «Авто», «Еком», with a number after on Facebook — and
 * that name is the only place the platform says it.
 */
const PIXEL_NICHES: Record<string, string> = {
  'джобс': 'jobs', 'лонс': 'credits', 'авто': 'auto', 'еком': 'ecommerce',
  jobs: 'jobs', job: 'jobs', lons: 'credits', loans: 'credits', credit: 'credits', auto: 'auto', ecom: 'ecommerce',
};

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

/** The source a builder was built for; one that does not say is TikTok's, as all were before. */
export const sourceOf = (b: Pick<PlatformBuilder, 'traffic_source'>): string => (b.traffic_source || 'tiktok').toLowerCase();

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
 * their page. Then, with those links in hand, the newest of every set — its
 * profile holds the countries — and the newest of the source read for, whose
 * profile holds the budget, bid and start the form defaults to.
 */
export function linksWanted(snapshot: Pick<TopicSnapshot, 'source' | 'builders' | 'links' | 'campaigns'>): number[] {
  const without = snapshot.builders.filter(b => b.campaigns.length === 0 && !(b.id in snapshot.links)).map(b => b.id);
  if (without.length > 0) return without;
  const groups = [...bySet(snapshot).values()];
  const newest = groups.map(group => group[0]!.id);
  const own = groups.flatMap(group => group.filter(b => sourceOf(b) === snapshot.source).slice(0, 1).map(b => b.id));
  return [...new Set([...newest, ...own])].filter(id => !(id in snapshot.links));
}

/** What one builder says about the form, where it says anything. */
interface Said {
  countries: string[];
  budget: number | null;
  bid: number | null;
  launch_tomorrow: boolean | null;
  pixel: string;
  page: string | null;
  /** The headline and its primary text, together: they were written as one. */
  headline: { title: string; primary: string } | null;
  facebook: FacebookSettings | null;
}

/** The words of the headline the builder was built with, and its primary text, when the topic still holds it. */
function headlineOf(b: PlatformBuilder, snapshot: TopicSnapshot): Said['headline'] {
  const found = snapshot.creatives.find(c => c.media_type === 'Headline' && b.creative_ids.includes(c.id));
  const title = found === undefined ? '' : headlineText(found.headline);
  return title === '' ? null : { title, primary: headlineText(found!.primary_text ?? null) };
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
    // A profile without a cap has no bid: the list's, or the next one down.
    bid: profile !== undefined && profile.fields.bid > 0 ? profile.fields.bid : listed?.bid ?? null,
    launch_tomorrow: profile?.fields.launch_tomorrow ?? null,
    pixel: String(b.pixel_id),
    page: b.page_id == null ? null : String(b.page_id),
    headline: headlineOf(b, snapshot),
    facebook: profile?.fields.facebook ?? null,
  };
}

/** The first of the values that is known. */
const first = <T>(...values: (T | null | undefined)[]): T | null => values.find((v): v is T => v !== null && v !== undefined) ?? null;

/**
 * The topic as sets, newest first, each with the form filled from its latest
 * campaign; and the form for a new set. A set is a term group and an article
 * whatever the source of its campaigns, so a set proven on TikTok is offered
 * on Facebook. The cabinet is never filled — the buyer picks it every time, and
 * the pixel and page are fitted to it then (`forCabinet`). Countries come from
 * the set's latest campaign of either source; everything else only from
 * campaigns of the source read for — budget, bid, pixel, headline and its
 * primary text, the profile's fields from the set's latest, then the topic's,
 * then the team — the pixel to the niche's; the start and the page are the
 * set's, or the team's start and no page. The rest of the form is the team's.
 */
export function setsAndDefaults(snapshot: TopicSnapshot, team: TeamDefaults): TopicSets {
  const niche = guessNiche(snapshot.topic.name, [...new Set(Object.values(PIXEL_NICHES))]);
  const groups = bySet(snapshot);
  const ownOf = (group: readonly PlatformBuilder[]): PlatformBuilder | undefined => group.find(b => sourceOf(b) === snapshot.source);
  const newestOwn = [...groups.values()].map(ownOf).filter(b => b !== undefined).sort((x, y) => y.id - x.id);
  const topicSaid = newestOwn.map(b => said(b, snapshot));
  const topicFirst = <T>(pick: (s: Said) => T | null): T | null => first(...topicSaid.map(pick));
  const headline = topicFirst(s => s.headline) ?? { title: team.headline, primary: '' };

  const base: FormDefaults = {
    countries: [],
    budget: first(topicFirst(s => s.budget), team.budget)!,
    bid: first(topicFirst(s => s.bid), team.bid)!,
    launch_tomorrow: team.launch_tomorrow,
    pixel: first(topicFirst(s => s.pixel), nichePixel(snapshot, niche)),
    page: null,
    source: team.source,
    rsoc_count: team.rsoc_count,
    theme: team.theme,
    headline: headline.title,
    primary_text: headline.primary,
    facebook: { ...(topicFirst(s => s.facebook) ?? team.facebook), launch_time: team.facebook.launch_time },
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
    const ownBuilder = ownOf(group);
    const own = ownBuilder === undefined ? null : said(ownBuilder, snapshot);
    sets.push({
      termGroup: { id: termGroup.id, name: termGroup.name },
      article: { id: article.id, title: article.title },
      campaigns: group.length,
      latest: latest.id,
      defaults: {
        ...base,
        countries: said(latest, snapshot).countries,
        budget: own?.budget ?? base.budget,
        bid: own?.bid ?? base.bid,
        launch_tomorrow: own?.launch_tomorrow ?? team.launch_tomorrow,
        pixel: own?.pixel ?? base.pixel,
        page: own?.page ?? null,
        headline: own?.headline?.title ?? base.headline,
        primary_text: own?.headline?.primary ?? base.primary_text,
        facebook: own?.facebook ?? base.facebook,
      },
    });
  }
  sets.sort((x, y) => y.latest - x.latest);
  const recentPages = [...new Set([
    ...newestOwn.flatMap(b => (b.page_id == null ? [] : [String(b.page_id)])),
    ...snapshot.buyerPages.map(String),
  ])];

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
    recentPages,
  };
}

/**
 * A cabinet, pixel or identity as the form lists it: by id, with its name and
 * business. A cabinet carries its source account and a pixel the account it
 * is bound to and its source id — what tells, on Facebook, which row of one
 * pixel a cabinet holds.
 */
export interface Listed { id: string; name: string; business: string; account?: string; pixel?: string }

/** A source account as a number: Facebook writes it `act_1201` in one place and `1201` in another. */
const accountNumber = (id: string | undefined): string => (id ?? '').trim().replace(/^act_/i, '');

/**
 * Whether a Facebook pixel row is a neighbour's: of the cabinet's business, or
 * one not said, but bound to another of its cabinets. It may go, or may not —
 * not checked yet — so it is said, not stopped.
 */
export const boundElsewhere = (cabinet: Pick<Listed, 'business' | 'account'>, pixel: Pick<Listed, 'business' | 'account'>): boolean =>
  (cabinet.business === '' || pixel.business === '' || cabinet.business === pixel.business)
  && accountNumber(pixel.account) !== '' && accountNumber(pixel.account) !== accountNumber(cabinet.account);

export const elsewhereWarning = (pixel: Pick<Listed, 'id' | 'name'>, cabinet: Pick<Listed, 'name'>): string =>
  `піксель «${pixel.name}» (${pixel.id}) прив'язаний не до кабінету «${cabinet.name}», а до сусіднього кабінету того самого бізнесу — не звірено, чи піде; перевірте першу таку кампанію`;

const samePixel = (a: Listed, b: Listed): boolean => a.business === b.business && (a.pixel || a.id) === (b.pixel || b.id);

/** The pixels the form offers: on Facebook one pixel is a row per cabinet, offered once per business — the row a campaign gets is fitted to its cabinet. */
export const pixelChoices = (pixels: readonly Listed[], source: TrafficSource): Listed[] =>
  source !== 'facebook' ? [...pixels] : pixels.filter((p, i) => pixels.findIndex(q => samePixel(p, q)) === i);

/** The choice a pixel row is shown as: itself, or on Facebook the first row of the same pixel in its business. */
export function choiceOf(pixels: readonly Listed[], source: TrafficSource, id: string | null): string | null {
  const row = pixels.find(p => p.id === id);
  return row === undefined ? id : pixelChoices(pixels, source).find(p => samePixel(p, row))?.id ?? id;
}

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
  facebook?: { recentPages: readonly string[] },
): Pick<FormDefaults, 'pixel' | 'page'> {
  const cabinet = lists.accounts.find(a => a.id === account);
  const business = cabinet?.business ?? '';
  if (business === '') return { pixel: form.pixel, page: form.page };
  if (facebook !== undefined) return forFacebookCabinet(form, cabinet!, lists, facebook.recentPages);
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

/**
 * Facebook keeps one pixel as a row per cabinet that holds it: the row bound
 * to this cabinet, else one of the business — a neighbour's, which goes with
 * a warning — else the pixel of the same name there, else none. The page is
 * one of the business's — or of none the platform says — else the buyer's
 * latest of the business, else none; there is no team page on Facebook.
 */
function forFacebookCabinet(
  form: Pick<FormDefaults, 'pixel' | 'page'>, cabinet: Listed,
  lists: { pixels: readonly Listed[]; pages: readonly Listed[] }, recentPages: readonly string[],
): Pick<FormDefaults, 'pixel' | 'page'> {
  const business = cabinet.business;
  const pixel = lists.pixels.find(p => p.id === form.pixel);
  const inBusiness = lists.pixels.filter(p => p.business === business);
  const samePixel = (p: Listed): boolean => pixel !== undefined && (pixel.pixel ?? '') !== '' && p.pixel === pixel.pixel;
  const fitted = pixel === undefined ? form.pixel
    : (inBusiness.find(p => samePixel(p) && accountNumber(p.account) === accountNumber(cabinet.account))
      ?? inBusiness.find(samePixel)
      ?? inBusiness.find(p => p.name.trim().toLowerCase() === pixel.name.trim().toLowerCase()))?.id ?? null;
  const page = lists.pages.find(p => p.id === form.page);
  const own = page !== undefined && (page.business === business || page.business === '')
    ? page.id
    : recentPages.find(id => lists.pages.find(p => p.id === id)?.business === business) ?? null;
  return { pixel: fitted, page: own };
}

// -------------------------------------------------------------- steps --

/**
 * A rendered or dropped creative: its name — with its extension, which says
 * whether it is a video or an image — a digest of its bytes, and the script it
 * speaks — the creative's `ad_script`, empty for a designer's file or an image.
 */
export interface LaunchFile {
  name: string;
  hash: string;
  script: string;
}

/** What a file goes up as, by its extension: the repository's media type and the mime it is sent with. */
const MEDIA: Record<string, { media_type: 'Video' | 'Image'; mime: string }> = {
  mp4: { media_type: 'Video', mime: 'video/mp4' },
  jpg: { media_type: 'Image', mime: 'image/jpeg' },
  jpeg: { media_type: 'Image', mime: 'image/jpeg' },
  png: { media_type: 'Image', mime: 'image/png' },
  webp: { media_type: 'Image', mime: 'image/webp' },
};

/** The extensions the launch takes. */
export const MEDIA_EXTENSIONS = Object.keys(MEDIA);

const extensionOf = (name: string): string => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

/** A file the launch takes — mp4, jpg, png, webp — as what it goes up as, with its extension; null for any other. */
export function mediaOf(name: string): { media_type: 'Video' | 'Image'; mime: string; ext: string } | null {
  const ext = extensionOf(name);
  const media = MEDIA[ext];
  return media === undefined ? null : { ...media, ext };
}

/**
 * The name a file goes up under: its own with the first eight of its digest,
 * and its own extension. The platform keeps nothing but `original_filename`,
 * so this is what tells an unchanged creative — reused — from a remade one
 * under the same name.
 */
export function uploadName(file: Pick<LaunchFile, 'name' | 'hash'>): string {
  const tag = file.hash.slice(0, 8);
  const ext = mediaOf(file.name)?.ext ?? 'mp4';
  // A designer's file may be called anything; the platform gets letters, digits, `_` and `-`.
  const stem = safeStem(file.name) || 'creative';
  return stem.endsWith(`-${tag}`) ? `${stem}.${ext}` : `${stem}-${tag}.${ext}`;
}

/** The proportions each source shows as they are; another is said, not refused. */
const USUAL_RATIOS: Record<TrafficSource, { label: string; value: number }[]> = {
  tiktok: [{ label: '9:16', value: 9 / 16 }],
  facebook: [{ label: '9:16', value: 9 / 16 }, { label: '4:5', value: 4 / 5 }, { label: '1:1', value: 1 }, { label: '1.91:1', value: 1.91 }],
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** An image's proportion when it is unusual for the source — a wrong crop to look at, not to stop for — and null when it is usual. */
export function ratioWarning(width: number, height: number, source: TrafficSource): string | null {
  if (!(width > 0) || !(height > 0)) return null;
  const usual = USUAL_RATIOS[source];
  if (usual.some(r => Math.abs(width / height - r.value) / r.value < 0.03)) return null;
  const d = gcd(Math.round(width), Math.round(height));
  const label = width / d <= 50 && height / d <= 50 ? `${width / d}:${height / d}` : `${(width / height).toFixed(2)}:1`;
  const list = usual.map(r => r.label);
  const usualText = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} або ${list.at(-1)}`;
  return `${label} — незвична пропорція для ${SOURCE_NAMES[source]} (зазвичай ${usualText}); залити можна, перевірте, як виглядає`;
}

export const SOURCE_NAMES: Record<TrafficSource, string> = { tiktok: 'TikTok', facebook: 'Facebook' };

/** The admin's list of builders, where the new campaign is found by its id. */
export const BUILDERS_URL = 'https://admin.digifor.io/acquisition/campaign-builder';

export type LaunchStep =
  /** `mime` is what the file is sent as: `video/mp4`, `image/jpeg`, `image/png`, `image/webp`. */
  | { kind: 'creative.upload'; label: string; file: string; upload: string; mime: string; body: UploadBody }
  | { kind: 'headline.create'; label: string; text: string; body: HeadlineBody }
  /** `key` is what the builders that go out on this profile name it by until it has an id. */
  | { kind: 'tsp.create'; label: string; key: string; fields: TspFields; body: TspBody }
  /** `campaign` is the row of the form the builder is, from 0. */
  | { kind: 'builder.create'; label: string; campaign: number; body: BuilderBody };

/** What the launch reuses rather than makes — for the modal to say, and the retry to show it duplicated nothing. */
export interface Reused {
  creatives: { file: string; id: number }[];
  headline: number | null;
  tsps: number[];
}

export type LaunchPlan =
  /** `found` says what is reused, a line each, for the progress to show as done before the first write. */
  | { ok: true; steps: LaunchStep[]; reused: Reused; found: string[]; warnings: string[] }
  | { ok: false; errors: string[] };

const allOnly = (list: readonly string[]): string[] => (list.length === 0 || list.some(v => v.toLowerCase() === 'all') ? ['All'] : [...list].map(s => s.trim()).sort());

/** More campaigns than this at once is said: the playbook's first launch is ~6, «до 12–15 не проблема». */
const MANY_CAMPAIGNS = 15;

/**
 * What the buyer should hear about the rows before pressing, and does not stop
 * them: one bid in two campaigns puts them in one auction — the playbook's
 * bid grid — and more campaigns at once than the playbook ever launches.
 * Without a cap there is no bid to meet on.
 */
export function campaignWarnings(campaigns: readonly Pick<LaunchCampaign, 'bid'>[], capped = true): string[] {
  const out: string[] = [];
  const byBid = new Map<number, number[]>();
  campaigns.forEach((c, i) => byBid.set(c.bid, [...(byBid.get(c.bid) ?? []), i + 1]));
  for (const [bid, rows] of capped ? byBid : []) {
    if (rows.length > 1 && bid > 0) out.push(`бід ${bid} у кампаніях ${rows.join(', ')} — однаковий бід ставить їх в один аукціон; зробіть сітку`);
  }
  if (campaigns.length > MANY_CAMPAIGNS) out.push(`${campaigns.length} кампаній за раз — плейбук на перший залив радить ~6, до 12–15`);
  return out;
}

/** A bid in cents, as the buyer would type it: 0.30000000000000004 is 0.3. */
const cents = (n: number): number => Math.round(n * 100) / 100;

/**
 * The budget and bid of a row added to the form: the set's for the first; for
 * the next, the last row's budget and its bid a step higher — a ladder the
 * buyer can then change cell by cell.
 */
export function nextCampaign(rows: readonly Pick<LaunchCampaign, 'budget' | 'bid'>[], first: Pick<LaunchCampaign, 'budget' | 'bid'>, step: number): Pick<LaunchCampaign, 'budget' | 'bid'> {
  const last = rows.at(-1);
  return last === undefined ? { budget: first.budget, bid: first.bid } : { budget: last.budget, bid: cents(last.bid + step) };
}

/** The key a new profile goes by in the plan: one profile per budget and bid — per budget alone without a cap — the rest of its fields being the launch's. */
const tspKey = (c: Pick<LaunchCampaign, 'budget' | 'bid'>, capped: boolean): string => (capped ? `${c.budget}|${c.bid}` : `${c.budget}`);

/** The start as the progress and the modal say it. */
export function startText(form: Pick<LaunchForm, 'source' | 'launch_tomorrow' | 'facebook'>): string {
  if (form.source === 'facebook') return form.facebook.launch_time === null ? 'старт одразу' : `старт завтра о ${form.facebook.launch_time}`;
  return form.launch_tomorrow ? 'старт завтра' : '';
}

/** A static image on TikTok has not been launched yet: said wherever images go to TikTok. */
export const TIKTOK_IMAGE_WARNING = 'TikTok: статичну картинку ще не заливали — TikTok може її не прийняти або показати лише на Pangle; перевірте першу таку кампанію';

/** `1 картинка`, `3 картинки`, `5 картинок`. */
const plural = (n: number, one: string, few: string, many: string): string => {
  const tens = n % 100;
  const units = n % 10;
  const word = tens >= 11 && tens <= 14 ? many : units === 1 ? one : units >= 2 && units <= 4 ? few : many;
  return `${n} ${word}`;
};

/** Videos and images as the progress and the modal count them: `1 відео, 3 картинки`. */
export const creativesCount = (videos: number, images: number): string =>
  [...(videos > 0 ? [plural(videos, 'відео', 'відео', 'відео')] : []), ...(images > 0 ? [plural(images, 'картинка', 'картинки', 'картинок')] : [])].join(', ');

/**
 * What a Facebook launch sends that no live launch has been checked against
 * yet — to look at in the admin after the first one. Shortens as each is checked.
 */
export function uncheckedOnFacebook(fb: FacebookSettings, reusedOtherSource: boolean): string {
  const items = [
    ...(hasCap(fb) ? ['bid рядком при Bid Cap (знятий дамп був без капу)'] : []),
    ...(fb.bid_strategy === 'COST_CAP' ? ['Cost per result goal (`COST_CAP`) — значення з форми адмінки, дампу заливу з ним ще не було'] : []),
    ...(fb.placements === 'facebook' ? ['значення placements для Facebook Only (шлемо `facebook`)'] : []),
    'чи віддає список креативів джерела й primary text — від цього залежить, що перевикористовується',
    ...(reusedOtherSource ? ['чи прийме builder креатив, позначений іншим джерелом'] : []),
    'формат account_id кабінету (з act_ чи без) — від нього залежить вибір рядка пікселя',
  ];
  return `Facebook — не звірено на живому заливі; після першого перевірте в адмінці профіль, builder, піксель і сторінку: ${items.join('; ')}`;
}

/**
 * The writes one press makes, or every reason it cannot. Checked before
 * anything: the set is the topic's, there is a row, and every row's cabinet and
 * pixel are listed and of one business — the identity or page too, which
 * Facebook needs on every row — with a budget, and a bid unless there is no
 * cap; the theme, RSOC count, countries, language and, on Facebook, the
 * start and ages are ones the platform takes; every file is an mp4 or an
 * image. Then: every file the topic does not hold, under its upload name or by
 * its bytes, of either source, is uploaded — the same file twice is one upload
 * — the headline is made unless the topic has one of the source with those
 * words and that primary text, a profile for every budget and bid unless one
 * of the source has those fields, and a builder per row, last, always.
 */
export function launchSteps(form: LaunchForm, snapshot: TopicSnapshot, files: readonly LaunchFile[]): LaunchPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const onFacebook = form.source === 'facebook';
  const fb = onFacebook ? form.facebook : null;
  const capped = hasCap(fb);
  const termGroup = snapshot.termGroups.find(g => g.id === form.termGroupId);
  if (termGroup === undefined) errors.push(`термгрупи ${form.termGroupId} у топіку немає`);
  const post = snapshot.posts.find(p => p.id === form.postId);
  if (post === undefined) errors.push(`статті ${form.postId} у топіку немає`);
  if (form.campaigns.length === 0) errors.push('не додано жодної кампанії');
  const apart = (a: string | undefined, b: string | undefined): boolean => a !== undefined && b !== undefined && a !== '' && b !== '' && a !== b;
  // One row says its reasons as they are; of several, each says whose they are.
  const whose = (i: number, reason: string): string => (form.campaigns.length === 1 ? reason : `кампанія ${i + 1}: ${reason}`);
  const campaigns = form.campaigns.map((c, i) => {
    const own: string[] = [];
    if (c.account === null || c.account.trim() === '') own.push('не вибрано кабінет');
    const account = c.account === null ? undefined : snapshot.adAccounts.find(a => String(a.id) === c.account);
    if (c.account !== null && c.account.trim() !== '' && account === undefined) own.push(`кабінету ${c.account} немає серед живих кабінетів платформи`);
    if (c.pixel === null || c.pixel.trim() === '') own.push('не вибрано піксель');
    const pixel = c.pixel === null ? undefined : snapshot.pixels.find(p => String(p.id) === c.pixel);
    if (c.pixel !== null && c.pixel.trim() !== '' && pixel === undefined) own.push(`пікселя ${c.pixel} немає на платформі`);
    if (account !== undefined && pixel !== undefined && apart(account.business_id, pixel.business_id)) {
      own.push(`піксель «${pixel.name}» (${pixel.id}) з іншого бізнесу, ніж кабінет «${account.name}» — кабінет його не бачить, і кампанія піде без пікселя; оберіть «${pixel.name}» цього бізнесу`);
    }
    // Facebook keeps a pixel as a row per cabinet: a neighbour's row of the same business may go — or may not; not checked yet.
    if (onFacebook && account !== undefined && pixel !== undefined
      && boundElsewhere({ business: account.business_id, account: account.account_id }, { business: pixel.business_id, account: pixel.ad_account_id })) {
      warnings.push(whose(i, elsewhereWarning({ id: String(pixel.id), name: pixel.name }, account)));
    }
    if (onFacebook && c.page === null) own.push('не вибрано FP — на Facebook оголошення без сторінки не існує');
    const page = c.page === null ? undefined : snapshot.pages.find(p => String(p.id) === c.page);
    if (c.page !== null && page === undefined) own.push(`FP ${c.page} немає на платформі`);
    if (account !== undefined && page !== undefined && apart(account.business_id, page.business_id)) {
      own.push(`FP «${page.name}» з іншого бізнесу, ніж кабінет «${account.name}» — оберіть FP цього бізнесу${onFacebook ? '' : ' або default'}`);
    }
    if (!(c.budget > 0)) own.push('бюджет має бути більшим за нуль');
    if (capped && !(c.bid > 0)) own.push('бід має бути більшим за нуль');
    errors.push(...own.map(e => whose(i, e)));
    return { ...c, bid: capped ? c.bid : 0, account: account!, pixel: pixel!, page };
  });
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
  const language = findLanguage(snapshot.languages, form.language);
  if (language === undefined) errors.push(`мови «${form.language}» немає в довіднику платформи`);
  const gender = GENDERS.find(g => g.toLowerCase() === form.gender.toLowerCase());
  if (gender === undefined) errors.push(`стать «${form.gender}» — має бути одна з ${GENDERS.join(', ')}`);
  if (fb === null) {
    for (const band of form.age) {
      if (band.toLowerCase() !== 'all' && !(AGE_BANDS as readonly string[]).includes(band)) errors.push(`вікової групи «${band}» немає; є: All, ${AGE_BANDS.join(', ')}`);
    }
  } else {
    if (fb.launch_time !== null && !isTime(fb.launch_time)) errors.push(`час старту «${fb.launch_time}» — має бути ГГ:ХХ, як 00:00`);
    const ages = [fb.age_from, fb.age_to];
    if (!ages.every(a => Number.isInteger(a) && a >= FB_AGE_MIN && a <= FB_AGE_MAX) || fb.age_from > fb.age_to) {
      errors.push(`вік від ${fb.age_from} до ${fb.age_to} — Facebook бере від ${FB_AGE_MIN} до ${FB_AGE_MAX}+, «від» не більше «до»`);
    }
    if (!(PERFORMANCE_GOALS as readonly string[]).includes(fb.performance_goal)) errors.push(`цілі «${fb.performance_goal}» немає`);
    if (!(BID_STRATEGIES as readonly string[]).includes(fb.bid_strategy)) errors.push(`стратегії «${fb.bid_strategy}» немає — Bid Cap, Cost per result goal або Lowest cost`);
    if (!(PLACEMENTS as readonly string[]).includes(fb.placements)) errors.push(`плейсментів «${fb.placements}» немає — Advantage+ або Facebook Only`);
  }
  const headline = form.headline.trim();
  if (headline === '') errors.push('headline порожній');
  const primary = onFacebook ? form.primary_text.trim() : '';
  if (files.length === 0) errors.push('немає жодного креативу');
  for (const f of files) if (mediaOf(f.name) === null) errors.push(`${f.name} — не mp4 і не картинка jpg, png чи webp`);
  const site = post?.site_id ?? 0;
  if (post !== undefined && !(site > 0)) errors.push(`у статті «${post.title}» немає сайту`);
  if (errors.length > 0) return { ok: false, errors };

  warnings.push(...campaignWarnings(form.campaigns, capped));
  if (form.end_date !== null) warnings.push('формат end_date у запиті TSP не звірений з дампами — перевірте профіль на платформі після заливу');
  if (!onFacebook && files.some(f => mediaOf(f.name)!.media_type === 'Image')) {
    warnings.push(TIKTOK_IMAGE_WARNING);
  }

  const topicId = snapshot.topic.id;
  const steps: LaunchStep[] = [];
  const reused: Reused = { creatives: [], headline: null, tsps: [] };

  // -- creatives: what the topic holds under the upload name, or by its bytes under any name — of either source, as the
  //    platform drops repeated bytes whoever sent them — is reused; the same bytes twice — a render and its copy dropped
  //    from disk, say — go up once, under the first name they came by.
  const media = snapshot.creatives.filter(c => c.media_type !== 'Headline');
  const refs: CreativeRef[] = [];
  const seen = new Map<string, 'Video' | 'Image'>();
  let reusedOtherSource = false;
  for (const file of files) {
    if (seen.has(file.hash)) continue;
    const kind = mediaOf(file.name)!;
    seen.set(file.hash, kind.media_type);
    const upload = uploadName(file);
    const byName = media.filter(v => v.original_filename === upload).sort((x, y) => y.id - x.id)[0];
    const held = byName?.id ?? snapshot.heldByDigest?.[file.hash];
    if (held !== undefined) {
      const entry = media.find(c => c.id === held);
      if (entry?.traffic_sources != null && !entry.traffic_sources.includes(form.source)) reusedOtherSource = true;
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
      mime: kind.mime,
      body: {
        grade: 'New', language: 'All', ...(kind.media_type === 'Video' ? { ad_script: file.script.trim() } : {}), media_type: kind.media_type,
        traffic_sources: [form.source], topic_ids: [topicId], countries: countryNames,
      },
    });
  }
  if (fb !== null) warnings.push(uncheckedOnFacebook(fb, reusedOtherSource));

  // -- headline: one per text per topic and source — and on Facebook per primary text; a list that does not say rules nothing out.
  const held = snapshot.creatives
    .filter(c => c.media_type === 'Headline' && markedFor(c, form.source) && headlineText(c.headline) === headline)
    .filter(c => c.primary_text == null || headlineText(c.primary_text) === primary)
    .sort((x, y) => x.id - y.id)[0];
  const primarySaid = primary === '' ? '' : ` · primary text «${primary}»`;
  let headlineRef: CreativeRef;
  if (held !== undefined) {
    headlineRef = held.id;
    reused.headline = held.id;
  } else {
    headlineRef = { headline };
    steps.push({
      kind: 'headline.create',
      label: `створити headline «${headline}»${primarySaid}`,
      text: headline,
      body: {
        grade: 'Strong', countries: countryNames, headlines: [headlineHtml(headline, form.source)],
        primary_texts: [primary === '' ? '' : headlineHtml(primary, form.source)], descriptions: [''],
        language: 'All', source: form.source, topic_ids: [topicId],
      },
    });
  }

  // -- profiles: one per budget and bid — per budget without a cap; one of the source with the same fields is the same profile.
  const start = startText(form);
  const startSaid = start === '' ? '' : `, ${start}`;
  const bidSaid = (c: Pick<LaunchCampaign, 'bid'>): string => (capped ? `бід ${c.bid}` : 'без капу');
  const found: string[] = [];
  const tspRefs = new Map<string, TspRef>();
  const shared: Omit<TspFields, 'budget' | 'bid'> = fb === null
    ? {
      source: 'tiktok',
      facebook: null,
      location: countryNames,
      language: language!,
      gender: gender!,
      age: allOnly(form.age),
      devices: allOnly(form.devices),
      os: form.os.some(v => v.toLowerCase() === 'all') || form.os.length === 0 ? [] : [...form.os].sort(),
      launch_tomorrow: form.launch_tomorrow,
      end_date: form.end_date,
      scheduled: false,
    }
    : {
      source: 'facebook',
      facebook: { ...fb },
      location: countryNames,
      language: language!,
      gender: gender!,
      age: ['All'],
      devices: ['All'],
      os: [],
      launch_tomorrow: false,
      end_date: form.end_date,
      scheduled: false,
    };
  for (const c of campaigns) {
    const key = tspKey(c, capped);
    if (tspRefs.has(key)) continue;
    const fields: TspFields = { budget: c.budget, bid: c.bid, ...shared };
    const alike = snapshot.tsps.filter(t => sameTsp(t.fields, fields)).sort((x, y) => x.id - y.id)[0];
    if (alike !== undefined) {
      tspRefs.set(key, alike.id);
      reused.tsps.push(alike.id);
      found.push(`TSP знайдено (${alike.id}): ${geo}, бюджет ${c.budget}, ${bidSaid(c)}${startSaid}`);
      continue;
    }
    tspRefs.set(key, { tsp: key });
    steps.push({
      kind: 'tsp.create',
      label: `створити TSP (${geo}, бюджет ${c.budget}, ${bidSaid(c)}${startSaid})`,
      key,
      fields,
      body: tspBody(topicId, fields),
    });
  }

  // -- builders: a row each, always new, always last.
  const images = [...seen.values()].filter(k => k === 'Image').length;
  const counted = images === 0 ? `${seen.size} креативів` : creativesCount(seen.size - images, images);
  for (const [i, c] of campaigns.entries()) {
    steps.push({
      kind: 'builder.create',
      label: `кампанія ${i + 1}/${campaigns.length}: ${c.account.name}, бюджет ${c.budget}, ${bidSaid(c)} (${geo}, ${termGroup!.name} + ${post!.title}, ${counted})`,
      campaign: i,
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
        pixel_id: String(c.pixel.id),
        page_id: c.page === undefined ? null : String(c.page.id),
        traffic_source: form.source,
        traffic_source_profile_ids: [tspRefs.get(tspKey(c, capped))!],
        creative_repo_ids: [headlineRef, ...refs],
        term_group_ids: [termGroup!.id],
        ad_account_ids: [String(c.account.id)],
        use_ad_title_as_referrer_ad_text: '0',
        use_keyword_rotation: form.keyword_rotation ? '1' : '0',
        themes: [String(theme!.id)],
      },
    });
  }

  return {
    ok: true,
    steps,
    reused,
    found: [
      ...reused.creatives.map(c => `${c.file} — уже в топіку (${c.id}), не вантажу`),
      ...(reused.headline === null ? [] : [`headline «${headline}»${primarySaid} — знайдено в топіку (${reused.headline})`]),
      ...found,
    ],
    warnings,
  };
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
