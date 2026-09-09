// The digifor client. Thin: the request form as the admin sends it — Bearer,
// `organization_id` in the query, JSON or multipart — and one typed helper per
// call the chain makes. No decisions live here: what to send is the plan's,
// what to do when the platform does not answer is the queue policy's.
//
// Every call answers an `Outcome` rather than throwing, because the policy in
// `core/queue.ts` reads outcomes: a timeout is a fact to reason about, not an
// exception to unwind.
import type {
  Country, PlatformConfiguration, PlatformPost, PlatformTermGroup, PlatformTopic, Site, TermGroupBody,
} from '../core/plan.ts';
import type { SaConfig } from './config.ts';

/** How long one call may take before it is treated as unanswered. Uploads are small here; posts are text. */
const TIMEOUT_MS = 30_000;

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

  async call(method: string, path: string, query: Record<string, string | number>, body?: BodyInit, contentType?: string): Promise<Answer> {
    const headers = this.headers();
    if (contentType !== undefined) headers['content-type'] = contentType;
    let response: Response;
    try {
      response = await fetch(this.url(path, query), {
        method, headers, ...(body === undefined ? {} : { body }), signal: AbortSignal.timeout(TIMEOUT_MS),
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
  postForm(path: string, fields: Record<string, string | string[]>): Promise<Answer> {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      if (Array.isArray(value)) for (const item of value) form.append(`${name}[]`, item);
      else form.append(name, value);
    }
    return this.call('POST', path, {}, form);
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
  return { id: num(t['id']), name: str(t['name']), internal_name: str(t['internal_name']) };
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

/** The id a create answered with, where the platform gives one — topics and term groups do. */
export function createdId(answer: Answer, key: 'topic' | 'termGroup'): number | null {
  if (answer.status !== 'ok') return null;
  const id = bag(bag(answer.body)[key])['id'];
  return typeof id === 'number' && Number.isInteger(id) ? id : null;
}
