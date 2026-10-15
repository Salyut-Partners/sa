// The platform (digifor) as a launch sees it: what its reads answer, the bodies
// its writes take, and the few rules for comparing one with another — two
// spellings of a headline, two profiles with the same fields. Types and pure
// helpers only; `server/platform.ts` does the asking, `quick-launch.ts` the
// deciding.

// ------------------------------------------------------------- sources --

export const TRAFFIC_SOURCES = ['tiktok', 'facebook'] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];
export const isTrafficSource = (value: unknown): value is TrafficSource =>
  typeof value === 'string' && (TRAFFIC_SOURCES as readonly string[]).includes(value);

// --------------------------------------------------------------- reads --

export interface PlatformTopic { id: number; name: string; internal_name: string; user_id: number }
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
/** A post as its detail answers: the list's fields, the HTML, and the slug the platform made of the title. */
export interface PlatformPostDetail extends PlatformPost {
  description: string;
  slug: string;
}
export interface Country { name: string; code: string }

export interface PlatformCreative {
  id: number;
  /** `Video`, `Image` or `Headline`. */
  media_type: string;
  original_filename: string | null;
  /** The headline's HTML, for a `Headline` entry. */
  headline: string | null;
  status: string;
  ad_script: string | null;
  /** Where the platform serves the file — what tells a file it holds under another name by its bytes. Null for a headline. */
  file_url?: string | null;
  /**
   * The sources the entry is marked with. Null where the list does not say —
   * then nothing is ruled out. Whether the list says is not checked on a live
   * read yet.
   */
  traffic_sources?: string[] | null;
  /** A headline's primary text as HTML, where the list gives it; null where it does not — then any text matches. */
  primary_text?: string | null;
}

/** Whether an entry may be reused for a source: marked with it, or marked with nothing the list says. */
export const markedFor = (c: Pick<PlatformCreative, 'traffic_sources'>, source: TrafficSource): boolean =>
  c.traffic_sources == null || c.traffic_sources.length === 0 || c.traffic_sources.some(s => s.toLowerCase() === source);

export const PERFORMANCE_GOALS = ['MAXIMIZE_NUMBER_OF_CONVERSIONS', 'MAXIMIZE_VALUE_OF_CONVERSIONS'] as const;
export type PerformanceGoal = (typeof PERFORMANCE_GOALS)[number];
/** Bid Cap, where the bid is the cap and the ladder works, and Lowest cost, where there is no bid at all. Cost Cap is not made. */
export const BID_STRATEGIES = ['LOWEST_COST_WITH_BID_CAP', 'LOWEST_COST_WITHOUT_CAP'] as const;
export type BidStrategy = (typeof BID_STRATEGIES)[number];
/** Advantage+ (`advantage`) or Facebook Only — `facebook` is a guess, not yet seen in a dump. */
export const PLACEMENTS = ['advantage', 'facebook'] as const;
export type Placements = (typeof PLACEMENTS)[number];
/** The ages Facebook offers, 65 meaning 65 and over. */
export const FB_AGE_MIN = 18;
export const FB_AGE_MAX = 65;

/** What a Facebook profile sets that a TikTok one does not. Attribution is always 7-1-1 and so not here. */
export interface FacebookSettings {
  performance_goal: PerformanceGoal;
  bid_strategy: BidStrategy;
  placements: Placements;
  age_from: number;
  age_to: number;
  /** Null starts at once; `HH:MM` starts tomorrow at that time of the account. */
  launch_time: string | null;
}

export const hasCap = (fb: Pick<FacebookSettings, 'bid_strategy'> | null): boolean => fb === null || fb.bid_strategy !== 'LOWEST_COST_WITHOUT_CAP';

/** What a buyer sets on a profile, normalised, so two profiles can be compared. */
export interface TspFields {
  /** The source the profile is for: a TikTok profile is never a Facebook one, whatever its numbers. */
  source: TrafficSource;
  /** Facebook's own fields; null on TikTok. On Facebook `age`, `os` and `launch_tomorrow` are not used. */
  facebook: FacebookSettings | null;
  budget: number;
  /** Zero on Facebook without a cap: there is no bid. */
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

/** The review bot's word on one creative of a builder: `compliant` or `non_compliant`, and why. */
export interface ReviewVerdict {
  creative_id: number;
  verdict: string;
  reasons: string[];
}

/** Why the platform turned a builder down: the reasons it ticked, and the reviewer's text. */
export interface Rejection {
  reasons: string[];
  details: string;
}

export interface PlatformBuilder {
  id: number;
  topic_id: number;
  post_id: number;
  pixel_id: number;
  /** The identity (a TikTok page) the ads went out under; null is the cabinet's default. */
  page_id?: number | null;
  /** `APPROVED`, `NOT_APPROVED`, or whatever the review stage spells. */
  status: string;
  /** `tiktok` or `facebook` — the source it was built for. */
  traffic_source: string;
  /** Every creative repo entry it was built with, headline included. */
  creative_ids: number[];
  /** The campaigns the platform made from it — empty until it has. `ad_account` is the platform's id of the cabinet, when the list says. */
  campaigns: { id: number; name: string; term_group_id: number | null; ad_account?: string | null; ad_account_name?: string | null }[];
  /** Why it was turned down, when it was. */
  rejection: Rejection | null;
  /** The bot's verdict per creative, when the bot has run. */
  review: ReviewVerdict[];
  // What the builder was built with, as the buyer-wide list shows it. Absent in reads that do not carry them.
  /** The platform's country name (`Germany`) or `All`. */
  country?: string;
  language?: string;
  rsoc_count?: number;
  keyword_rotation?: boolean;
  /** The theme id. */
  theme?: string | null;
  topic_name?: string;
}

/** What a builder was linked to that the buyer-wide list does not say: its profile, and — before a campaign was made — its term group and cabinet. Off `GET /campaign-builder/<id>`. */
export interface BuilderLinks {
  tsp: number | null;
  term_group: number | null;
  ad_account: string | null;
}

/**
 * A campaign as the platform's campaign list shows it. The list carries no
 * spend, so `spend` is null unless the platform starts sending one.
 */
export interface PlatformCampaign {
  id: number;
  name: string;
  /** `ACTIVE`, `PAUSED`, `PENDING`, `DELETED` as the list spells them. */
  status: string;
  published: boolean;
  revenue: number;
  spend: number | null;
  /** The daily budget and the bid as the list shows them; null when it does not. */
  budget: number | null;
  bid: number | null;
}

/**
 * A business is the source's business center: a cabinet sees only the pixels
 * and identities of its own, so a pixel of another one goes out as no pixel at
 * all. `ad_account_id` is the account the pixel was made under — routinely not
 * the cabinet it is launched from, so it is shown, not checked; the business is.
 * An empty business is one the platform did not say.
 */
export interface Pixel {
  id: number;
  name: string;
  /**
   * The source's own id of the pixel. On Facebook one pixel is a row per
   * cabinet that holds it, all with this id — which row a campaign gets is the
   * one bound to its cabinet. Empty where the list does not carry it.
   */
  ad_pixel_id: string;
  ad_account_id: string;
  business_id: string;
}
export interface AdAccount { id: number; name: string; account_id: string; business_id: string }
/** An identity the ads can go out under — «Good Life» — instead of the cabinet's default. */
export interface Page { id: number; name: string; business_id: string }
export interface Theme { id: number; key: string; title: string }

// -------------------------------------------------------------- writes --

/** A creative id known now, or the one a launch uploads from that file — or the headline it makes. */
export type CreativeRef = number | { file: string } | { headline: string };
/** A profile id known now, or the one the launch creates under this key — one per budget and bid. */
export type TspRef = number | { tsp: string };

/** An image goes up without a script: the field is not sent at all. */
export interface UploadBody {
  grade: 'New';
  language: string;
  ad_script?: string;
  media_type: 'Video' | 'Image';
  traffic_sources: string[];
  topic_ids: number[];
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
  topic_ids: number[];
}

export type TspBody = TiktokTspBody | FacebookTspBody;

export interface TiktokTspBody {
  topic_id: number;
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

/** A day of the schedule as the Facebook form sends it; none ticked is no schedule. */
export interface ScheduleDay { day: string; from: null; to: null; checked: false }

/**
 * A profile as the admin's Facebook form sends it. Start now is `launch_time:
 * null` and no `launch_type`; tomorrow is `launch_type: "tomorrow"` and the
 * time. `bid` goes as text under Bid Cap, as on TikTok — the dump was taken
 * without a cap, so that is not checked yet — and not at all without one.
 */
export interface FacebookTspBody {
  topic_id: number;
  traffic_source: 'facebook';
  acb: 0;
  acb_budget_type: '';
  acb_schedule: 0;
  budget_type: 'Daily Budget';
  schedule: ScheduleDay[];
  schedule_time_zone: '';
  start_date: '';
  lunch_tomorrow: 0;
  dynamic_creative: 0;
  quantity: 1;
  pixel_attribution: '7-1-1';
  devices: ['All'];
  device_os: null;
  performance_goal: PerformanceGoal;
  bid_strategy: BidStrategy;
  budget: number;
  bid?: string;
  age_from: string;
  age_to: string;
  gender: string;
  location: string[];
  language: string;
  placements: Placements;
  end_date: 0 | string;
  launch_type?: 'tomorrow';
  launch_time: string | null;
}

export interface BuilderBody {
  topic_id: number;
  country: string;
  site_id: string;
  post_id: number;
  language: string;
  monetization_type: 'RSOC';
  rsoc_count: string;
  conversion_event_type: 'Purchase';
  pixel_id: string;
  /** The identity's id, or null for the cabinet's default — then the field is not sent at all. */
  page_id: string | null;
  traffic_source: string;
  traffic_source_profile_ids: TspRef[];
  creative_repo_ids: CreativeRef[];
  term_group_ids: number[];
  ad_account_ids: string[];
  use_ad_title_as_referrer_ad_text: '0';
  use_keyword_rotation: '0' | '1';
  themes: string[];
}

// ------------------------------------------------------------ headline --

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', szlig: 'ß' };

const decodeEntities = (text: string): string => text
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);

/** The words of a headline as stored — markup off, entities decoded, whitespace folded — so two spellings of one headline compare equal. */
export function headlineText(html: string | null): string {
  if (html === null) return '';
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A text of the headline as the admin's editor sends it: one bold paragraph on TikTok, a plain one on Facebook. */
export const headlineHtml = (text: string, source: TrafficSource): string =>
  source === 'facebook' ? `<p>${escapeHtml(text.trim())}</p>` : `<p><strong>${escapeHtml(text.trim())}</strong></p>`;

/** An article's HTML as text to read: a paragraph, heading or list item per line, markup off. */
export function articleText(html: string): string {
  return decodeEntities(html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\/\s*(p|h[1-6]|div|ul|ol)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ----------------------------------------------------------------- TSP --

export const AGE_BANDS = ['13-17', '18-24', '25-34', '35-44', '45-54', '55+'] as const;
export const GENDERS = ['All', 'Male', 'Female'] as const;

const sortedList = (list: readonly string[]): string[] => [...list].map(s => s.trim()).sort();

/** A value as text with every object's keys in order, so two profiles built in another order compare equal. */
const sortedJson = (v: unknown): string => JSON.stringify(v, (_, x: unknown) => (typeof x === 'object' && x !== null && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

const canon = (f: TspFields): string => sortedJson({
  ...f, location: sortedList(f.location), age: sortedList(f.age), devices: sortedList(f.devices), os: sortedList(f.os),
});

/** Whether two profiles set the same things — the source among them; the order of a list is not a difference. */
export const sameTsp = (a: TspFields, b: TspFields): boolean => canon(a) === canon(b);

/** The grid the admin sends beside an empty schedule: nine rows of twenty-four, none ticked. */
const emptyScheduleCells = (): boolean[][] => Array.from({ length: 9 }, () => Array.from({ length: 24 }, () => false));

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A profile as the admin's form for its source sends it. */
export function tspBody(topicId: number, fields: TspFields): TspBody {
  return fields.facebook === null ? tiktokTspBody(topicId, fields) : facebookTspBody(topicId, fields, fields.facebook);
}

function facebookTspBody(topicId: number, fields: TspFields, fb: FacebookSettings): FacebookTspBody {
  return {
    topic_id: topicId,
    traffic_source: 'facebook',
    acb: 0,
    acb_budget_type: '',
    acb_schedule: 0,
    budget_type: 'Daily Budget',
    schedule: WEEK.map(day => ({ day, from: null, to: null, checked: false })),
    schedule_time_zone: '',
    start_date: '',
    lunch_tomorrow: 0,
    dynamic_creative: 0,
    quantity: 1,
    pixel_attribution: '7-1-1',
    devices: ['All'],
    device_os: null,
    performance_goal: fb.performance_goal,
    bid_strategy: fb.bid_strategy,
    budget: fields.budget,
    ...(hasCap(fb) ? { bid: String(fields.bid) } : {}),
    age_from: String(fb.age_from),
    age_to: String(fb.age_to),
    gender: fields.gender,
    location: fields.location,
    language: fields.language,
    placements: fb.placements,
    end_date: fields.end_date ?? 0,
    ...(fb.launch_time === null ? {} : { launch_type: 'tomorrow' as const }),
    launch_time: fb.launch_time,
  };
}

function tiktokTspBody(topicId: number, fields: TspFields): TiktokTspBody {
  return {
    topic_id: topicId,
    traffic_source: fields.source,
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

// ----------------------------------------------------------- read-back --

/**
 * The id of the file just uploaded: the entries the list holds now that it
 * did not hold before, by `original_filename`. Two new entries under one name
 * — a retry the platform took twice — are both ours, so the newest is taken.
 */
export function uploadedId(before: readonly number[], after: readonly PlatformCreative[], name: string): number | null {
  const own = after.filter(c => c.media_type !== 'Headline' && !before.includes(c.id) && c.original_filename === name).map(c => c.id);
  return own.length === 0 ? null : Math.max(...own);
}

export const sameSet = (a: readonly number[], b: readonly number[]): boolean => {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

// -------------------------------------------------------------- lookups --

export const findTheme = (themes: readonly Theme[], wanted: string): Theme | undefined => {
  const fold = wanted.trim().toLowerCase();
  return themes.find(t => String(t.id) === fold) ?? themes.find(t => t.key.toLowerCase() === fold) ?? themes.find(t => t.title.toLowerCase() === fold);
};

export const findLanguage = (languages: readonly string[], wanted: string): string | undefined => {
  const fold = wanted.trim().toLowerCase();
  if (fold === 'all') return 'All';
  return languages.find(l => l.toLowerCase() === fold);
};

/** `All`, a two-letter code, or a name in any case — into the name the platform stores. */
export function resolveCountry(value: string, countries: readonly Country[]): { ok: true; value: string } | { ok: false; errors: string[] } {
  const wanted = value.trim();
  if (wanted.toLowerCase() === 'all') return { ok: true, value: 'All' };
  const fold = wanted.toLowerCase();
  const found = countries.find(c => c.code.toLowerCase() === fold) ?? countries.find(c => c.name.toLowerCase() === fold);
  if (found === undefined) return { ok: false, errors: [`країни \`${wanted}\` немає в довіднику платформи (код DE або назва Germany)`] };
  return { ok: true, value: found.name };
}

// ------------------------------------------------------------- parsing --
// What the platform answers, read into the types above. Here rather than in
// the client so it can be tested against cut-down dumps.

export const bag = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
export const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));
export const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** The list under `key`, or the body itself when it is the list. */
export const listOf = (body: unknown, key: string): unknown[] => {
  const b = bag(body);
  return Array.isArray(b[key]) ? b[key] : Array.isArray(body) ? body : [];
};

/** A JSON list the platform stores as text (`age_from`), or as a list, or as one word. */
const listField = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(str);
  if (typeof v === 'string' && v.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(str) : [];
    } catch {
      return [];
    }
  }
  return v == null || v === '' ? [] : [str(v)];
};

/** The schedule is a row per day with `checked`; a row of unticked days is what the admin sends for none. */
const anyDayTicked = (v: unknown): boolean => {
  let rows: unknown = v;
  if (typeof v === 'string') {
    try {
      rows = JSON.parse(v);
    } catch {
      return false;
    }
  }
  return Array.isArray(rows) && rows.some(r => bag(r)['checked'] === true);
};

const oneOf = <T extends string>(options: readonly T[], v: unknown, otherwise: T): T =>
  (options as readonly string[]).includes(str(v)) ? (str(v) as T) : otherwise;

const age = (v: unknown, otherwise: number): number => {
  const n = Number.parseInt(str(v), 10);
  return Number.isInteger(n) ? n : otherwise;
};

/**
 * A profile off the list or its own page. A Facebook one carries its source
 * and its own fields — its `device_os` (`ALL`) is not the buyer's and is left
 * out; a profile that does not say its source is TikTok's, as all were before.
 */
export function parseTsp(raw: unknown): PlatformTsp {
  const t = bag(raw);
  const endDate = str(t['end_date'] ?? '');
  const common = {
    budget: num(t['budget']),
    location: listField(t['location']),
    language: str(t['language'] ?? 'All'),
    gender: str(t['gender'] ?? 'All'),
    devices: listField(t['devices']).length === 0 ? ['All'] : listField(t['devices']),
    end_date: endDate === '' || endDate === '0' ? null : endDate,
    scheduled: anyDayTicked(t['schedule']),
  };
  const head = { id: num(t['id']), name: str(t['name']), topic_id: num(t['topic_id']) };
  if (str(t['traffic_source']).toLowerCase() === 'facebook') {
    const time = str(t['launch_time']);
    const facebook: FacebookSettings = {
      performance_goal: oneOf(PERFORMANCE_GOALS, t['performance_goal'], 'MAXIMIZE_NUMBER_OF_CONVERSIONS'),
      bid_strategy: oneOf(BID_STRATEGIES, t['bid_strategy'], 'LOWEST_COST_WITH_BID_CAP'),
      placements: oneOf(PLACEMENTS, t['placements'], 'advantage'),
      age_from: age(t['age_from'], FB_AGE_MIN),
      age_to: age(t['age_to'], FB_AGE_MAX),
      launch_time: str(t['launch_type']).toLowerCase() === 'tomorrow' && time !== '' ? time : null,
    };
    return {
      ...head,
      fields: {
        source: 'facebook', facebook, ...common, bid: hasCap(facebook) ? num(t['bid']) : 0,
        age: ['All'], os: [], launch_tomorrow: false,
      },
    };
  }
  return {
    ...head,
    fields: {
      source: 'tiktok', facebook: null, ...common,
      bid: num(t['bid']),
      age: listField(t['age_from']).length === 0 ? ['All'] : listField(t['age_from']),
      os: listField(t['device_os']),
      launch_tomorrow: num(t['lunch_tomorrow'] ?? 0) === 1,
    },
  };
}

/** Pages (FB) or identities (TikTok) by name and business; a page the platform links to no business has an unknown one, and an inactive page is not offered. */
export function parsePages(body: unknown): Page[] {
  return listOf(body, 'pages')
    .map(bag)
    .filter(p => p['is_active'] === undefined || num(p['is_active']) !== 0)
    .map(p => ({ id: num(p['id']), name: str(p['page_name']), business_id: str(p['business_id'] ?? '') }))
    .filter(p => p.id > 0);
}

export function parsePixels(body: unknown): Pixel[] {
  return listOf(body, 'pixels').map(raw => {
    const p = bag(raw);
    return {
      id: num(p['id']), name: str(p['name']), ad_pixel_id: str(p['ad_pixel_id'] ?? ''),
      ad_account_id: str(p['ad_account_id']), business_id: str(p['business_id'] ?? ''),
    };
  });
}

/** Every creative repo entry of the list: videos, images and headlines. */
export function parseCreatives(body: unknown): PlatformCreative[] {
  return listOf(body, 'creativeRepos').map(raw => {
    const c = bag(raw);
    const sources = c['traffic_sources'] ?? c['traffic_source'];
    const primary = c['primary_text'] ?? (Array.isArray(c['primary_texts']) ? c['primary_texts'][0] : c['primary_texts']);
    return {
      id: num(c['id']),
      media_type: str(c['media_type']),
      original_filename: c['original_filename'] == null ? null : str(c['original_filename']),
      headline: c['headline'] == null ? null : str(c['headline']),
      status: str(c['status']),
      ad_script: c['ad_script'] == null ? null : str(c['ad_script']),
      file_url: c['file_path_url'] == null || c['file_path_url'] === '' ? null : str(c['file_path_url']),
      traffic_sources: sources == null || sources === '' ? null : listField(sources).map(s => s.toLowerCase()),
      primary_text: primary == null ? null : str(primary),
    };
  });
}
