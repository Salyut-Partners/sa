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
  /** `Video` or `Headline`. */
  media_type: string;
  original_filename: string | null;
  /** The headline's HTML, for a `Headline` entry. */
  headline: string | null;
  status: string;
  ad_script: string | null;
  /** Where the platform serves the file — what tells a file it holds under another name by its bytes. Null for a headline. */
  file_url?: string | null;
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
export interface Pixel { id: number; name: string; ad_account_id: string; business_id: string }
export interface AdAccount { id: number; name: string; account_id: string; business_id: string }
/** An identity the ads can go out under — «Good Life» — instead of the cabinet's default. */
export interface Page { id: number; name: string; business_id: string }
export interface Theme { id: number; key: string; title: string }

// -------------------------------------------------------------- writes --

/** A creative id known now, or the one a launch uploads from that file — or the headline it makes. */
export type CreativeRef = number | { file: string } | { headline: string };
/** A profile id known now, or the one the launch creates. */
export type TspRef = number | 'new';

export interface UploadBody {
  grade: 'New';
  language: string;
  ad_script: string;
  media_type: 'Video';
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

export interface TspBody {
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

/** The headline as the admin's editor sends it: one bold paragraph. */
export const headlineHtml = (text: string): string => `<p><strong>${escapeHtml(text.trim())}</strong></p>`;

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

const canon = (f: TspFields): string => JSON.stringify({
  ...f, location: sortedList(f.location), age: sortedList(f.age), devices: sortedList(f.devices), os: sortedList(f.os),
});

/** Whether two profiles set the same things — the order of a list is not a difference. */
export const sameTsp = (a: TspFields, b: TspFields): boolean => canon(a) === canon(b);

/** The grid the admin sends beside an empty schedule: nine rows of twenty-four, none ticked. */
const emptyScheduleCells = (): boolean[][] => Array.from({ length: 9 }, () => Array.from({ length: 24 }, () => false));

/** A profile as the admin's form sends it. */
export function tspBody(source: string, topicId: number, fields: TspFields): TspBody {
  return {
    topic_id: topicId,
    traffic_source: source,
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
  const own = after.filter(c => c.media_type === 'Video' && !before.includes(c.id) && c.original_filename === name).map(c => c.id);
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
