// A launch as the folder describes it: the two manifests, the key that names
// the folder and the ticket, and the tree `sa new` lays out. Everything the
// platform will later be asked for starts as a field here, so a manifest that
// parses is one that can be planned — a missing field fails at `sa new`, not on
// the ninth call of an apply.
import YAML from 'yaml';

/**
 * Lower-case segments joined by single dashes, at least two of them: the team's
 * abbreviation first, then whatever the buyer names the launch by. It is a
 * folder name and a ticket title at once, so nothing a shell or ClickUp would
 * mangle is allowed in.
 */
const LAUNCH_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

export const isLaunchKey = (value: unknown): value is string =>
  typeof value === 'string' && LAUNCH_KEY.test(value);

export const TRAFFIC_SOURCES = ['tiktok', 'facebook'] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];
export const isTrafficSource = (value: unknown): value is TrafficSource =>
  typeof value === 'string' && (TRAFFIC_SOURCES as readonly string[]).includes(value);

/**
 * A cabinet the topic may launch from, and the pixel that belongs to it. Keyed
 * by an alias the buyer picks, so a campaign says `account: main` rather than
 * repeating two platform ids.
 */
export interface Account {
  ad_account: string;
  pixel: string;
}

export interface TopicManifest {
  launch_key: string;
  name: string;
  /** The platform's system name: `name` with the spaces taken out. */
  internal_name: string;
  traffic_source: TrafficSource;
  /** The site (domain) articles are published on. */
  site: string;
  accounts: Record<string, Account>;
  /** Names of autorule presets to put on the topic. */
  rules: string[];
}

/**
 * The Traffic Source Profile a campaign is published with. Budget and bid are
 * the two numbers a buyer always sets; the rest default to «All», which is what
 * the admin sends when nothing is picked.
 */
export interface TspManifest {
  budget: number;
  bid: number;
  launch_tomorrow: boolean;
  /** ISO date, or null for no end. */
  end_date: string | null;
  /** Age bands as the platform names them, or `All`. */
  age: string[];
  gender: string;
  devices: string[];
  os: string[];
  /** Hours of the week the campaign runs, as the platform's schedule rows; empty means always. */
  schedule: string[];
}

export interface CampaignManifest {
  termgroup: string;
  article: string;
  language: string;
  country: string;
  /** An alias from the topic's `accounts`. */
  account: string;
  theme: string;
  rsoc_count: number;
  keyword_rotation: boolean;
  headline: string;
  tsp: TspManifest;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

type Bag = Record<string, unknown>;

const isBag = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `name` without its spaces — what the platform calls `internal_name`. */
export const internalName = (name: string): string => name.replace(/\s+/g, '');

function parseYaml(text: string): ParseResult<Bag> {
  let data: unknown;
  try {
    data = YAML.parse(text);
  } catch (e) {
    return { ok: false, errors: ['не yaml: ' + (e as Error).message] };
  }
  if (!isBag(data)) return { ok: false, errors: ['маніфест має бути набором полів, а не списком чи текстом'] };
  return { ok: true, value: data };
}

/** A string field, trimmed, or a complaint. */
function text(bag: Bag, field: string, errors: string[]): string {
  const value = bag[field];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number') return String(value);
  errors.push(`поле \`${field}\` обов'язкове`);
  return '';
}

function positive(bag: Bag, field: string, errors: string[]): number {
  const value = Number(bag[field]);
  if (Number.isFinite(value) && value > 0) return value;
  errors.push(`поле \`${field}\` має бути додатним числом`);
  return 0;
}

/** A list of names, a single name, or nothing — the platform takes `All` for nothing. */
function names(bag: Bag, field: string, errors: string[], fallback: string[]): string[] {
  const value = bag[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every(v => typeof v === 'string' || typeof v === 'number')) {
    return value.map(String);
  }
  errors.push(`поле \`${field}\` має бути назвою або списком назв`);
  return fallback;
}

function flag(bag: Bag, field: string, errors: string[], fallback: boolean): boolean {
  const value = bag[field];
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  errors.push(`поле \`${field}\` має бути true або false`);
  return fallback;
}

export function parseTopicManifest(source: string): ParseResult<TopicManifest> {
  const parsed = parseYaml(source);
  if (!parsed.ok) return parsed;
  const bag = parsed.value;
  const errors: string[] = [];

  const launchKey = text(bag, 'launch_key', errors);
  if (launchKey !== '' && !isLaunchKey(launchKey)) {
    errors.push(`поле \`launch_key\` має вигляд \`ai-vadim-sperm-it\`: малі літери, цифри й дефіси, щонайменше два сегменти`);
  }
  const name = text(bag, 'name', errors);
  const derived = internalName(name);
  let internal = derived;
  if (typeof bag['internal_name'] === 'string' && bag['internal_name'].trim() !== '') {
    internal = bag['internal_name'].trim();
    if (name !== '' && internal !== derived) {
      errors.push(`поле \`internal_name\` має бути назвою без пробілів: \`${derived}\``);
    }
  }
  const sourceText = text(bag, 'traffic_source', errors);
  if (sourceText !== '' && !isTrafficSource(sourceText)) {
    errors.push(`поле \`traffic_source\` має бути одним із: ${TRAFFIC_SOURCES.join(', ')}`);
  }
  const trafficSource = sourceText as TrafficSource;
  const site = text(bag, 'site', errors);

  const accounts: Record<string, Account> = {};
  if (!isBag(bag['accounts']) || Object.keys(bag['accounts']).length === 0) {
    errors.push('поле `accounts` обов\'язкове: хоча б один кабінет із пікселем');
  } else {
    for (const [alias, raw] of Object.entries(bag['accounts'])) {
      if (!isBag(raw)) {
        errors.push(`кабінет \`${alias}\` має мати поля \`ad_account\` і \`pixel\``);
        continue;
      }
      const own: string[] = [];
      const account = { ad_account: text(raw, 'ad_account', own), pixel: text(raw, 'pixel', own) };
      if (own.length > 0) errors.push(`кабінет \`${alias}\`: ${own.join('; ')}`);
      else accounts[alias] = account;
    }
  }

  let rules: string[] = [];
  if (bag['rules'] !== undefined) {
    if (Array.isArray(bag['rules']) && bag['rules'].every(r => typeof r === 'string')) rules = bag['rules'];
    else errors.push('поле `rules` має бути списком назв пресетів');
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { launch_key: launchKey, name, internal_name: internal, traffic_source: trafficSource, site, accounts, rules },
  };
}

export function parseCampaignManifest(source: string, topic: TopicManifest): ParseResult<CampaignManifest> {
  const parsed = parseYaml(source);
  if (!parsed.ok) return parsed;
  const bag = parsed.value;
  const errors: string[] = [];

  const termgroup = text(bag, 'termgroup', errors);
  const article = text(bag, 'article', errors);
  const language = text(bag, 'language', errors);
  const country = text(bag, 'country', errors);
  const account = text(bag, 'account', errors);
  if (account !== '' && !(account in topic.accounts)) {
    errors.push(`кабінету \`${account}\` немає в topic.yaml; є: ${Object.keys(topic.accounts).join(', ')}`);
  }
  const theme = text(bag, 'theme', errors);
  const rsocCount = positive(bag, 'rsoc_count', errors);
  const keywordRotation = flag(bag, 'keyword_rotation', errors, false);
  const headline = text(bag, 'headline', errors);

  let tsp: TspManifest = {
    budget: 0, bid: 0, launch_tomorrow: true, end_date: null,
    age: ['All'], gender: 'All', devices: ['All'], os: ['All'], schedule: [],
  };
  if (!isBag(bag['tsp'])) {
    errors.push('поле `tsp` обов\'язкове: бюджет і бід кампанії');
  } else {
    const raw = bag['tsp'];
    const own: string[] = [];
    const endDate = raw['end_date'];
    if (endDate !== undefined && endDate !== null && typeof endDate !== 'string') {
      own.push('поле `end_date` має бути датою або null');
    }
    tsp = {
      budget: positive(raw, 'budget', own),
      bid: positive(raw, 'bid', own),
      launch_tomorrow: flag(raw, 'launch_tomorrow', own, true),
      end_date: typeof endDate === 'string' ? endDate : null,
      age: names(raw, 'age', own, ['All']),
      gender: names(raw, 'gender', own, ['All'])[0] ?? 'All',
      devices: names(raw, 'devices', own, ['All']),
      os: names(raw, 'os', own, ['All']),
      schedule: names(raw, 'schedule', own, []),
    };
    for (const e of own) errors.push('tsp: ' + e);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      termgroup, article, language, country, account, theme,
      rsoc_count: rsocCount, keyword_rotation: keywordRotation, headline, tsp,
    },
  };
}

// ------------------------------------------------------------- sa new --

/** Why a launch cannot start, in a sentence, or null when it can. */
export function checkNewLaunch(existingKeys: readonly string[], launchKey: string): string | null {
  if (!isLaunchKey(launchKey)) {
    return `launch key має вигляд \`ai-vadim-sperm-it\`: малі літери, цифри й дефіси, щонайменше два сегменти; отримано \`${launchKey}\``;
  }
  if (existingKeys.includes(launchKey)) return `залив \`${launchKey}\` уже є — тека існує`;
  return null;
}

export interface NewLaunchOptions {
  launchKey: string;
  /**
   * The topic's display name. Not derived from the key when left out — the
   * PRD keeps the three names independent — so the manifest carries a
   * placeholder the buyer must replace before the first plan.
   */
  name?: string;
  trafficSource?: TrafficSource;
}

export const NAME_PLACEHOLDER = 'REPLACE_TOPIC_NAME';

export interface LaunchTree {
  /** Folders to create, relative to the launch folder. */
  dirs: string[];
  /** Files to write, relative to the launch folder. */
  files: { path: string; content: string }[];
}

export const LAUNCH_DIRS = ['termgroups', 'articles', 'batches', 'campaigns'] as const;

/**
 * What `sa new` lays out. Pure: the caller writes it to disk. The manifests
 * are real ones — they parse — with the platform ids left as placeholders the
 * buyer replaces before the first plan.
 */
export function newLaunchTree(options: NewLaunchOptions): LaunchTree {
  const name = options.name?.trim() || NAME_PLACEHOLDER;
  const source = options.trafficSource ?? 'tiktok';
  const topic = [
    '# Топік — коренева сутність платформи й одиниця роботи. Один топік = один тікет = ця тека.',
    '# Плейсхолдери нижче заміни своїми id з платформи до першого `sa plan`.',
    `launch_key: ${options.launchKey}`,
    `name: ${YAML.stringify(name).trim()}`,
    `internal_name: ${internalName(name)}`,
    `traffic_source: ${source}`,
    '# Сайт (домен), на якому публікуються статті. Id з GET /sites.',
    'site: "REPLACE_SITE_ID"',
    '# Кабінети, з яких ллється цей топік, і піксель кожного. Кампанія посилається на alias.',
    'accounts:',
    '  main:',
    '    ad_account: "REPLACE_AD_ACCOUNT_ID"',
    '    pixel: "REPLACE_PIXEL_ID"',
    '# Автоправила з пресетів репозиторію, які стоятимуть на топіку.',
    'rules: []',
    '',
  ].join('\n');

  const campaign = [
    '# Одна кампанія: термгрупа + стаття + скрипт + креативи + один TSP + один кабінет.',
    '# Назви термгрупи й статті — це назви тек у termgroups/ та articles/.',
    'termgroup: tg-main',
    'article: article-a',
    'language: en',
    'country: "REPLACE_COUNTRY"',
    'account: main',
    '# Тема статті на платформі, id з GET /themes. Команда бере темні.',
    'theme: "REPLACE_THEME_ID"',
    'rsoc_count: 5',
    'keyword_rotation: false',
    'headline: Learn more',
    '# Traffic Source Profile цієї кампанії. Що не задано — платформа бере як All.',
    'tsp:',
    '  budget: 20',
    '  bid: 0.45',
    '  launch_tomorrow: true',
    '  end_date: null',
    '  age: [All]',
    '  gender: All',
    '  devices: [All]',
    '  os: [All]',
    '  schedule: []',
    '',
  ].join('\n');

  return {
    dirs: [...LAUNCH_DIRS, 'campaigns/example/creatives'],
    files: [
      { path: 'topic.yaml', content: topic },
      { path: 'campaigns/example/campaign.yaml', content: campaign },
      { path: 'campaigns/example/script.md', content: '' },
    ],
  };
}

/** What `sa new` answers: the folder is always there, the ticket may not be. */
export interface LaunchCreated {
  launchKey: string;
  folder: string;
  files: string[];
  ticket: { ok: true; id: string; url: string } | { ok: false; note: string };
}

// --------------------------------------------------------- ticket fields --

/** A custom field as ClickUp describes it on a list. Only what matching needs. */
export interface TicketFieldDef {
  id: string;
  name: string;
  type: string;
  type_config?: {
    options?: { id: string; name?: string; label?: string; orderindex?: number }[];
  };
}

export interface TicketValues {
  launchKey: string;
  vertical?: string;
  geo?: string[];
}

export interface TicketField {
  id: string;
  value: string | string[];
}

/** The names the fields carry in ClickUp, as ticket 01 creates them. */
export const TICKET_FIELD_NAMES = { launchKey: 'launch_key', vertical: 'вертикаль', geo: 'гео' } as const;

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Turn the values a buyer typed into what the ClickUp API wants: field ids, and
 * for a dropdown or labels the option ids rather than the words. A word the list
 * does not offer is refused by name, so the buyer fixes the list or the word,
 * not a 400 from the API.
 */
export function resolveTicketFields(defs: readonly TicketFieldDef[], values: TicketValues): ParseResult<TicketField[]> {
  const errors: string[] = [];
  const fields: TicketField[] = [];
  const find = (name: string): TicketFieldDef | undefined => defs.find(d => sameName(d.name, name));

  const keyField = find(TICKET_FIELD_NAMES.launchKey);
  if (keyField === undefined) errors.push(`у списку немає поля \`${TICKET_FIELD_NAMES.launchKey}\``);
  else fields.push({ id: keyField.id, value: values.launchKey });

  if (values.vertical !== undefined) {
    const def = find(TICKET_FIELD_NAMES.vertical);
    if (def === undefined) errors.push(`у списку немає поля \`${TICKET_FIELD_NAMES.vertical}\``);
    else {
      const option = def.type_config?.options?.find(o => sameName(o.name ?? o.label ?? '', values.vertical!));
      if (option === undefined) errors.push(`вертикалі \`${values.vertical}\` немає серед варіантів поля \`${def.name}\``);
      else fields.push({ id: def.id, value: option.id });
    }
  }

  if (values.geo !== undefined && values.geo.length > 0) {
    const def = find(TICKET_FIELD_NAMES.geo);
    if (def === undefined) errors.push(`у списку немає поля \`${TICKET_FIELD_NAMES.geo}\``);
    else {
      const ids: string[] = [];
      for (const geo of values.geo) {
        const option = def.type_config?.options?.find(o => sameName(o.label ?? o.name ?? '', geo));
        if (option === undefined) errors.push(`гео \`${geo}\` немає серед варіантів поля \`${def.name}\``);
        else ids.push(option.id);
      }
      if (ids.length === values.geo.length) fields.push({ id: def.id, value: ids });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: fields };
}
