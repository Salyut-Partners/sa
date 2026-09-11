// The launch matrix: what `sa expand` turns into folders. The buyer and Claude
// settle the axes — term groups, articles, language+country pairs, cabinets —
// and the cells are their product, each one a campaign folder with a manifest
// the plan can read. The matrix is a generator and nothing more: it is not
// written to disk, and once the folders exist they are the truth. Running it
// again makes only what is missing and never touches or removes a folder.
//
// Names are decided here, not by whoever wrote the JSON, so every buyer's tree
// reads the same: `<language>-<country>-<account>-<termgroup>-<article>`, lower
// case, with a cell free to say `name` when the rule is not what it wants.
import YAML from 'yaml';
import {
  isTrafficSource, type CampaignManifest, type ParseResult, type TopicManifest, type TspManifest,
} from './launch.ts';
import { parseKeywords } from './plan.ts';

export const THEME_PLACEHOLDER = 'REPLACE_THEME_ID';
export const HEADLINE_PLACEHOLDER = 'REPLACE_HEADLINE';

/** A term group to make: its keys, and the optional `termgroup.yaml` fields. */
export interface MatrixTermGroup {
  keywords: string[];
  country: string | null;
  language: string | null;
  weight: number | null;
}

/** An article to make: `article.md` starts as its title, the text comes later. */
export interface MatrixArticle {
  title: string;
}

export interface Geo {
  language: string;
  country: string;
}

/** The fields a cell's manifest takes beyond its axes; null where nothing was said. */
export interface CellFields {
  theme: string | null;
  rsoc_count: number | null;
  keyword_rotation: boolean | null;
  headline: string | null;
  tsp: Partial<TspManifest>;
  /** A folder name of the cell's own, instead of the rule's. */
  name: string | null;
}

/** The axes a cell is matched on. */
export interface CellAxes {
  termgroup: string;
  article: string;
  language: string;
  country: string;
  account: string;
}

/** Fields for the cells whose axes match every key in `where`; applied in order, later ones winning. */
export interface Override {
  where: Partial<CellAxes>;
  set: Partial<CellFields>;
}

export interface MatrixSpec {
  /** Folder name → what to make, or null for a folder that must already exist. */
  termgroups: Record<string, MatrixTermGroup | null>;
  articles: Record<string, MatrixArticle | null>;
  geos: Geo[];
  /** Cabinet aliases from the topic; every cabinet when left out. */
  accounts: string[];
  defaults: CellFields;
  overrides: Override[];
}

/** What is already in the folder, by name, so the expansion makes only the rest. */
export interface Existing {
  termgroups: string[];
  articles: string[];
  campaigns: string[];
}

export interface Expansion {
  dirs: string[];
  files: { path: string; content: string }[];
  created: Existing;
  skipped: Existing;
  /** Placeholders left in manifests, one line each, so the buyer replaces them before the first plan. */
  notes: string[];
}

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);

const NO_FIELDS: CellFields = { theme: null, rsoc_count: null, keyword_rotation: null, headline: null, tsp: {}, name: null };

const AXES = ['termgroup', 'article', 'language', 'country', 'account'] as const;

// ------------------------------------------------------------- parsing --

function optionalText(bag: Bag, field: string, errors: string[], at: string): string | null {
  const value = bag[field];
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number') return String(value);
  errors.push(`${at}: поле \`${field}\` має бути текстом`);
  return null;
}

function optionalNumber(bag: Bag, field: string, errors: string[], at: string): number | null {
  const value = bag[field];
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  errors.push(`${at}: поле \`${field}\` має бути додатним числом`);
  return null;
}

function optionalFlag(bag: Bag, field: string, errors: string[], at: string): boolean | null {
  const value = bag[field];
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  errors.push(`${at}: поле \`${field}\` має бути true або false`);
  return null;
}

function parseTspPart(raw: unknown, errors: string[], at: string): Partial<TspManifest> {
  if (raw === undefined || raw === null) return {};
  if (!isBag(raw)) {
    errors.push(`${at}: \`tsp\` має бути набором полів`);
    return {};
  }
  const tsp: Partial<TspManifest> = {};
  const budget = optionalNumber(raw, 'budget', errors, `${at}: tsp`);
  if (budget !== null) tsp.budget = budget;
  const bid = optionalNumber(raw, 'bid', errors, `${at}: tsp`);
  if (bid !== null) tsp.bid = bid;
  const launchTomorrow = optionalFlag(raw, 'launch_tomorrow', errors, `${at}: tsp`);
  if (launchTomorrow !== null) tsp.launch_tomorrow = launchTomorrow;
  if (raw['end_date'] !== undefined) {
    if (raw['end_date'] === null || typeof raw['end_date'] === 'string') tsp.end_date = raw['end_date'] as string | null;
    else errors.push(`${at}: tsp: \`end_date\` має бути датою або null`);
  }
  for (const list of ['age', 'devices', 'os', 'schedule'] as const) {
    const value = raw[list];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.every(v => typeof v === 'string')) tsp[list] = value as string[];
    else errors.push(`${at}: tsp: \`${list}\` має бути списком назв`);
  }
  for (const one of ['gender', 'language'] as const) {
    const value = optionalText(raw, one, errors, `${at}: tsp`);
    if (value !== null) tsp[one] = value;
  }
  return tsp;
}

function parseFields(raw: unknown, errors: string[], at: string): CellFields {
  if (raw === undefined || raw === null) return { ...NO_FIELDS, tsp: {} };
  if (!isBag(raw)) {
    errors.push(`${at}: має бути набором полів`);
    return { ...NO_FIELDS, tsp: {} };
  }
  for (const key of Object.keys(raw)) {
    if (!['theme', 'rsoc_count', 'keyword_rotation', 'headline', 'tsp', 'name'].includes(key)) {
      errors.push(`${at}: невідоме поле \`${key}\`; можна: theme, rsoc_count, keyword_rotation, headline, tsp, name`);
    }
  }
  return {
    theme: optionalText(raw, 'theme', errors, at),
    rsoc_count: optionalNumber(raw, 'rsoc_count', errors, at),
    keyword_rotation: optionalFlag(raw, 'keyword_rotation', errors, at),
    headline: optionalText(raw, 'headline', errors, at),
    tsp: parseTspPart(raw['tsp'], errors, at),
    name: optionalText(raw, 'name', errors, at),
  };
}

/**
 * A matrix as Claude writes it, checked against the topic: every cabinet it
 * names exists, every term group either brings keys or is a folder that will
 * have to exist, and nothing is misspelt in a way the platform would only
 * notice on the ninth call.
 */
export function parseMatrix(raw: unknown, topic: TopicManifest): ParseResult<MatrixSpec> {
  const errors: string[] = [];
  if (!isBag(raw)) return { ok: false, errors: ['матриця має бути JSON-об\'єктом'] };

  const termgroups: Record<string, MatrixTermGroup | null> = {};
  const rawGroups = raw['termgroups'];
  if (Array.isArray(rawGroups) && rawGroups.every(v => typeof v === 'string')) {
    for (const name of rawGroups as string[]) termgroups[name] = null;
  } else if (isBag(rawGroups)) {
    for (const [name, group] of Object.entries(rawGroups)) {
      if (group === null) { termgroups[name] = null; continue; }
      if (!isBag(group)) { errors.push(`termgroups.${name}: має бути набором полів або null (наявна тека)`); continue; }
      const at = `termgroups.${name}`;
      const keys = group['keywords'];
      let keywords: string[] = [];
      if (!Array.isArray(keys) || !keys.every(k => typeof k === 'string')) {
        errors.push(`${at}: \`keywords\` має бути списком ключів`);
      } else {
        const parsed = parseKeywords(keys.join('\n'));
        if (parsed.ok) keywords = parsed.value;
        else errors.push(...parsed.errors.map(e => `${at}: ${e}`));
        if (parsed.ok && keywords.length === 0) errors.push(`${at}: список ключів порожній`);
      }
      let weight: number | null = null;
      if (group['weight'] !== undefined && group['weight'] !== null) {
        const w = group['weight'];
        if (typeof w === 'number' && Number.isInteger(w) && w >= 1 && w <= 100) weight = w;
        else errors.push(`${at}: \`weight\` має бути цілим числом від 1 до 100`);
      }
      termgroups[name] = {
        keywords, weight,
        country: optionalText(group, 'country', errors, at),
        language: optionalText(group, 'language', errors, at),
      };
    }
  } else if (rawGroups !== undefined) {
    errors.push('`termgroups` має бути списком назв тек або об\'єктом «назва → {keywords, country, language, weight}»');
  }
  if (Object.keys(termgroups).length === 0) errors.push('матриця не називає жодної термгрупи');
  const weighted = Object.values(termgroups).filter((g): g is MatrixTermGroup => g !== null);
  if (weighted.some(g => g.weight !== null) && weighted.some(g => g.weight === null)) {
    errors.push('вага задана не в усіх термгрупах матриці: або в кожній, або в жодній');
  }

  const articles: Record<string, MatrixArticle | null> = {};
  const rawArticles = raw['articles'];
  if (Array.isArray(rawArticles) && rawArticles.every(v => typeof v === 'string')) {
    for (const name of rawArticles as string[]) articles[name] = null;
  } else if (isBag(rawArticles)) {
    for (const [name, article] of Object.entries(rawArticles)) {
      if (article === null) { articles[name] = null; continue; }
      if (!isBag(article)) { errors.push(`articles.${name}: має бути набором полів або null (наявна тека)`); continue; }
      const title = optionalText(article, 'title', errors, `articles.${name}`);
      articles[name] = { title: title ?? name };
    }
  } else if (rawArticles !== undefined) {
    errors.push('`articles` має бути списком назв тек або об\'єктом «назва → {title}»');
  }
  if (Object.keys(articles).length === 0) errors.push('матриця не називає жодної статті');

  for (const name of [...Object.keys(termgroups), ...Object.keys(articles)]) {
    if (!isFolderName(name)) errors.push(`назва теки \`${name}\` має бути з малих літер, цифр і дефісів`);
  }

  const geos: Geo[] = [];
  const rawGeos = raw['geos'];
  if (!Array.isArray(rawGeos) || rawGeos.length === 0) {
    errors.push('`geos` має бути непорожнім списком пар {language, country}');
  } else {
    rawGeos.forEach((geo, i) => {
      if (!isBag(geo)) { errors.push(`geos[${i}]: має бути парою {language, country}`); return; }
      const own: string[] = [];
      const language = optionalText(geo, 'language', own, `geos[${i}]`);
      const country = optionalText(geo, 'country', own, `geos[${i}]`);
      errors.push(...own);
      if (language === null || country === null) { errors.push(`geos[${i}]: потрібні і \`language\`, і \`country\``); return; }
      geos.push({ language, country });
    });
  }

  let accounts = Object.keys(topic.accounts);
  const rawAccounts = raw['accounts'];
  if (rawAccounts !== undefined) {
    if (!Array.isArray(rawAccounts) || !rawAccounts.every(a => typeof a === 'string') || rawAccounts.length === 0) {
      errors.push('`accounts` має бути непорожнім списком alias кабінетів із topic.yaml');
    } else {
      accounts = rawAccounts as string[];
      for (const alias of accounts) {
        if (!(alias in topic.accounts)) errors.push(`кабінету \`${alias}\` немає в topic.yaml; є: ${Object.keys(topic.accounts).join(', ')}`);
      }
    }
  }

  const defaults = parseFields(raw['defaults'], errors, 'defaults');

  const overrides: Override[] = [];
  const rawOverrides = raw['overrides'];
  if (rawOverrides !== undefined) {
    if (!Array.isArray(rawOverrides)) errors.push('`overrides` має бути списком {where, set}');
    else {
      rawOverrides.forEach((over, i) => {
        const at = `overrides[${i}]`;
        if (!isBag(over) || !isBag(over['where'])) { errors.push(`${at}: потрібні \`where\` (осі) і \`set\` (поля)`); return; }
        const where: Partial<CellAxes> = {};
        for (const [axis, value] of Object.entries(over['where'])) {
          if (!(AXES as readonly string[]).includes(axis)) { errors.push(`${at}: where: невідома вісь \`${axis}\`; можна: ${AXES.join(', ')}`); continue; }
          if (typeof value !== 'string') { errors.push(`${at}: where.${axis} має бути текстом`); continue; }
          where[axis as keyof CellAxes] = value;
        }
        const set = parseFields(over['set'], errors, `${at}: set`);
        overrides.push({ where, set: stripUnset(set) });
      });
    }
  }

  for (const key of Object.keys(raw)) {
    if (!['termgroups', 'articles', 'geos', 'accounts', 'defaults', 'overrides'].includes(key)) {
      errors.push(`невідоме поле матриці \`${key}\`; можна: termgroups, articles, geos, accounts, defaults, overrides`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { termgroups, articles, geos, accounts, defaults, overrides } };
}

/** Only the fields an override actually names, so `null` in it does not erase a default. */
function stripUnset(fields: CellFields): Partial<CellFields> {
  const set: Partial<CellFields> = {};
  if (fields.theme !== null) set.theme = fields.theme;
  if (fields.rsoc_count !== null) set.rsoc_count = fields.rsoc_count;
  if (fields.keyword_rotation !== null) set.keyword_rotation = fields.keyword_rotation;
  if (fields.headline !== null) set.headline = fields.headline;
  if (fields.name !== null) set.name = fields.name;
  if (Object.keys(fields.tsp).length > 0) set.tsp = fields.tsp;
  return set;
}

// ------------------------------------------------------------- naming --

const FOLDER_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isFolderName = (value: string): boolean => FOLDER_NAME.test(value);

/** A word into a folder segment: lower case, anything else becomes a dash. */
const segment = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The rule every campaign folder is named by, unless the cell says otherwise. */
export function campaignFolderName(axes: CellAxes): string {
  return [axes.language, axes.country, axes.account, axes.termgroup, axes.article].map(segment).filter(Boolean).join('-');
}

// ---------------------------------------------------------- expansion --

const matches = (where: Partial<CellAxes>, axes: CellAxes): boolean =>
  AXES.every(axis => where[axis] === undefined || where[axis] === axes[axis]);

function fieldsFor(spec: MatrixSpec, axes: CellAxes): CellFields {
  let fields: CellFields = { ...spec.defaults, tsp: { ...spec.defaults.tsp } };
  for (const over of spec.overrides) {
    if (!matches(over.where, axes)) continue;
    const { tsp, ...rest } = over.set;
    fields = { ...fields, ...rest, tsp: { ...fields.tsp, ...(tsp ?? {}) } };
  }
  return fields;
}

/** The manifest of a cell, with placeholders where neither defaults nor an override said. */
function cellManifest(axes: CellAxes, fields: CellFields): { manifest: CampaignManifest; placeholders: string[] } {
  const placeholders: string[] = [];
  const theme = fields.theme ?? THEME_PLACEHOLDER;
  if (fields.theme === null) placeholders.push('theme');
  const headline = fields.headline ?? HEADLINE_PLACEHOLDER;
  if (fields.headline === null) placeholders.push('headline');
  const tsp: TspManifest = {
    budget: 20, bid: 0.45, launch_tomorrow: true, end_date: null,
    age: ['All'], gender: 'All', devices: ['All'], os: ['All'], schedule: [], language: 'All',
    ...fields.tsp,
  };
  if (fields.tsp.budget === undefined) placeholders.push('tsp.budget');
  if (fields.tsp.bid === undefined) placeholders.push('tsp.bid');
  return {
    manifest: {
      termgroup: axes.termgroup, article: axes.article, language: axes.language, country: axes.country, account: axes.account,
      theme, rsoc_count: fields.rsoc_count ?? 5, keyword_rotation: fields.keyword_rotation ?? false, headline, tsp,
    },
    placeholders,
  };
}

/** `campaign.yaml` as `sa` writes it: the same fields `parseCampaignManifest` reads, with the comments a buyer needs. */
export function renderCampaignYaml(m: CampaignManifest): string {
  const q = (v: unknown): string => YAML.stringify(v).trim();
  return [
    '# Одна кампанія: термгрупа + стаття + скрипт + креативи + один TSP + один кабінет.',
    '# Створено sa expand / sa new campaign; правити можна, джерело трафіку — джерело кабінету в topic.yaml.',
    `termgroup: ${q(m.termgroup)}`,
    `article: ${q(m.article)}`,
    `language: ${q(m.language)}`,
    `country: ${q(m.country)}`,
    `account: ${q(m.account)}`,
    '# Тема статті на платформі, id з GET /themes.',
    `theme: ${q(m.theme)}`,
    `rsoc_count: ${m.rsoc_count}`,
    `keyword_rotation: ${m.keyword_rotation}`,
    `headline: ${q(m.headline)}`,
    '# Traffic Source Profile цієї кампанії. Що не задано — платформа бере як All.',
    'tsp:',
    `  budget: ${m.tsp.budget}`,
    `  bid: ${m.tsp.bid}`,
    `  launch_tomorrow: ${m.tsp.launch_tomorrow}`,
    `  end_date: ${m.tsp.end_date === null ? 'null' : q(m.tsp.end_date)}`,
    `  age: [${m.tsp.age.join(', ')}]`,
    `  gender: ${q(m.tsp.gender)}`,
    `  devices: [${m.tsp.devices.join(', ')}]`,
    `  os: [${m.tsp.os.join(', ')}]`,
    `  schedule: [${m.tsp.schedule.join(', ')}]`,
    '  # Мова таргетингу, як її називає платформа (Italian), або All.',
    `  language: ${q(m.tsp.language)}`,
    '',
  ].join('\n');
}

function renderTermGroupYaml(group: MatrixTermGroup): string | null {
  const lines: string[] = [];
  if (group.weight !== null) lines.push(`weight: ${group.weight}`);
  if (group.country !== null) lines.push(`country: ${YAML.stringify(group.country).trim()}`);
  if (group.language !== null) lines.push(`language: ${YAML.stringify(group.language).trim()}`);
  return lines.length === 0 ? null : lines.join('\n') + '\n';
}

/**
 * The folders a matrix makes on top of what is there. Pure: the caller writes
 * them. A term group or article named with `null` has to exist already; a
 * campaign whose name is taken is skipped, not rewritten; two cells that
 * land on one name are an error, because the second would silently vanish.
 */
export function expandMatrix(spec: MatrixSpec, topic: TopicManifest, existing: Existing): ParseResult<Expansion> {
  const errors: string[] = [];
  const dirs: string[] = [];
  const files: Expansion['files'] = [];
  const created: Existing = { termgroups: [], articles: [], campaigns: [] };
  const skipped: Existing = { termgroups: [], articles: [], campaigns: [] };
  const notes: string[] = [];

  for (const [name, group] of Object.entries(spec.termgroups)) {
    if (existing.termgroups.includes(name)) { skipped.termgroups.push(name); continue; }
    if (group === null) { errors.push(`термгрупи \`${name}\` немає в termgroups/ — дайте їй keywords або створіть теку`); continue; }
    dirs.push(`termgroups/${name}`);
    files.push({ path: `termgroups/${name}/keywords.txt`, content: group.keywords.join('\n') + '\n' });
    const options = renderTermGroupYaml(group);
    if (options !== null) files.push({ path: `termgroups/${name}/termgroup.yaml`, content: options });
    created.termgroups.push(name);
  }

  for (const [name, article] of Object.entries(spec.articles)) {
    if (existing.articles.includes(name)) { skipped.articles.push(name); continue; }
    if (article === null) { errors.push(`статті \`${name}\` немає в articles/ — дайте їй title або створіть теку`); continue; }
    dirs.push(`articles/${name}`, `articles/${name}/images`);
    files.push({ path: `articles/${name}/article.md`, content: `# ${article.title}\n\n` });
    created.articles.push(name);
    notes.push(`articles/${name}/article.md: лише заголовок — текст статті ще треба написати`);
  }

  const taken = new Map<string, string>();
  for (const termgroup of Object.keys(spec.termgroups)) {
    for (const article of Object.keys(spec.articles)) {
      for (const geo of spec.geos) {
        for (const account of spec.accounts) {
          const axes: CellAxes = { termgroup, article, language: geo.language, country: geo.country, account };
          const fields = fieldsFor(spec, axes);
          const name = fields.name ?? campaignFolderName(axes);
          const cell = `${geo.language}/${geo.country}/${account}/${termgroup}/${article}`;
          if (!isFolderName(name)) { errors.push(`${cell}: назва теки \`${name}\` має бути з малих літер, цифр і дефісів`); continue; }
          const other = taken.get(name);
          if (other !== undefined) { errors.push(`клітинки ${other} і ${cell} дають одну теку \`${name}\` — дайте одній із них name`); continue; }
          taken.set(name, cell);
          if (existing.campaigns.includes(name)) { skipped.campaigns.push(name); continue; }
          const { manifest, placeholders } = cellManifest(axes, fields);
          dirs.push(`campaigns/${name}`, `campaigns/${name}/creatives`);
          files.push({ path: `campaigns/${name}/campaign.yaml`, content: renderCampaignYaml(manifest) });
          files.push({ path: `campaigns/${name}/script.md`, content: '' });
          created.campaigns.push(name);
          if (placeholders.length > 0) notes.push(`campaigns/${name}/campaign.yaml: не задано ${placeholders.join(', ')} — стоять плейсхолдери`);
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { dirs, files, created, skipped, notes } };
}

// ------------------------------------------------------ one campaign --

export interface SingleCampaign extends CellAxes {
  name?: string;
  theme?: string;
  headline?: string;
  bid?: number;
  budget?: number;
}

/** `sa new campaign` as a one-cell matrix over folders that already exist. */
export function singleCampaignMatrix(cell: SingleCampaign, topic: TopicManifest): ParseResult<MatrixSpec> {
  const errors: string[] = [];
  for (const axis of AXES) {
    if (typeof cell[axis] !== 'string' || cell[axis].trim() === '') errors.push(`потрібен --${axis}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const raw: Bag = {
    termgroups: [cell.termgroup],
    articles: [cell.article],
    geos: [{ language: cell.language, country: cell.country }],
    accounts: [cell.account],
    defaults: {
      ...(cell.theme !== undefined ? { theme: cell.theme } : {}),
      ...(cell.headline !== undefined ? { headline: cell.headline } : {}),
      ...(cell.name !== undefined ? { name: cell.name } : {}),
      tsp: {
        ...(cell.bid !== undefined ? { bid: cell.bid } : {}),
        ...(cell.budget !== undefined ? { budget: cell.budget } : {}),
      },
    },
  };
  return parseMatrix(raw, topic);
}

export { isTrafficSource };
