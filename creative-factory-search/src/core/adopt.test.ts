import { describe, expect, it } from 'vitest';
import { adoptTopic, articleFingerprint, checkAdopt, folderNameFor, type AdoptInput } from './adopt.ts';
import { parseArticle } from './article.ts';
import type { PlatformBuilder } from './campaign-plan.ts';
import { parseTopicManifest } from './launch.ts';
import { articleHash, parseKeywords, parseTermGroupOptions, type PlatformPostDetail } from './plan.ts';

const builder = (id: number, over: Partial<PlatformBuilder> = {}): PlatformBuilder => ({
  id, topic_id: 107567, post_id: 131856, pixel_id: 35967, status: 'APPROVED', traffic_source: 'tiktok', creative_ids: [], rejection: null, review: [],
  campaigns: [{ id: 1279494, name: '34-AIjobsDEwh-tg-wh-tk-de-ia-0910-GE01', term_group_id: 213642, ad_account: '53560' }], ...over,
});

const post = (id: number, over: Partial<PlatformPostDetail> = {}): PlatformPostDetail => ({
  id, title: 'Warehouse Jobs in Germany 2026', status: 'Publish', site_id: 182, country: ['Germany'], language: 'All', topic_ids: [107567],
  description: '<h2>Shifts</h2><p>Text with <strong>bold</strong>.</p>', slug: 'warehouse-jobs-in-germany-2026-shifts', ...over,
});

const input = (over: Partial<AdoptInput> = {}): AdoptInput => ({
  launchKey: 'ai-jobs-de-wh',
  topic: { id: 107567, name: 'AI jobs DE wh', internal_name: 'AIjobsDEwh', user_id: 1099 },
  configurations: [{ id: 109001, name: 'AI jobs DE wh', topic_id: 107567, country: 'All', traffic_source: 'tiktok' }],
  termGroups: [{ id: 213642, name: 'tg-wh', terms: ['warehouse jobs', 'lager jobs'], weight: 100, country: 'All', language: 'All' }],
  posts: [post(131856)],
  builders: [builder(716806)],
  pixels: [{ id: 35967, name: 'Джобс', ad_account_id: '7680550759062339602' }],
  vertical: 'jobs',
  ...over,
});

const fileOf = (adopted: ReturnType<typeof adoptTopic>, path: string): string => {
  const file = adopted.tree.files.find(f => f.path === path);
  if (file === undefined) throw new Error(`no ${path}; have ${adopted.tree.files.map(f => f.path).join(', ')}`);
  return file.content;
};

describe('adopting a topic from the platform', () => {
  it('writes a topic.yaml that parses, with the site off the posts and the cabinet off the builders, source and pixel included', () => {
    const adopted = adoptTopic(input());
    const parsed = parseTopicManifest(fileOf(adopted, 'topic.yaml'));
    expect(parsed.ok && parsed.value).toMatchObject({
      launch_key: 'ai-jobs-de-wh', name: 'AI jobs DE wh', internal_name: 'AIjobsDEwh', site: '182', vertical: 'jobs',
      accounts: { 'tk-1': { source: 'tiktok', ad_account: '53560', pixel: '35967' } },
    });
    expect(fileOf(adopted, 'topic.yaml')).toMatch(/піксель «Джобс»/);
    expect(adopted.tree.dirs).toEqual(expect.arrayContaining(['termgroups', 'articles', 'sources', 'campaigns']));
    expect(adopted.notes).toEqual([]);
  });

  it('is one cabinet per distinct source, cabinet and pixel; a Facebook builder gives a Facebook cabinet', () => {
    const adopted = adoptTopic(input({ builders: [
      builder(1), builder(2),
      builder(3, { pixel_id: 35968 }),
      builder(4, { traffic_source: 'facebook', pixel_id: 9002, campaigns: [{ id: 5, name: 'x', term_group_id: null, ad_account: '9001' }] }),
    ] }));
    const parsed = parseTopicManifest(fileOf(adopted, 'topic.yaml'));
    expect(parsed.ok && Object.entries(parsed.value.accounts).map(([alias, a]) => [alias, a.source, a.ad_account, a.pixel])).toEqual([
      ['tk-1', 'tiktok', '53560', '35967'],
      ['tk-2', 'tiktok', '53560', '35968'],
      ['fb-1', 'facebook', '9001', '9002'],
    ]);
  });

  it('leaves placeholders and says so when the topic has no builders, one per configured source', () => {
    const adopted = adoptTopic(input({ builders: [], configurations: [
      { id: 1, name: 'x', topic_id: 107567, country: 'All', traffic_source: 'tiktok' },
      { id: 2, name: 'x', topic_id: 107567, country: 'All', traffic_source: 'facebook' },
    ] }));
    expect(fileOf(adopted, 'topic.yaml')).toMatch(/tk-1:[\s\S]*REPLACE_AD_ACCOUNT_ID[\s\S]*fb-1:/);
    expect(adopted.notes.join()).toMatch(/плейсхолдер/);
    expect(adopted.state.configurations).toEqual({ tiktok: 1, facebook: 2 });
  });

  it('writes the live keys into termgroups/<name>/keywords.txt and the id into the state, so the next plan updates rather than creates', () => {
    const adopted = adoptTopic(input());
    const keys = parseKeywords(fileOf(adopted, 'termgroups/tg-wh/keywords.txt'));
    expect(keys.ok && keys.value).toEqual(['warehouse jobs', 'lager jobs']);
    expect(adopted.tree.files.some(f => f.path === 'termgroups/tg-wh/termgroup.yaml')).toBe(false);
    expect(adopted.state.termgroups).toEqual({ 'tg-wh': 213642 });
  });

  it('keeps a platform name that is not a folder name in termgroup.yaml, and weights when they are not equal shares', () => {
    const adopted = adoptTopic(input({ termGroups: [
      { id: 1, name: 'tgHR', terms: ['a'], weight: 60, country: 'Germany', language: 'German' },
      { id: 2, name: 'tg HR 2', terms: ['b'], weight: 40, country: 'All', language: 'All' },
    ] }));
    expect(adopted.state.termgroups).toEqual({ tghr: 1, 'tg-hr-2': 2 });
    const first = parseTermGroupOptions(fileOf(adopted, 'termgroups/tghr/termgroup.yaml'));
    expect(first.ok && first.value).toEqual({ name: 'tgHR', weight: 60, country: 'Germany', language: 'German' });
    const second = parseTermGroupOptions(fileOf(adopted, 'termgroups/tg-hr-2/termgroup.yaml'));
    expect(second.ok && second.value).toEqual({ name: 'tg HR 2', weight: 40, country: 'All', language: 'All' });
  });

  it('turns each post into articles/<slug>/article.md with a front matter, and writes the fingerprint the plan will compute', () => {
    const adopted = adoptTopic(input());
    const markdown = fileOf(adopted, 'articles/warehouse-jobs-in-germany-2026-shifts/article.md');
    expect(markdown).toBe('---\ntitle: Warehouse Jobs in Germany 2026\ncountry: [Germany]\nlanguage: All\n---\n\n## Shifts\n\nText with **bold**.\n');
    const parsed = parseArticle(markdown, () => null);
    expect(parsed.ok && parsed.value).toMatchObject({ title: 'Warehouse Jobs in Germany 2026', countries: ['Germany'], html: '<h2>Shifts</h2><p>Text with <strong>bold</strong>.</p>' });
    expect(adopted.state.articles).toEqual({
      'warehouse-jobs-in-germany-2026-shifts': { id: 131856, hash: parsed.ok ? articleHash(parsed.value, { site: '182' }, ['Germany']) : 'x' },
    });
    expect(adopted.state.topic_id).toBe(107567);
    expect(adopted.state.campaigns).toEqual({});
  });

  it('keeps a long title with a colon on one front matter line, so the file reads back with the same title', () => {
    const title = 'Niet de rollator, maar dit: de hulpmiddelen en diensten waar mensen in 2026 op overstappen';
    const adopted = adoptTopic(input({ posts: [post(1, { title, slug: 'rollator' })] }));
    const markdown = fileOf(adopted, 'articles/rollator/article.md');
    const parsed = parseArticle(markdown, () => null);
    expect(parsed.ok && parsed.value.title).toBe(title);
    expect(adopted.state.articles['rollator']!.hash).not.toBe('');
  });

  it('lists the pictures for the server to fetch, makes the images folder, and hashes a data URL picture now', () => {
    const adopted = adoptTopic(input({ posts: [post(1, {
      description: '<p><img src="https://static2.digifor.io/storage/a.png" alt="x"></p><p><img src="data:image/jpeg;base64,QUJD"></p>',
    })] }));
    expect(adopted.pictures).toEqual([
      { folder: 'articles/warehouse-jobs-in-germany-2026-shifts', picture: { path: 'images/01.png', src: 'https://static2.digifor.io/storage/a.png' } },
      { folder: 'articles/warehouse-jobs-in-germany-2026-shifts', picture: { path: 'images/02.jpg', src: 'data:image/jpeg;base64,QUJD' } },
    ]);
    expect(adopted.tree.dirs).toContain('articles/warehouse-jobs-in-germany-2026-shifts/images');
    const markdown = fileOf(adopted, 'articles/warehouse-jobs-in-germany-2026-shifts/article.md');
    const onDisk = articleFingerprint(markdown, path => (path === 'images/01.png' ? { mime: 'image/png', base64: 'REAL' } : { mime: 'image/jpeg', base64: 'QUJD' }), '182', ['Germany']);
    // The hash written now stands in for the linked picture's bytes; once they land the server asks again and gets the real one.
    expect(onDisk).not.toBeNull();
    expect(adopted.state.articles['warehouse-jobs-in-germany-2026-shifts']!.hash).not.toBe(onDisk);
  });

  it('skips posts of other topics, names a post without a slug by its title, and tells two posts alike apart', () => {
    const adopted = adoptTopic(input({ posts: [
      post(1, { slug: '', title: 'Ärzte: Jobs & Pay!' }),
      post(2, { slug: '', title: 'Ärzte: Jobs & Pay!' }),
      post(3, { topic_ids: [999] }),
    ] }));
    expect(Object.keys(adopted.state.articles)).toEqual(['arzte-jobs-pay', 'arzte-jobs-pay-2']);
    expect(adopted.notes.join()).toMatch(/1 статей зі списку належать іншим топікам/);
  });

  it('says what a hand must still do: no articles, no keys, a site split across posts', () => {
    const adopted = adoptTopic(input({
      posts: [post(1, { site_id: 182 }), post(2, { site_id: 183, slug: 'other' })],
      termGroups: [{ id: 1, name: 'tg-empty', terms: [], weight: 100, country: 'All', language: 'All' }],
    }));
    expect(adopted.notes.join('\n')).toMatch(/різних сайтах \(182, 183\)/);
    expect(adopted.notes.join('\n')).toMatch(/«tg-empty» на платформі без ключів/);
    const none = adoptTopic(input({ posts: [] }));
    expect(fileOf(none, 'topic.yaml')).toMatch(/REPLACE_SITE_ID/);
    expect(none.notes.join()).toMatch(/сайт невідомий/);
  });
});

describe('checkAdopt', () => {
  it('refuses a bad id, a bad key, a folder that exists, and a topic another folder already adopted', () => {
    expect(checkAdopt([], [], 'ai-x-y', 0)).toMatch(/id топіка/);
    expect(checkAdopt([], [], 'Bad', 5)).toMatch(/launch key/);
    expect(checkAdopt(['ai-x-y'], [], 'ai-x-y', 5)).toMatch(/тека існує/);
    expect(checkAdopt([], [5], 'ai-x-y', 5)).toMatch(/уже підхоплено/);
    expect(checkAdopt(['ai-a-b'], [7], 'ai-x-y', 5)).toBeNull();
  });
});

describe('folderNameFor', () => {
  it('lower-cases, dashes the rest, strips accents and falls back when nothing survives', () => {
    expect(folderNameFor('tgHR', 'tg-1')).toBe('tghr');
    expect(folderNameFor('Ärzte: Jobs & Pay!', 'a')).toBe('arzte-jobs-pay');
    expect(folderNameFor('---', 'tg-1')).toBe('tg-1');
    expect(folderNameFor('.hidden', 'tg-1')).toBe('hidden');
    expect(folderNameFor('x'.repeat(80), 'a')).toHaveLength(60);
    expect(folderNameFor('niet-de-rollator-maar-dit-de-hulpmiddelen-en-diensten-waar-mensen-in-2026-op-overstappen', 'a')).toBe('niet-de-rollator-maar-dit-de-hulpmiddelen-en-diensten-waar');
  });
});
