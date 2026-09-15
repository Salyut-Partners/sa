// The digifor client. Thin: the request form as the admin sends it — Bearer,
// `organization_id` in the query, JSON or multipart — and one typed helper per
// call the chain makes. No decisions live here: what to send is the plan's,
// what to do when the platform does not answer is the queue policy's.
//
// Every call answers an `Outcome` rather than throwing, because the policy in
// `core/queue.ts` reads outcomes: a timeout is a fact to reason about, not an
// exception to unwind.
import type { AdjustBody } from '../core/adjust.ts';
import type { BuilderLinks } from '../core/adopt.ts';
import type {
  AdAccount, HeadlineBody, PauseBody, Pixel, PlatformBuilder, PlatformCampaign, PlatformCreative, PlatformTsp, Rejection, ReviewVerdict,
  Theme, TspBody, TspFields,
} from '../core/campaign-plan.ts';
import type {
  Country, PlatformConfiguration, PlatformPost, PlatformPostDetail, PlatformTermGroup, PlatformTopic, Site, TermGroupBody,
} from '../core/plan.ts';
import type { PlatformRule, RuleAction, RuleCondition, RuleCreateBody, RuleLimitsBody } from '../core/rules.ts';
import type { SaConfig } from './config.ts';

/** How long one call may take before it is treated as unanswered. Posts are text; a video upload gets its own. */
const TIMEOUT_MS = 30_000;
/** A creative is a few megabytes over a home connection. */
const UPLOAD_TIMEOUT_MS = 180_000;

export type PlatformReady = { ready: true; token: string; organizationId: number; baseUrl: string };
export type PlatformState = PlatformReady | { ready: false; note: string };

export function platformState(config: SaConfig): PlatformState {
  const { token, organization_id: organizationId, base_url: baseUrl } = config.platform;
  if (token === null && organizationId === null) {
    return { ready: false, note: 'у конфігурації немає platform.token і platform.organization_id — платформа недоступна' };
  }
  if (token === null) return { ready: false, note: 'у конфігурації немає platform.token — платформа недоступна' };
  if (organizationId === null) return { ready: false, note: 'у конфігурації немає platform.organization_id — платформа недоступна' };
  return { ready: true, token, organizationId, baseUrl };
}

/** What one call came back as. `body` is the parsed JSON when there was any. */
export type Answer =
  | { status: 'ok'; code: number; body: unknown }
  | { status: 'error'; code: number; body: unknown; text: string }
  | { status: 'timeout' };

export class PlatformClient {
  constructor(private readonly state: PlatformReady) {}

  private url(path: string, query: Record<string, string | number> = {}): string {
    const params = new URLSearchParams({ organization_id: String(this.state.organizationId) });
    for (const [key, value] of Object.entries(query)) params.set(key, String(value));
    return `${this.state.baseUrl}${path}?${params.toString()}`;
  }

  /** The headers the admin sends; the platform may well look at them. */
  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.state.token}`,
      accept: 'application/json',
      origin: 'https://admin.digifor.io',
      referer: 'https://admin.digifor.io/',
    };
  }

  async call(
    method: string, path: string, query: Record<string, string | number>, body?: BodyInit, contentType?: string, timeoutMs = TIMEOUT_MS,
  ): Promise<Answer> {
    const headers = this.headers();
    if (contentType !== undefined) headers['content-type'] = contentType;
    let response: Response;
    try {
      response = await fetch(this.url(path, query), {
        method, headers, ...(body === undefined ? {} : { body }), signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // A network that dropped mid-request is as uncertain as a timeout: the
      // request may have arrived.
      return { status: 'timeout' };
    }
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text === '' ? null : JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (response.ok) return { status: 'ok', code: response.status, body: parsed };
    return { status: 'error', code: response.status, body: parsed, text: text.slice(0, 300) };
  }

  get(path: string, query: Record<string, string | number> = {}): Promise<Answer> {
    return this.call('GET', path, query);
  }

  postJson(path: string, body: unknown): Promise<Answer> {
    return this.call('POST', path, {}, JSON.stringify(body), 'application/json');
  }

  putJson(path: string, body: unknown): Promise<Answer> {
    return this.call('PUT', path, {}, JSON.stringify(body), 'application/json');
  }

  /** Multipart the way the admin's forms send it: a list field is one part per item under `name[]`. */
  postForm(path: string, fields: Record<string, string | string[]>, file?: { field: string; name: string; bytes: Buffer; mime: string }): Promise<Answer> {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      if (Array.isArray(value)) for (const item of value) form.append(name.endsWith('[]') ? name : `${name}[]`, item);
      else form.append(name, value);
    }
    if (file === undefined) return this.call('POST', path, {}, form);
    form.append(file.field, new Blob([new Uint8Array(file.bytes)], { type: file.mime }), file.name);
    return this.call('POST', path, {}, form, undefined, UPLOAD_TIMEOUT_MS);
  }
}

// ---------------------------------------------------------------- reads --

/** A read that must succeed to go on: the sentence names the call that did not. */
export class PlatformReadError extends Error {}

const bag = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

function need(answer: Answer, what: string): unknown {
  if (answer.status === 'ok') return answer.body;
  const why = answer.status === 'timeout' ? 'не відповіла вчасно' : `відповіла ${answer.code}: ${answer.text}`;
  throw new PlatformReadError(`платформа ${why} на ${what}`);
}

const toTopic = (raw: unknown): PlatformTopic => {
  const t = bag(raw);
  return { id: num(t['id']), name: str(t['name']), internal_name: str(t['internal_name']), user_id: num(t['user_id'] ?? 0) };
};

/** Every topic whose name or internal name the platform's search matches. */
export async function searchTopics(client: PlatformClient, search: string): Promise<PlatformTopic[]> {
  const body = bag(need(await client.get('/topics', { pageId: 1, limit: 100, search }), 'GET /topics'));
  return (Array.isArray(body['topics']) ? body['topics'] : []).map(toTopic);
}

export async function readTopic(client: PlatformClient, id: number): Promise<PlatformTopic | null> {
  const answer = await client.get(`/topics/${id}`);
  if (answer.status === 'error' && answer.code === 404) return null;
  const body = bag(need(answer, `GET /topics/${id}`));
  return body['topic'] === undefined ? null : toTopic(body['topic']);
}

export async function readConfigurations(client: PlatformClient, topicId: number): Promise<PlatformConfiguration[]> {
  const body = bag(need(await client.get(`/topics/${topicId}/configurations`), `GET /topics/${topicId}/configurations`));
  return (Array.isArray(body['configurations']) ? body['configurations'] : []).map(raw => {
    const c = bag(raw);
    return {
      id: num(c['id']), name: str(c['name']), topic_id: num(c['topic_id']),
      country: str(c['country']), traffic_source: str(c['traffic_source']),
    };
  });
}

export async function readTermGroups(client: PlatformClient, topicId: number): Promise<PlatformTermGroup[]> {
  const body = bag(need(await client.get(`/topics/${topicId}/term-groups`), `GET /topics/${topicId}/term-groups`));
  return (Array.isArray(body['termGroups']) ? body['termGroups'] : []).map(raw => {
    const g = bag(raw);
    return {
      id: num(g['id']), name: str(g['name']),
      terms: Array.isArray(g['terms']) ? g['terms'].map(str) : [],
      weight: num(g['weight'] ?? 0), country: str(g['country'] ?? 'All'), language: str(g['language'] ?? 'All'),
    };
  });
}

export async function readPosts(client: PlatformClient, topicId: number): Promise<PlatformPost[]> {
  const body = bag(need(await client.get('/posts', { post_type: 'Monetized', topic_id: topicId }), 'GET /posts'));
  return (Array.isArray(body['posts']) ? body['posts'] : []).map(raw => {
    const p = bag(raw);
    return {
      id: num(p['id']), title: str(p['title']), status: str(p['status']), site_id: num(p['site_id']),
      country: Array.isArray(p['country']) ? p['country'].map(str) : [str(p['country'] ?? 'All')],
      language: str(p['language'] ?? 'All'),
      topic_ids: (Array.isArray(p['topics']) ? p['topics'] : []).map(t => num(bag(t)['id'])),
    };
  }).filter(p => p.topic_ids.includes(topicId));
}

/** One post whole: the list may carry the description too, but the detail is what the admin's editor opens, and it always does. */
export async function readPost(client: PlatformClient, id: number): Promise<PlatformPostDetail | null> {
  const answer = await client.get(`/posts/${id}`);
  if (answer.status === 'error' && answer.code === 404) return null;
  const body = bag(need(answer, `GET /posts/${id}`));
  if (body['post'] === undefined) return null;
  const p = bag(body['post']);
  return {
    id: num(p['id']), title: str(p['title']), status: str(p['status']), site_id: num(p['site_id']),
    country: Array.isArray(p['country']) ? p['country'].map(str) : [str(p['country'] ?? 'All')],
    language: str(p['language'] ?? 'All'),
    topic_ids: (Array.isArray(p['topics']) ? p['topics'] : []).map(t => num(bag(t)['id'])),
    description: str(p['description'] ?? ''),
    slug: str(p['slug'] ?? ''),
  };
}

export async function readCountries(client: PlatformClient): Promise<Country[]> {
  const body = bag(need(await client.get('/countries'), 'GET /countries'));
  return (Array.isArray(body['countries']) ? body['countries'] : []).map(raw => {
    const c = bag(raw);
    return { name: str(c['name']), code: str(c['country_code']) };
  });
}

export async function readSites(client: PlatformClient): Promise<Site[]> {
  const body = bag(need(await client.get('/sites'), 'GET /sites'));
  return (Array.isArray(body['sites']) ? body['sites'] : []).map(raw => {
    const s = bag(raw);
    return { id: num(s['id']), url: str(s['url']) };
  });
}

const listOf = (body: unknown, key: string): unknown[] => {
  const b = bag(body);
  return Array.isArray(b[key]) ? b[key] : Array.isArray(body) ? body : [];
};

// -- the directories the builder is filled from

export async function readPixels(client: PlatformClient, trafficSource: string): Promise<Pixel[]> {
  const body = need(await client.get('/pixels', { traffic_source: trafficSource }), 'GET /pixels');
  return listOf(body, 'pixels').map(raw => {
    const p = bag(raw);
    return { id: num(p['id']), name: str(p['name']), ad_account_id: str(p['ad_account_id']) };
  });
}

export async function readAdAccounts(client: PlatformClient, siteId: number, trafficSource: string): Promise<AdAccount[]> {
  const body = need(await client.get('/facebook/ad-accounts', { site_id: siteId, traffic_source: trafficSource }), 'GET /facebook/ad-accounts');
  return listOf(body, 'adAccounts').map(raw => {
    const a = bag(raw);
    return { id: num(a['id']), name: str(a['account_name'] ?? a['internal_account_name']), account_id: str(a['account_id']) };
  });
}

export async function readThemes(client: PlatformClient): Promise<Theme[]> {
  const body = need(await client.get('/themes', { version: 'v1' }), 'GET /themes');
  return listOf(body, 'themes').map(raw => {
    const t = bag(raw);
    return { id: num(t['id']), key: str(t['key']), title: str(t['title']) };
  });
}

export async function readRsocCounts(client: PlatformClient): Promise<number[]> {
  const body = need(await client.get('/rsoc-counts'), 'GET /rsoc-counts');
  return listOf(body, 'rsocCounts').map(num).filter(n => Number.isInteger(n));
}

export async function readLanguages(client: PlatformClient): Promise<string[]> {
  const body = need(await client.get('/languages'), 'GET /languages');
  return listOf(body, 'languages').map(raw => str(bag(raw)['name'])).filter(n => n !== '');
}

// -- what the topic holds for its campaigns

/** Every creative repo entry attached to the topic, videos and headlines alike. */
export async function readCreatives(client: PlatformClient, topicId: number): Promise<PlatformCreative[]> {
  const body = need(await client.get('/creative-repo', { topic_id: topicId }), 'GET /creative-repo');
  return listOf(body, 'creativeRepos').map(raw => {
    const c = bag(raw);
    return {
      id: num(c['id']),
      media_type: str(c['media_type']),
      original_filename: c['original_filename'] == null ? null : str(c['original_filename']),
      headline: c['headline'] == null ? null : str(c['headline']),
      status: str(c['status']),
      ad_script: c['ad_script'] == null ? null : str(c['ad_script']),
    };
  });
}

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

const toTspFields = (t: Record<string, unknown>): TspFields => {
  const endDate = str(t['end_date'] ?? '');
  return {
    budget: num(t['budget']),
    bid: num(t['bid']),
    location: listField(t['location']),
    language: str(t['language'] ?? 'All'),
    gender: str(t['gender'] ?? 'All'),
    age: listField(t['age_from']).length === 0 ? ['All'] : listField(t['age_from']),
    devices: listField(t['devices']).length === 0 ? ['All'] : listField(t['devices']),
    os: listField(t['device_os']),
    launch_tomorrow: num(t['lunch_tomorrow'] ?? 0) === 1,
    end_date: endDate === '' || endDate === '0' ? null : endDate,
    scheduled: anyDayTicked(t['schedule']),
  };
};

/**
 * The topic's profiles. The list does not filter by topic on its own, but by
 * the buyer it does — and the topic knows its buyer — so the read is the
 * buyer's profiles, narrowed here.
 */
export async function readTsps(client: PlatformClient, topicId: number, userId: number): Promise<PlatformTsp[]> {
  const query = userId > 0 ? { user_id: userId } : {};
  const body = need(await client.get('/traffic-source-profiles', query), 'GET /traffic-source-profiles');
  return listOf(body, 'trafficSourceProfiles').map(raw => {
    const t = bag(raw);
    return { id: num(t['id']), name: str(t['name']), topic_id: num(t['topic_id']), fields: toTspFields(t) };
  }).filter(t => t.topic_id === topicId);
}

/** A JSON list the platform stores as text, or already as a list. Same trap as a TSP's `age_from`. */
const ruleList = (v: unknown): { type: string; operator: string; value: string }[] => {
  let raw: unknown = v;
  if (typeof v === 'string') {
    try {
      raw = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw.map(r => { const b = bag(r); return { type: str(b['type']), operator: str(b['operator']), value: str(b['value']) }; }) : [];
};

const toRule = (raw: unknown): PlatformRule => {
  const r = bag(raw);
  const topicId = r['topic_id'] == null || r['topic_id'] === '' ? null : num(r['topic_id']);
  return {
    id: num(r['id']),
    topic_id: topicId,
    userId: num(r['ad_account_id'] ?? 0),
    conditions: ruleList(r['conditions']) as RuleCondition[],
    actions: ruleList(r['results']) as RuleAction[],
  };
};

/**
 * The buyer's autorules: topic-scoped and general alike, so `plan` can warn
 * about a general one stacking onto the topic's own. The query's own name
 * for the buyer is `ad_account_id` — the same trap the create call has.
 */
export async function readRules(client: PlatformClient, topicId: number, userId: number): Promise<PlatformRule[]> {
  const body = need(await client.get('/campaign-rules', { ad_account_id: userId }), 'GET /campaign-rules');
  return listOf(body, 'campaignRules').map(toRule).filter(r => r.topic_id === null || r.topic_id === topicId);
}

export const createRule = (client: PlatformClient, body: RuleCreateBody): Promise<Answer> =>
  client.postJson('/campaign-rules', body);

/** The limits a create cannot carry; the admin sends the whole body again, with them added. */
export const updateRuleLimits = (client: PlatformClient, id: number, body: RuleLimitsBody): Promise<Answer> =>
  client.putJson(`/campaign-rules/${id}`, body);

/**
 * The bot's verdicts as the builder carries them: one entry per creative,
 * its `id` being `<builder>-<creative_repo_id>-<headline_id>` — the middle
 * number is the creative the verdict is about.
 */
const toReview = (raw: unknown): ReviewVerdict[] => {
  if (!Array.isArray(raw)) return [];
  const verdicts: ReviewVerdict[] = [];
  for (const entry of raw) {
    const v = bag(entry);
    const parts = str(v['id']).split('-');
    const creativeId = parts.length >= 2 ? num(parts[1]) : NaN;
    if (!Number.isInteger(creativeId)) continue;
    verdicts.push({
      creative_id: creativeId,
      verdict: str(v['verdict']),
      reasons: Array.isArray(v['reasons']) ? v['reasons'].map(str) : [],
    });
  }
  return verdicts;
};

const toRejection = (b: Record<string, unknown>): Rejection | null => {
  const reasons = Array.isArray(b['rejection_reasons']) ? b['rejection_reasons'].map(str) : [];
  const details = str(b['additional_rejection_reasons'] ?? '');
  return reasons.length === 0 && details === '' ? null : { reasons, details };
};

export const toBuilder = (raw: unknown): PlatformBuilder => {
  const b = bag(raw);
  return {
    id: num(b['id']),
    topic_id: num(b['topic_id']),
    post_id: num(b['post_id']),
    pixel_id: num(b['pixel_id']),
    status: str(b['status']),
    traffic_source: str(b['traffic_source']),
    creative_ids: (Array.isArray(b['creative_repos']) ? b['creative_repos'] : []).map(c => num(bag(c)['id'])),
    campaigns: (Array.isArray(b['campaigns']) ? b['campaigns'] : []).map(c => {
      const campaign = bag(c);
      return {
        id: num(campaign['id']), name: str(campaign['name']),
        term_group_id: campaign['term_group_id'] == null ? null : num(campaign['term_group_id']),
        // `ad_id` is the platform's id of the cabinet the campaign went out from; `ad_account_id` beside it is the source's own.
        ad_account: campaign['ad_id'] == null ? null : str(campaign['ad_id']),
        ad_account_name: campaign['ad_account_name'] == null ? null : str(campaign['ad_account_name']),
      };
    }),
    rejection: toRejection(b),
    review: toReview(b['review_bot_result']),
    country: str(b['country'] ?? 'All'),
    language: str(b['language'] ?? 'All'),
    rsoc_count: num(b['rsoc_count'] ?? 5),
    keyword_rotation: b['use_keyword_rotation'] === true || num(b['use_keyword_rotation'] ?? 0) === 1,
    theme: Array.isArray(b['themes']) && b['themes'].length > 0 ? str(b['themes'][0]) : null,
    topic_name: str(b['topic_name'] ?? bag(b['topic'])['name'] ?? ''),
  };
};

/** The list is paged; a topic scaled to hundreds of campaigns is read page by page until one comes back short. */
const BUILDER_PAGE = 100;

async function readBuilderPages(client: PlatformClient, query: Record<string, string | number>): Promise<PlatformBuilder[]> {
  const builders: PlatformBuilder[] = [];
  for (let pageId = 0; pageId < 100; pageId++) {
    const body = need(await client.get('/campaign-builder', { ...query, pageId, limit: BUILDER_PAGE }), 'GET /campaign-builder');
    const page = listOf(body, 'campaignBuilders').map(toBuilder);
    builders.push(...page);
    if (page.length < BUILDER_PAGE) break;
  }
  return builders;
}

export async function readBuilders(client: PlatformClient, topicId: number): Promise<PlatformBuilder[]> {
  return (await readBuilderPages(client, { topic_id: topicId })).filter(b => b.topic_id === topicId);
}

/**
 * What one builder was linked to, off its own page (`GET /campaign-builder/<id>`):
 * the profile, and the term group and cabinet — which the list only says once
 * a campaign was made. What an import needs and the list does not carry.
 */
export async function readBuilderLinks(client: PlatformClient, id: number): Promise<BuilderLinks> {
  const body = bag(bag(need(await client.get(`/campaign-builder/${id}`), `GET /campaign-builder/${id}`))['campaignBuilder']);
  const first = (key: string): Record<string, unknown> | null => (Array.isArray(body[key]) && body[key].length > 0 ? bag(body[key][0]) : null);
  const tsp = first('traffic_source_profiles');
  const group = first('term_groups');
  const cabinet = first('ad_accounts');
  return {
    tsp: tsp === null ? null : num(tsp['id']),
    term_group: group === null ? null : num(group['id']),
    ad_account: cabinet === null ? null : str(cabinet['id']),
  };
}

/**
 * Every builder of one buyer, across all their topics, in one read: status,
 * rejection, the bot's verdicts and the campaigns made — what the topic table
 * shows without a request per topic.
 */
export const readBuyerBuilders = (client: PlatformClient, userId: number): Promise<PlatformBuilder[]> =>
  readBuilderPages(client, { user_id: userId });

/**
 * The campaign list is the analytics page: organisation-wide, newest first,
 * a hundred a page, over a date window. It is read only as far as the
 * campaigns asked for — the topic's own, a handful among thousands — and
 * stops the moment every one of them has been seen.
 */
const CAMPAIGN_PAGE = 100;
/** How many pages are read before giving up on a campaign the list does not show. */
const CAMPAIGN_PAGES_MAX = 100;
/** How far back the list is asked to look. The admin asks for a week; a campaign being relaunched may be older. */
const CAMPAIGN_WINDOW_DAYS = 90;

const usDate = (d: Date): string => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

const money = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toCampaign = (raw: unknown): PlatformCampaign => {
  const c = bag(raw);
  return {
    id: num(c['id']),
    name: str(c['name']),
    status: str(c['status']),
    published: c['campaign_id'] != null && str(c['campaign_id']) !== '',
    revenue: money(c['revenue']) ?? 0,
    // The list carries no spend today; null until the platform sends one, and revenue is the sign of the first cent meanwhile.
    spend: money(c['spend']),
    budget: money(c['budget']),
    bid: money(c['bid']),
  };
};

const campaignWindow = (): Record<string, string> => {
  const to = new Date();
  const from = new Date(to.getTime() - CAMPAIGN_WINDOW_DAYS * 86_400_000);
  return { date_type: 'last7days', date_formatted: `${usDate(from)}-${usDate(to)}` };
};

/** Every campaign of one buyer the list shows in the window — the list honours `user_id`, verified 2026-09-11 — with its status, budget and bid. */
export async function readBuyerCampaigns(client: PlatformClient, userId: number): Promise<PlatformCampaign[]> {
  const found: PlatformCampaign[] = [];
  for (let pageId = 0; pageId < CAMPAIGN_PAGES_MAX; pageId++) {
    const body = need(await client.get('/v2/campaigns', { ...campaignWindow(), user_id: userId, pageId, limit: CAMPAIGN_PAGE }), 'GET /v2/campaigns');
    const page = listOf(body, 'data');
    found.push(...page.map(toCampaign));
    if (page.length < CAMPAIGN_PAGE) break;
  }
  return found;
}

export async function readCampaigns(client: PlatformClient, wanted: readonly number[]): Promise<PlatformCampaign[]> {
  if (wanted.length === 0) return [];
  const left = new Set(wanted);
  const found: PlatformCampaign[] = [];
  const query = campaignWindow();
  for (let pageId = 0; pageId < CAMPAIGN_PAGES_MAX && left.size > 0; pageId++) {
    const body = need(await client.get('/v2/campaigns', { ...query, pageId, limit: CAMPAIGN_PAGE }), 'GET /v2/campaigns');
    const page = listOf(body, 'data');
    for (const raw of page) {
      const campaign = toCampaign(raw);
      if (!left.has(campaign.id)) continue;
      left.delete(campaign.id);
      found.push(campaign);
    }
    if (page.length < CAMPAIGN_PAGE) break;
  }
  return found;
}

// --------------------------------------------------------------- writes --

export const createTopic = (client: PlatformClient, body: { name: string; internal_name: string }): Promise<Answer> =>
  client.postJson('/topics', body);

export const createConfiguration = (client: PlatformClient, topicId: number, body: unknown): Promise<Answer> =>
  client.postJson(`/topics/${topicId}/configurations`, body);

export const createTermGroup = (client: PlatformClient, topicId: number, body: TermGroupBody): Promise<Answer> =>
  client.postJson('/topics/term-groups', { ...body, topic_id: topicId });

export const updateTermGroup = (client: PlatformClient, id: number, body: TermGroupBody): Promise<Answer> =>
  client.putJson(`/topics/term-groups/${id}`, body);

export const setTermGroupWeights = (client: PlatformClient, topicId: number, weights: { id: number; weight: number }[]): Promise<Answer> =>
  client.putJson(`/topics/${topicId}/term-groups/weight`, weights);

export interface PostFields {
  description: string;
  site_id: string;
  post_type: string;
  language: string;
  title: string;
  topic_ids: string[];
  countries: string[];
  status: string;
}

/** The admin's form, part for part, including the empty `featured_image` it always sends. */
const postForm = (fields: PostFields): Record<string, string | string[]> => ({
  description: fields.description,
  site_id: fields.site_id,
  post_type: fields.post_type,
  language: fields.language,
  title: fields.title,
  topic_ids: fields.topic_ids,
  countries: fields.countries,
  status: fields.status,
  featured_image: '',
});

export const createPost = (client: PlatformClient, fields: PostFields): Promise<Answer> =>
  client.postForm('/posts', postForm(fields));

export const updatePost = (client: PlatformClient, id: number, fields: PostFields): Promise<Answer> =>
  client.postForm(`/posts/${id}/update`, { ...postForm(fields), id: String(id) });

/** The id a create answered with, where the platform gives one — topics, term groups and builders do. */
export function createdId(answer: Answer, key: 'topic' | 'termGroup' | 'campaignBuilder'): number | null {
  if (answer.status !== 'ok') return null;
  const id = bag(bag(answer.body)[key])['id'];
  return typeof id === 'number' && Number.isInteger(id) ? id : null;
}

// -- the campaign half of the chain

export interface UploadFields {
  grade: string;
  language: string;
  ad_script: string;
  media_type: string;
  traffic_sources: string[];
  topic_ids: string[];
  countries: string[];
}

/** One video into the repository, the admin's form part for part, the file last. */
export const uploadCreative = (client: PlatformClient, fields: UploadFields, file: { name: string; bytes: Buffer }): Promise<Answer> =>
  client.postForm('/creative-repo', { ...fields }, { field: 'file', name: file.name, bytes: file.bytes, mime: 'video/mp4' });

/** The admin sends every list twice — once plain, once as `name[]` — and so does this. */
export const createHeadline = (client: PlatformClient, body: Omit<HeadlineBody, 'topic_ids'> & { topic_ids: string[] }): Promise<Answer> =>
  client.postForm('/creative-repo/headline', {
    topic_ids: body.topic_ids[0] ?? '',
    grade: body.grade,
    countries: body.countries[0] ?? 'All',
    headlines: body.headlines[0] ?? '',
    primary_texts: '',
    descriptions: '',
    language: body.language,
    source: body.source,
    'topic_ids[]': body.topic_ids,
    'countries[]': body.countries,
    'headlines[]': body.headlines,
    'primary_texts[]': body.primary_texts,
    'descriptions[]': body.descriptions,
  });

export const createTsp = (client: PlatformClient, body: Omit<TspBody, 'topic_id'> & { topic_id: number }): Promise<Answer> =>
  client.postJson('/traffic-source-profiles', body);

export const updateTsp = (client: PlatformClient, id: number, name: string, body: Omit<TspBody, 'topic_id'> & { topic_id: number }): Promise<Answer> =>
  client.putJson(`/traffic-source-profiles/${id}`, { ...body, id, name });

export interface BuilderFields {
  topic_id: string;
  country: string;
  site_id: string;
  post_id: string;
  language: string;
  monetization_type: string;
  rsoc_count: string;
  conversion_event_type: string;
  pixel_id: string;
  traffic_source: string;
  traffic_source_profile_ids: string[];
  creative_repo_ids: string[];
  term_group_ids: string[];
  ad_account_ids: string[];
  use_ad_title_as_referrer_ad_text: string;
  use_keyword_rotation: string;
  themes: string[];
}

export const createBuilder = (client: PlatformClient, fields: BuilderFields): Promise<Answer> =>
  client.postForm('/campaign-builder', { ...fields });

/** The admin's bulk status change: multipart, campaign ids — never builder ids. */
export const pauseCampaigns = (client: PlatformClient, body: PauseBody): Promise<Answer> =>
  client.postForm('/v2/campaign/bulk-update', { status: body.status, 'campaign_ids[]': body.campaign_ids.map(String) });

/**
 * The admin's campaign management: one multipart per campaign with the id,
 * bid, budget and status all together — `core/adjust.ts` fills the parts
 * that do not change from the list. Answers `{"success":true}`; a 2xx that
 * says `success: false` is an error answer here, so the policy stops on it
 * with the platform's words instead of writing a change that did not happen.
 */
export async function updateCampaign(client: PlatformClient, body: AdjustBody): Promise<Answer> {
  const answer = await client.postForm(`/v2/campaign/${body.id}`, { id: body.id, bid: body.bid, budget: body.budget, status: body.status });
  if (answer.status === 'ok' && bag(answer.body)['success'] === false) {
    return { status: 'error', code: answer.code, body: answer.body, text: JSON.stringify(answer.body).slice(0, 300) };
  }
  return answer;
}
