import { describe, expect, it } from 'vitest';
import { parseArticle } from './article.ts';
import { emptyCampaignState } from './campaign-plan.ts';
import { parseTopicManifest, type TopicManifest } from './launch.ts';
import {
  adoptResolved, articleHash, chooseTopic, emptyState, firstNew, parseKeywords, parseState, parseTermGroupOptions, plan,
  previewPlan, resolveCountry, type LaunchContents, type LaunchState, type Snapshot, type TermGroupSource,
} from './plan.ts';

const TOPIC = `
launch_key: ai-vadim-sperm-it
name: AI Vadim Sperm IT
traffic_source: tiktok
site: 182
accounts:
  main:
    ad_account: "53560"
    pixel: "35967"
`;

const topic = (): TopicManifest => {
  const result = parseTopicManifest(TOPIC);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.value;
};

const COUNTRIES = [
  { name: 'Germany', code: 'DE' }, { name: 'Italy', code: 'IT' }, { name: 'United States', code: 'US' },
];

const SITES = [{ id: 182, url: 'useconsumer.com' }];

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  topics: [], configurations: [], termGroups: [], posts: [], countries: COUNTRIES, sites: SITES,
  creatives: [], tsps: [], builders: [], campaigns: [], pixels: [], adAccounts: [], themes: [], rsocCounts: [], languages: [],
  ...over,
});

const tg = (name: string, keywords: string[], over: Partial<TermGroupSource> = {}): TermGroupSource => ({
  name, keywords, weight: null, country: 'All', language: 'All', ...over,
});

const article = (name: string, markdown: string) => {
  const parsed = parseArticle(markdown, () => null);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return { name, article: parsed.value };
};

const bare = (): LaunchContents => ({ topic: topic(), termgroups: [], articles: [], campaigns: [], notes: [] });

const full = (): LaunchContents => ({
  topic: topic(),
  termgroups: [tg('tg-main', ['avia sales', 'avia workers'])],
  articles: [article('article-a', '# Jobs at airports\n\nText.')],
  campaigns: [],
  notes: [],
});

const ON_PLATFORM = snapshot({
  topics: [{ id: 106752, name: 'AI Vadim Sperm IT', internal_name: 'AIVadimSpermIT', user_id: 1099 }],
  configurations: [{ id: 108397, name: 'AI Vadim Sperm IT', topic_id: 106752, country: 'All', traffic_source: 'tiktok' }],
  termGroups: [{ id: 211532, name: 'tg-main', terms: ['avia sales', 'avia workers'], weight: 100, country: 'All', language: 'All' }],
  posts: [{ id: 130892, title: 'Jobs at airports', status: 'Publish', site_id: 182, country: ['All'], language: 'All', topic_ids: [106752] }],
});

const DONE_STATE = (): LaunchState => ({
  topic_id: 106752,
  configuration_id: 108397,
  termgroups: { 'tg-main': 211532 },
  articles: { 'article-a': { id: 130892, hash: articleHash(full().articles[0]!.article, topic(), ['All']) } },
  pending: null,
  ticket: null,
  campaigns: {},
});

describe('plan on a folder that has never been applied', () => {
  it('is two steps with their bodies when the folder holds only the manifests', () => {
    const result = plan(bare(), snapshot(), emptyState());
    expect(result.errors).toEqual([]);
    expect(result.steps.map(s => s.kind)).toEqual(['topic.create', 'configuration.create']);
    expect(result.steps[0]).toMatchObject({ body: { name: 'AI Vadim Sperm IT', internal_name: 'AIVadimSpermIT' } });
    expect(result.steps[1]).toMatchObject({
      topic: { after: 'topic' },
      body: { name: 'AI Vadim Sperm IT', country: 'All', traffic_source: 'tiktok', special_categories: [] },
    });
  });

  it('creates the term group, sets its weight, and publishes the article after the topic', () => {
    const result = plan(full(), snapshot(), emptyState());
    expect(result.errors).toEqual([]);
    expect(result.steps.map(s => s.kind)).toEqual([
      'topic.create', 'configuration.create', 'termgroup.create', 'termgroup.weight', 'article.create',
    ]);
    expect(result.steps[2]).toMatchObject({
      name: 'tg-main', topic: { after: 'topic' },
      body: { name: 'tg-main', country: 'All', language: 'All', terms: ['avia sales', 'avia workers'] },
    });
    expect(result.steps[3]).toMatchObject({ body: [{ id: { termgroup: 'tg-main' }, weight: 100 }] });
    expect(result.steps[4]).toMatchObject({
      name: 'article-a',
      body: {
        title: 'Jobs at airports', site_id: '182', post_type: 'Monetized', language: 'All',
        topic_ids: [{ after: 'topic' }], countries: ['All'], status: 'Publish', description: '<p>Text.</p>',
      },
    });
  });

  it('is the same plan however many times it is asked', () => {
    expect(plan(full(), snapshot(), emptyState())).toEqual(plan(full(), snapshot(), emptyState()));
  });
});

describe('plan after everything is on the platform', () => {
  it('is empty when the state holds every id and nothing changed', () => {
    const result = plan(full(), ON_PLATFORM, DONE_STATE());
    expect(result.steps).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('finds a topic the state does not know by internal_name and does not create a second', () => {
    const result = plan(bare(), ON_PLATFORM, emptyState());
    expect(result.steps.map(s => s.kind)).toEqual([]);
    expect(result.resolved.topic_id).toBe(106752);
    expect(result.resolved.configuration_id).toBe(108397);
    expect(result.warnings.join()).toMatch(/AIVadimSpermIT/);
  });

  it('creates the configuration with the read-back topic id when only the topic survived the crash', () => {
    const result = plan(bare(), snapshot({ topics: ON_PLATFORM.topics }), emptyState());
    expect(result.steps.map(s => s.kind)).toEqual(['configuration.create']);
    expect(result.steps[0]).toMatchObject({ topic: 106752 });
  });

  it('refuses when two topics carry the manifest internal_name — one of them is a duplicate already', () => {
    const twice = snapshot({ topics: [...ON_PLATFORM.topics, { id: 1, name: 'x', internal_name: 'AIVadimSpermIT', user_id: 1099 }] });
    const result = plan(bare(), twice, emptyState());
    expect(result.errors.join()).toMatch(/два топіки/);
    // Unless the list written before the interrupted create says which one is ours.
    const pending = { ...emptyState(), pending: { step: 'topic.create', key: 'topic.create', before: [106752] } };
    expect(chooseTopic(twice.topics, topic(), pending)).toEqual({ kind: 'found', id: 1 });
    expect(plan(bare(), twice, pending).errors).toEqual([]);
  });

  it('chooses the topic the state names first, then the one by internal_name, then none', () => {
    expect(chooseTopic(ON_PLATFORM.topics, topic(), DONE_STATE())).toEqual({ kind: 'known', id: 106752 });
    expect(chooseTopic(ON_PLATFORM.topics, topic(), emptyState())).toEqual({ kind: 'found', id: 106752 });
    expect(chooseTopic([], topic(), emptyState())).toEqual({ kind: 'none' });
  });
});

describe('term groups', () => {
  it('updates in place when the keys changed, keeping the id', () => {
    const contents = full();
    contents.termgroups = [tg('tg-main', ['avia sales', 'ground crew'])];
    const result = plan(contents, ON_PLATFORM, DONE_STATE());
    expect(result.steps.map(s => s.kind)).toEqual(['termgroup.update']);
    expect(result.steps[0]).toMatchObject({ id: 211532, body: { terms: ['avia sales', 'ground crew'] } });
  });

  it('splits the weight equally when the folder says nothing, and only rewrites it when it differs', () => {
    const contents = full();
    contents.termgroups = [tg('tg-main', ['a']), tg('tg-second', ['b']), tg('tg-third', ['c'])];
    const result = plan(contents, ON_PLATFORM, DONE_STATE());
    const weight = result.steps.find(s => s.kind === 'termgroup.weight');
    expect(weight).toMatchObject({
      body: [
        { id: 211532, weight: 34 },
        { id: { termgroup: 'tg-second' }, weight: 33 },
        { id: { termgroup: 'tg-third' }, weight: 33 },
      ],
    });
  });

  it('takes an explicit weight from the folder', () => {
    const contents = full();
    contents.termgroups = [tg('tg-main', ['a'], { weight: 70 }), tg('tg-second', ['b'], { weight: 30 })];
    const result = plan(contents, ON_PLATFORM, DONE_STATE());
    expect(result.steps.find(s => s.kind === 'termgroup.weight')).toMatchObject({
      body: [{ id: 211532, weight: 70 }, { id: { termgroup: 'tg-second' }, weight: 30 }],
    });
  });

  it('refuses weights that do not add up to 100', () => {
    const contents = full();
    contents.termgroups = [tg('tg-main', ['a'], { weight: 70 }), tg('tg-second', ['b'], { weight: 40 })];
    expect(plan(contents, ON_PLATFORM, DONE_STATE()).errors.join()).toMatch(/100/);
  });

  it('adopts a group the platform already has under the folder name', () => {
    const contents = full();
    contents.articles = [];
    const result = plan(contents, ON_PLATFORM, emptyState());
    expect(result.steps.map(s => s.kind)).toEqual([]);
    expect(result.resolved.termgroups).toEqual({ 'tg-main': 211532 });
  });

  it('resolves the group country from a code to the name the platform stores', () => {
    const contents = full();
    contents.termgroups = [tg('tg-main', ['a'], { country: 'DE' })];
    const result = plan(contents, ON_PLATFORM, DONE_STATE());
    expect(result.steps[0]).toMatchObject({ kind: 'termgroup.update', body: { country: 'Germany' } });
  });
});

describe('parseKeywords', () => {
  it('reads one key per line and skips blanks and comments', () => {
    expect(parseKeywords('avia sales\n\n# note\n  avia workers  \n')).toEqual({ ok: true, value: ['avia sales', 'avia workers'] });
  });

  it('catches a duplicate key in the file, whatever its case, before the platform sees it', () => {
    const result = parseKeywords('Avia sales\navia workers\navia sales');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/avia sales/i);
  });

  it('refuses an empty file', () => {
    expect(parseKeywords('\n# only a comment\n').ok).toBe(false);
  });
});

describe('parseTermGroupOptions', () => {
  it('defaults to no weight and All when there is no file', () => {
    expect(parseTermGroupOptions(null)).toEqual({ ok: true, value: { weight: null, country: 'All', language: 'All' } });
  });

  it('reads weight, country and language', () => {
    expect(parseTermGroupOptions('weight: 60\ncountry: DE\nlanguage: de\n'))
      .toEqual({ ok: true, value: { weight: 60, country: 'DE', language: 'de' } });
    expect(parseTermGroupOptions('weight: -3').ok).toBe(false);
  });
});

describe('articles', () => {
  it('updates the post in place when article.md changed, keeping the id', () => {
    const contents = full();
    contents.articles = [article('article-a', '# Jobs at airports\n\nNew text.')];
    const result = plan(contents, ON_PLATFORM, DONE_STATE());
    expect(result.steps.map(s => s.kind)).toEqual(['article.update']);
    expect(result.steps[0]).toMatchObject({ id: 130892, body: { description: '<p>New text.</p>', title: 'Jobs at airports' } });
  });

  it('adopts a post with the same title in the topic and syncs it, rather than creating a twin', () => {
    const result = plan(full(), ON_PLATFORM, emptyState());
    expect(result.resolved.articles).toEqual({ 'article-a': 130892 });
    // Not in the state, so its content is unknown: one update brings it in line.
    expect(result.steps.map(s => s.kind)).toEqual(['article.update']);
  });

  it('tells two same-titled posts apart by the snapshot taken before the interrupted write', () => {
    const twins = snapshot({
      ...ON_PLATFORM,
      posts: [...ON_PLATFORM.posts, { ...ON_PLATFORM.posts[0]!, id: 130900 }],
    });
    const ambiguous = plan(full(), twins, emptyState());
    expect(ambiguous.errors.join()).toMatch(/Jobs at airports/);
    const state = { ...emptyState(), pending: { step: 'article.create', key: 'article-a', before: [130892] } };
    const told = plan(full(), twins, state);
    expect(told.errors).toEqual([]);
    expect(told.resolved.articles).toEqual({ 'article-a': 130900 });
  });

  it('refuses two folders with the same article title', () => {
    const contents = full();
    contents.articles = [article('a', '# Same\n\nx'), article('b', '# Same\n\ny')];
    expect(plan(contents, snapshot(), emptyState()).errors.join()).toMatch(/Same/);
  });

  it('resolves the article countries to platform names and refuses one it does not know', () => {
    const contents = full();
    contents.articles = [article('article-a', '---\ntitle: T\ncountry: [DE, Italy]\n---\nx')];
    const result = plan(contents, snapshot(), emptyState());
    expect(result.steps.find(s => s.kind === 'article.create')).toMatchObject({ body: { countries: ['Germany', 'Italy'] } });
    contents.articles = [article('article-a', '---\ntitle: T\ncountry: XX\n---\nx')];
    expect(plan(contents, snapshot(), emptyState()).errors.join()).toMatch(/XX/);
  });

  it('refuses a site the platform does not have, and a placeholder', () => {
    const contents = full();
    contents.topic = { ...contents.topic, site: '999' };
    expect(plan(contents, snapshot(), emptyState()).errors.join()).toMatch(/999/);
    contents.topic = { ...contents.topic, site: 'REPLACE_SITE_ID' };
    expect(plan(contents, snapshot(), emptyState()).errors.join()).toMatch(/site/);
  });
});

describe('firstNew', () => {
  it('is the set difference of the lists before and after a write', () => {
    expect(firstNew([1, 2], [1, 2, 3])).toBe(3);
    expect(firstNew([1, 2], [2, 1])).toBeNull();
    expect(firstNew([], [7])).toBe(7);
  });
});

describe('resolveCountry', () => {
  it('passes All, turns a code into the name, accepts a name in any case', () => {
    expect(resolveCountry('All', COUNTRIES)).toEqual({ ok: true, value: 'All' });
    expect(resolveCountry('de', COUNTRIES)).toEqual({ ok: true, value: 'Germany' });
    expect(resolveCountry('united states', COUNTRIES)).toEqual({ ok: true, value: 'United States' });
    expect(resolveCountry('Mars', COUNTRIES).ok).toBe(false);
  });
});

describe('state', () => {
  it('reads a state file and fills what an older one lacks', () => {
    const result = parseState('{"topic_id": 5}');
    expect(result).toEqual({ ok: true, value: { topic_id: 5, configuration_id: null, termgroups: {}, articles: {}, pending: null, ticket: null, campaigns: {} } });
    const withTicket = parseState('{"ticket": {"id": "869ez", "url": "https://app.clickup.com/t/869ez"}}');
    expect(withTicket.ok && withTicket.value.ticket).toEqual({ id: '869ez', url: 'https://app.clickup.com/t/869ez' });
    expect(parseState('nope').ok).toBe(false);
    expect(parseState('[]').ok).toBe(false);
  });
});

describe('adoptResolved', () => {
  it('writes the ids a plan found by read-back into the state, the article with an empty hash', () => {
    const adopted = adoptResolved(emptyState(), plan(full(), ON_PLATFORM, emptyState()));
    expect(adopted).toMatchObject({ topic_id: 106752, configuration_id: 108397, termgroups: { 'tg-main': 211532 } });
    expect(adopted.articles['article-a']).toEqual({ id: 130892, hash: '' });
  });

  it('keeps the state itself when the plan found nothing it did not already know', () => {
    const state = DONE_STATE();
    expect(adoptResolved(state, plan(full(), ON_PLATFORM, state))).toBe(state);
  });

  it('takes the campaign the platform made from a builder, leaving the rest of the campaign state alone', () => {
    const before: LaunchState = {
      ...DONE_STATE(),
      campaigns: { 'de-a': { ...emptyCampaignState(), builder: { id: 707000, campaign_id: null, campaign_name: null }, headline: { id: 5, text: 'Learn more' } } },
    };
    const planned = plan(full(), ON_PLATFORM, before);
    planned.resolved.campaigns['de-a'] = {
      creatives: {}, headline: null, tsp: null,
      builder: { id: 707000, campaign_id: 1267704, campaign_name: '34-AIVadimSpermIT-tgmain-tk-de-ia-0908-GE01' },
      history: [],
    };
    const adopted = adoptResolved(before, planned);
    expect(adopted.campaigns['de-a']).toMatchObject({
      builder: { id: 707000, campaign_id: 1267704, campaign_name: '34-AIVadimSpermIT-tgmain-tk-de-ia-0908-GE01' },
      headline: { id: 5, text: 'Learn more' },
      pending: null,
    });
  });
});

describe('previewPlan', () => {
  it('shows the whole article with each inlined picture replaced by its size', () => {
    const contents = full();
    const reader = () => ({ mime: 'image/jpeg', base64: 'A'.repeat(4000) });
    const parsed = parseArticle('# T\n\n![a](images/a.jpg)\n\nText.', reader);
    if (!parsed.ok) throw new Error();
    contents.articles = [{ name: 'article-a', article: parsed.value }];
    const shown = previewPlan(plan(contents, snapshot(), emptyState()));
    const step = shown.steps.find(s => s.kind === 'article.create') as unknown as { body: { description: string } };
    expect(step.body.description).toBe('<p><img src="data:image/jpeg;base64,… (3 КБ картинки inline)" alt="a"></p><p>Text.</p>');
  });
});
