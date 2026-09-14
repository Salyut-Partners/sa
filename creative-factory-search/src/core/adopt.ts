// `sa adopt`: a launch folder made from a topic that already exists on the
// platform — the site, topic, keys and articles were made by hand in the
// admin, and the campaigns are to start from a matrix. Pure: the server
// reads the topic, its configurations, term groups, posts and builders, and
// this decides what files the folder gets and what the state file says.
//
// The state carries a fingerprint of each adopted article: the hash the
// plan would compute from the converted `article.md`. The plan compares the
// file with that fingerprint rather than with the platform, so an article
// that came back from HTML through markdown does not look changed, and the
// first plan after an adopt is empty.
import { parseArticle, type ImageReader } from './article.ts';
import type { PlatformBuilder, Pixel } from './campaign-plan.ts';
import { htmlToMarkdown, type PictureRef } from './html-markdown.ts';
import { internalName, isLaunchKey, LAUNCH_DIRS, type LaunchTree, TRAFFIC_SOURCES, type TrafficSource } from './launch.ts';
import {
  articleHash, emptyState, type LaunchState, type PlatformConfiguration, type PlatformPostDetail, type PlatformTermGroup, type PlatformTopic,
} from './plan.ts';
import YAML from 'yaml';

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
    const source = TRAFFIC_SOURCES.find(s => s === b.traffic_source) ?? 'tiktok';
    const account = b.campaigns.find(c => c.ad_account != null && c.ad_account !== '')?.ad_account ?? 'REPLACE_AD_ACCOUNT_ID';
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
 * the server to fetch into `images/`. Campaigns are not taken: they start
 * from a matrix. The state holds every id and the articles' fingerprints.
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
