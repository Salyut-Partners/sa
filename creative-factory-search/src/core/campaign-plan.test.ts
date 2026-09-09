import { describe, expect, it } from 'vitest';
import { parseArticle } from './article.ts';
import {
  emptyCampaignState, headlineHtml, headlineText, matchUploads, parseCampaignState, sameTsp, tspFieldsOf,
  type CampaignSource, type CampaignState, type PlatformBuilder, type PlatformCampaign, type PlatformCreative, type PlatformTsp,
} from './campaign-plan.ts';
import { parseCampaignManifest, parseTopicManifest, type TopicManifest } from './launch.ts';
import {
  articleHash, campaignOutline, emptyState, narrowPlan, plan, previewPlan, type LaunchContents, type LaunchState, type Snapshot,
  type TermGroupSource,
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
  other:
    ad_account: "53561"
    pixel: "35968"
`;

const CAMPAIGN = `
termgroup: tg-main
article: article-a
language: de
country: DE
account: main
theme: 768
rsoc_count: 5
keyword_rotation: false
headline: Learn more
tsp:
  budget: 20
  bid: 0.45
  launch_tomorrow: true
  end_date: null
`;

const topic = (): TopicManifest => {
  const result = parseTopicManifest(TOPIC);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.value;
};

const campaign = (name: string, over: { yaml?: string; files?: string[]; script?: string } = {}): CampaignSource => {
  const manifest = parseCampaignManifest(over.yaml ?? CAMPAIGN, topic());
  if (!manifest.ok) throw new Error(manifest.errors.join('; '));
  return {
    name,
    manifest: manifest.value,
    script: over.script ?? 'Learn about jobs at airports.',
    creatives: (over.files ?? ['01.mp4', '02.mp4']).map(file => ({ name: file, hash: 'h-' + file })),
  };
};

const COUNTRIES = [{ name: 'Germany', code: 'DE' }, { name: 'Italy', code: 'IT' }];
const SITES = [{ id: 182, url: 'useconsumer.com' }];

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  topics: [{ id: 106752, name: 'AI Vadim Sperm IT', internal_name: 'AIVadimSpermIT', user_id: 1099 }],
  configurations: [{ id: 108397, name: 'AI Vadim Sperm IT', topic_id: 106752, country: 'All', traffic_source: 'tiktok' }],
  termGroups: [{ id: 211532, name: 'tg-main', terms: ['avia sales'], weight: 100, country: 'All', language: 'All' }],
  posts: [{ id: 130892, title: 'Jobs at airports', status: 'Publish', site_id: 182, country: ['All'], language: 'All', topic_ids: [106752] }],
  countries: COUNTRIES,
  sites: SITES,
  creatives: [],
  tsps: [],
  builders: [],
  campaigns: [],
  pixels: [{ id: 35967, name: 'Джобс', ad_account_id: '7680550759062339602' }, { id: 35968, name: 'Лонс', ad_account_id: '7680552058193297426' }],
  adAccounts: [
    { id: 53560, name: 'GB / Salyut_Partners / Account 16', account_id: '7680550759062339602' },
    { id: 53561, name: 'GB / Salyut_Partners / Account 17', account_id: '7680552058193297426' },
  ],
  themes: [{ id: 766, key: 'd', title: 'Default' }, { id: 768, key: 'g', title: 'Dark Gray' }],
  rsocCounts: [3, 4, 5, 6],
  languages: ['English (US)', 'German', 'Italian'],
  ...over,
});

const tg = (name: string, keywords: string[]): TermGroupSource => ({ name, keywords, weight: null, country: 'All', language: 'All' });

const article = (name: string, markdown: string) => {
  const parsed = parseArticle(markdown, () => null);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return { name, article: parsed.value };
};

/** Topic, term group and article all on the platform; the campaign is what is being planned. */
const contents = (...campaigns: CampaignSource[]): LaunchContents => ({
  topic: topic(),
  termgroups: [tg('tg-main', ['avia sales'])],
  articles: [article('article-a', '# Jobs at airports\n\nText.')],
  campaigns,
  notes: [],
});

const topicState = (campaigns: Record<string, CampaignState> = {}): LaunchState => ({
  topic_id: 106752,
  configuration_id: 108397,
  termgroups: { 'tg-main': 211532 },
  articles: { 'article-a': { id: 130892, hash: articleHash(contents().articles[0]!.article, topic(), ['All']) } },
  pending: null,
  campaigns,
});

const video = (id: number, name: string, over: Partial<PlatformCreative> = {}): PlatformCreative => ({
  id, media_type: 'Video', original_filename: name, headline: null, status: 'Approved', ad_script: 'Learn about jobs at airports.', ...over,
});
const headline = (id: number, html: string): PlatformCreative => ({
  id, media_type: 'Headline', original_filename: null, headline: html, status: 'Approved', ad_script: null,
});

const tspOnPlatform = (id: number, over: Partial<PlatformTsp['fields']> = {}): PlatformTsp => ({
  id, name: 'AIVadimSpermIT-tk-DE-db-20', topic_id: 106752,
  fields: {
    budget: 20, bid: 0.45, location: ['Germany'], language: 'All', gender: 'All', age: ['All'], devices: ['All'], os: [],
    launch_tomorrow: true, end_date: null, scheduled: false, ...over,
  },
});

const builderOnPlatform = (id: number, creativeIds: number[], over: Partial<PlatformBuilder> = {}): PlatformBuilder => ({
  id, topic_id: 106752, post_id: 130892, pixel_id: 35967, status: 'APPROVED', creative_ids: creativeIds,
  campaigns: [{ id: 1267704, name: '34-AIVadimSpermIT-tgmain-tk-de-ia-0908-GE01', term_group_id: 211532 }], ...over,
});

/** The state after a full apply of `de-a`, matching the snapshot below. */
const DONE_CAMPAIGN = (): CampaignState => ({
  creatives: { '01.mp4': { id: 1001, hash: 'h-01.mp4' }, '02.mp4': { id: 1002, hash: 'h-02.mp4' } },
  headline: { id: 1503646, text: 'Learn more' },
  tsp: { id: 141653, name: 'AIVadimSpermIT-tk-DE-db-20' },
  builder: { id: 707000, campaign_id: 1267704, campaign_name: '34-AIVadimSpermIT-tgmain-tk-de-ia-0908-GE01' },
  pending: null,
  history: [],
});

const DONE_SNAPSHOT = () => snapshot({
  creatives: [video(1001, '01.mp4'), video(1002, '02.mp4'), headline(1503646, '<p><strong>Learn more</strong></p>')],
  tsps: [tspOnPlatform(141653)],
  builders: [builderOnPlatform(707000, [1503646, 1001, 1002])],
});

const kinds = (result: ReturnType<typeof plan>) => result.steps.map(s => s.kind);

describe('a campaign planned for the first time', () => {
  it('uploads the creatives, makes the headline and the TSP, then the builder — in that order, after the topic steps', () => {
    const result = plan(contents(campaign('de-a')), snapshot(), topicState());
    expect(result.errors).toEqual([]);
    expect(kinds(result)).toEqual(['creatives.upload', 'headline.create', 'tsp.create', 'builder.create']);
  });

  it('uploads every file in one step with the campaign script as ad_script', () => {
    const result = plan(contents(campaign('de-a')), snapshot(), topicState());
    expect(result.steps[0]).toMatchObject({
      kind: 'creatives.upload', campaign: 'de-a', files: ['01.mp4', '02.mp4'],
      body: {
        grade: 'New', language: 'All', ad_script: 'Learn about jobs at airports.', media_type: 'Video',
        traffic_sources: ['tiktok'], topic_ids: [106752], countries: ['Germany'],
      },
    });
  });

  it('wraps the headline the way the admin does', () => {
    const result = plan(contents(campaign('de-a')), snapshot(), topicState());
    expect(result.steps[1]).toMatchObject({
      kind: 'headline.create', campaign: 'de-a', text: 'Learn more',
      body: { headlines: ['<p><strong>Learn more</strong></p>'], countries: ['Germany'], language: 'All', source: 'tiktok', topic_ids: [106752] },
    });
  });

  it('shapes the TSP body as the admin sends it: bid as text, launch tomorrow as 1, no end date as 0', () => {
    const result = plan(contents(campaign('de-a')), snapshot(), topicState());
    expect(result.steps[2]).toMatchObject({
      kind: 'tsp.create', campaign: 'de-a',
      body: {
        topic_id: 106752, traffic_source: 'tiktok', budget_type: 'Daily Budget', budget: 20, bid: '0.45', lunch_tomorrow: 1, end_date: 0,
        age_from: ['All'], gender: 'All', location: ['Germany'], language: 'All', devices: ['All'], device_os: null, schedule: [], quantity: 1,
      },
    });
    const body = (result.steps[2] as { body: { schedule_cells: boolean[][] } }).body;
    expect(body.schedule_cells).toHaveLength(9);
    expect(body.schedule_cells.every(row => row.length === 24 && row.every(cell => cell === false))).toBe(true);
  });

  it('builds the campaign from the ids it has and references to what this plan creates, and says what the directories gave', () => {
    const result = plan(contents(campaign('de-a')), snapshot(), topicState());
    expect(result.steps[3]).toMatchObject({
      kind: 'builder.create', campaign: 'de-a',
      from: { account: 'GB / Salyut_Partners / Account 16 (53560)', pixel: 'Джобс (35967)', theme: 'Dark Gray (768)' },
      body: {
        topic_id: 106752, country: 'Germany', site_id: '182', post_id: 130892, language: 'All', monetization_type: 'RSOC',
        rsoc_count: '5', conversion_event_type: 'Purchase', pixel_id: '35967', traffic_source: 'tiktok',
        traffic_source_profile_ids: [{ tsp: 'de-a' }],
        creative_repo_ids: [{ campaign: 'de-a', headline: 'Learn more' }, { campaign: 'de-a', file: '01.mp4' }, { campaign: 'de-a', file: '02.mp4' }],
        term_group_ids: [211532], ad_account_ids: ['53560'], use_ad_title_as_referrer_ad_text: '0', use_keyword_rotation: '0', themes: ['768'],
      },
    });
  });

  it('references the topic, term group and post this same plan creates when nothing is on the platform yet', () => {
    const result = plan(contents(campaign('de-a')), snapshot({ topics: [], configurations: [], termGroups: [], posts: [] }), emptyState());
    expect(result.errors).toEqual([]);
    expect(kinds(result)).toEqual([
      'topic.create', 'configuration.create', 'termgroup.create', 'termgroup.weight', 'article.create',
      'creatives.upload', 'headline.create', 'tsp.create', 'builder.create',
    ]);
    expect(result.steps[8]).toMatchObject({
      body: { topic_id: { after: 'topic' }, post_id: { article: 'article-a' }, term_group_ids: [{ termgroup: 'tg-main' }] },
    });
  });

  it('is the same plan however many times it is asked', () => {
    expect(plan(contents(campaign('de-a')), snapshot(), topicState())).toEqual(plan(contents(campaign('de-a')), snapshot(), topicState()));
  });
});

describe('a campaign already on the platform', () => {
  it('plans nothing when the state holds every id and the files did not change', () => {
    const result = plan(contents(campaign('de-a')), DONE_SNAPSHOT(), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(result.errors).toEqual([]);
    expect(result.steps).toEqual([]);
  });

  it('does not make a second TSP or builder on a second apply', () => {
    const state = topicState({ 'de-a': { ...DONE_CAMPAIGN(), builder: null } });
    const result = plan(contents(campaign('de-a')), DONE_SNAPSHOT(), state);
    // The builder is found on the platform by its post and creatives, not made again.
    expect(kinds(result)).toEqual([]);
    expect(result.resolved.campaigns['de-a']?.builder).toEqual({
      id: 707000, campaign_id: 1267704, campaign_name: '34-AIVadimSpermIT-tgmain-tk-de-ia-0908-GE01',
    });
    expect(result.warnings.join()).toMatch(/707000/);
  });

  it('learns the campaign id and name the platform composed once they appear', () => {
    const state = topicState({ 'de-a': { ...DONE_CAMPAIGN(), builder: { id: 707000, campaign_id: null, campaign_name: null } } });
    const result = plan(contents(campaign('de-a')), DONE_SNAPSHOT(), state);
    expect(result.steps).toEqual([]);
    expect(result.resolved.campaigns['de-a']?.builder).toMatchObject({ campaign_id: 1267704, campaign_name: '34-AIVadimSpermIT-tgmain-tk-de-ia-0908-GE01' });
  });

  it('adopts creatives and the headline the topic already holds under the same names rather than uploading twins', () => {
    const result = plan(contents(campaign('de-a')), DONE_SNAPSHOT(), topicState());
    expect(kinds(result)).toEqual([]);
    expect(result.resolved.campaigns['de-a']).toMatchObject({
      creatives: { '01.mp4': { id: 1001, hash: 'h-01.mp4' }, '02.mp4': { id: 1002, hash: 'h-02.mp4' } },
      headline: { id: 1503646, text: 'Learn more' },
      tsp: { id: 141653, name: 'AIVadimSpermIT-tk-DE-db-20' },
      builder: { id: 707000 },
    });
  });

  it('after six of twelve files went up, uploads only the six that are missing', () => {
    const files = Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}.mp4`);
    const uploaded = files.slice(0, 6).map((name, i) => video(2000 + i, name));
    const state = topicState({ 'de-a': { ...emptyCampaignState(), pending: { step: 'creatives.upload', key: 'de-a', before: [] } } });
    const result = plan(contents(campaign('de-a', { files })), snapshot({ creatives: uploaded }), state);
    expect(result.errors).toEqual([]);
    expect(result.steps[0]).toMatchObject({ kind: 'creatives.upload', files: files.slice(6) });
    expect(Object.keys(result.resolved.campaigns['de-a']?.creatives ?? {})).toEqual(files.slice(0, 6));
  });

  it('tells a file re-uploaded after a crash from its namesake by the list taken before the send', () => {
    const twins = snapshot({ creatives: [video(1001, '01.mp4'), video(1005, '01.mp4')] });
    const state = topicState({ 'de-a': { ...emptyCampaignState(), pending: { step: 'creatives.upload', key: 'de-a', before: [1001] } } });
    const result = plan(contents(campaign('de-a', { files: ['01.mp4'] })), twins, state);
    expect(result.errors).toEqual([]);
    expect(result.resolved.campaigns['de-a']?.creatives).toEqual({ '01.mp4': { id: 1005, hash: 'h-01.mp4' } });
    const blind = plan(contents(campaign('de-a', { files: ['01.mp4'] })), twins, topicState());
    expect(blind.errors.join()).toMatch(/01\.mp4/);
  });

  it('takes the newest of two new namesakes an interrupted upload left, as apply would, and says so', () => {
    const twins = snapshot({ creatives: [video(1001, '01.mp4'), video(1005, '01.mp4'), video(1006, '01.mp4')] });
    const state = topicState({ 'de-a': { ...emptyCampaignState(), pending: { step: 'creatives.upload', key: 'de-a', before: [1001] } } });
    const result = plan(contents(campaign('de-a', { files: ['01.mp4'] })), twins, state);
    expect(result.errors).toEqual([]);
    expect(result.resolved.campaigns['de-a']?.creatives).toEqual({ '01.mp4': { id: 1006, hash: 'h-01.mp4' } });
    expect(result.warnings.join()).toMatch(/1006/);
  });

  it('uploads a file again when its content changed before the campaign was built', () => {
    const state = topicState({ 'de-a': { ...DONE_CAMPAIGN(), builder: null } });
    const remade = campaign('de-a');
    remade.creatives[0] = { name: '01.mp4', hash: 'h-remade' };
    const result = plan(contents(remade), snapshot({ creatives: DONE_SNAPSHOT().creatives, tsps: DONE_SNAPSHOT().tsps }), state);
    expect(result.steps[0]).toMatchObject({ kind: 'creatives.upload', files: ['01.mp4'] });
    expect(result.steps.find(s => s.kind === 'builder.create')).toMatchObject({
      body: { creative_repo_ids: [1503646, { campaign: 'de-a', file: '01.mp4' }, 1002] },
    });
  });


  it('updates the TSP in place when the manifest budget changed and the campaign is not built yet', () => {
    const changed = campaign('de-a', { yaml: CAMPAIGN.replace('budget: 20', 'budget: 30') });
    const state = topicState({ 'de-a': { ...DONE_CAMPAIGN(), builder: null } });
    const result = plan(contents(changed), DONE_SNAPSHOT(), state);
    expect(result.steps[0]).toMatchObject({ kind: 'tsp.update', id: 141653, name: 'AIVadimSpermIT-tk-DE-db-20', body: { budget: 30 } });
  });

  it('gives the campaign a profile of its own instead when another campaign shares the one it had', () => {
    const changed = campaign('de-a', { yaml: CAMPAIGN.replace('budget: 20', 'budget: 30') });
    const state = topicState({ 'de-a': { ...DONE_CAMPAIGN(), builder: null }, 'de-b': DONE_CAMPAIGN() });
    const unbuilt = snapshot({ creatives: DONE_SNAPSHOT().creatives, tsps: DONE_SNAPSHOT().tsps });
    const result = plan(contents(changed), unbuilt, state);
    expect(kinds(result)).toEqual(['tsp.create', 'builder.create']);
    expect(result.steps[0]).toMatchObject({ kind: 'tsp.create', fields: { budget: 30 }, body: { budget: 30 } });
    expect(result.warnings.join()).toMatch(/de-b/);
  });
});

describe('a relaunch: the campaign was built and a creative in the folder changed', () => {
  const live = (over: Partial<PlatformCampaign> = {}): PlatformCampaign => ({
    id: 1267704, name: '34-AIVadimSpermIT-tgmain-tk-de-ia-0908-GE01', status: 'ACTIVE', published: true, revenue: 1.2, spend: null, ...over,
  });
  const remade = () => {
    const c = campaign('de-a');
    c.creatives[0] = { name: '01.mp4', hash: 'h-remade' };
    return c;
  };
  const withOld = (campaigns: PlatformCampaign[], over: Partial<PlatformBuilder> = {}) =>
    snapshot({ ...DONE_SNAPSHOT(), builders: [builderOnPlatform(707000, [1503646, 1001, 1002], over)], campaigns });

  it('uploads the changed file and builds a new campaign from the same post, term group and the new creative id', () => {
    const result = plan(contents(remade()), withOld([live()]), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(result.errors).toEqual([]);
    expect(kinds(result)).toEqual(['creatives.upload', 'builder.create', 'campaign.pause']);
    expect(result.steps[0]).toMatchObject({ kind: 'creatives.upload', files: ['01.mp4'] });
    expect(result.steps[1]).toMatchObject({
      kind: 'builder.create',
      body: { post_id: 130892, term_group_ids: [211532], creative_repo_ids: [1503646, { campaign: 'de-a', file: '01.mp4' }, 1002], traffic_source_profile_ids: [141653] },
      retires: { builder: { id: 707000, campaign_id: 1267704 }, creatives: { '01.mp4': { id: 1001 }, '02.mp4': { id: 1002 } }, fate: 'live' },
    });
    expect(result.warnings.join()).toMatch(/30 хвилин/);
  });

  it('pauses the old campaign by its campaign id, not the builder id, when it is live and in the analytics', () => {
    const result = plan(contents(remade()), withOld([live()]), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(result.steps[2]).toMatchObject({ kind: 'campaign.pause', campaign: 'de-a', body: { status: 'PAUSED', campaign_ids: [1267704] } });
    const spent = plan(contents(remade()), withOld([live({ revenue: 0, spend: 0.4 })]), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(kinds(spent)).toContain('campaign.pause');
  });

  it('leaves a live campaign alone until its first cent is in the analytics, and says why', () => {
    const result = plan(contents(remade()), withOld([live({ revenue: 0, spend: null })]), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(kinds(result)).toEqual(['creatives.upload', 'builder.create']);
    expect(result.warnings.join()).toMatch(/аналітиц/);
    expect(result.resolved.campaigns['de-a']?.history).toMatchObject([{ builder: { id: 707000 }, fate: 'live' }]);
  });

  it('has nothing to pause when the old campaign was rejected before publication', () => {
    const result = plan(contents(remade()), withOld([], { campaigns: [], status: 'Rejected' }), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(kinds(result)).toEqual(['creatives.upload', 'builder.create']);
    expect(result.resolved.campaigns['de-a']?.history).toMatchObject([{ fate: 'unpublished' }]);
    const pending = plan(contents(remade()), withOld([live({ status: 'PENDING', published: false })]), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(kinds(pending)).toEqual(['creatives.upload', 'builder.create']);
    expect(pending.resolved.campaigns['de-a']?.history).toMatchObject([{ fate: 'unpublished' }]);
  });

  it('has nothing to pause when the provider already took it down, or it is paused already', () => {
    const deleted = plan(contents(remade()), withOld([live({ status: 'DELETED' })]), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(kinds(deleted)).toEqual(['creatives.upload', 'builder.create']);
    expect(deleted.resolved.campaigns['de-a']?.history).toMatchObject([{ fate: 'deleted' }]);
    const paused = plan(contents(remade()), withOld([live({ status: 'PAUSED' })]), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(kinds(paused)).toEqual(['creatives.upload', 'builder.create']);
    expect(paused.resolved.campaigns['de-a']?.history).toMatchObject([{ fate: 'paused' }]);
  });

  it('does not touch a campaign the list does not show, and says so', () => {
    const result = plan(contents(remade()), withOld([]), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(kinds(result)).toEqual(['creatives.upload', 'builder.create']);
    expect(result.warnings.join()).toMatch(/1267704/);
  });

  it('is also a relaunch when a file was taken out of the folder', () => {
    const result = plan(contents(campaign('de-a', { files: ['02.mp4'] })), withOld([live()]), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(kinds(result)).toEqual(['builder.create', 'campaign.pause']);
    expect(result.steps[0]).toMatchObject({ body: { creative_repo_ids: [1503646, 1002] } });
  });

  it('plans the pause again when an earlier apply built the new campaign but never paused the old', () => {
    const state = topicState({ 'de-a': {
      ...DONE_CAMPAIGN(),
      creatives: { '01.mp4': { id: 1005, hash: 'h-remade' }, '02.mp4': { id: 1002, hash: 'h-02.mp4' } },
      builder: { id: 707001, campaign_id: null, campaign_name: null },
      history: [{ builder: { id: 707000, campaign_id: 1267704, campaign_name: 'old' }, creatives: DONE_CAMPAIGN().creatives, fate: 'live' }],
    } });
    const both = snapshot({
      ...DONE_SNAPSHOT(),
      creatives: [...DONE_SNAPSHOT().creatives, video(1005, '01.mp4')],
      builders: [builderOnPlatform(707000, [1503646, 1001, 1002]), builderOnPlatform(707001, [1503646, 1005, 1002], { campaigns: [] })],
      campaigns: [live()],
    });
    const result = plan(contents(remade()), both, state);
    expect(kinds(result)).toEqual(['campaign.pause']);
    expect(result.steps[0]).toMatchObject({ body: { campaign_ids: [1267704] } });
    // Once the platform shows it paused, the history says so and nothing is planned.
    const settled = plan(contents(remade()), { ...both, campaigns: [live({ status: 'PAUSED' })] }, state);
    expect(settled.steps).toEqual([]);
    expect(settled.resolved.campaigns['de-a']?.history).toMatchObject([{ builder: { id: 707000 }, fate: 'paused' }]);
  });

  it('adopts the new builder a crashed apply made, found by its creative set, and retires the old one', () => {
    const state = topicState({ 'de-a': {
      ...DONE_CAMPAIGN(),
      creatives: { '01.mp4': { id: 1005, hash: 'h-remade' }, '02.mp4': { id: 1002, hash: 'h-02.mp4' } },
      pending: { step: 'builder.create', key: 'de-a', before: [] },
    } });
    const both = snapshot({
      ...DONE_SNAPSHOT(),
      creatives: [...DONE_SNAPSHOT().creatives, video(1005, '01.mp4')],
      builders: [builderOnPlatform(707000, [1503646, 1001, 1002]), builderOnPlatform(707001, [1503646, 1005, 1002], { campaigns: [] })],
      campaigns: [live()],
    });
    const result = plan(contents(remade()), both, state);
    expect(kinds(result)).toEqual(['campaign.pause']);
    expect(result.resolved.campaigns['de-a']).toMatchObject({
      builder: { id: 707001 },
      history: [{ builder: { id: 707000, campaign_id: 1267704 }, fate: 'live' }],
    });
  });

  it('keeps every earlier campaign of the folder, not only the last', () => {
    const state = topicState({ 'de-a': {
      ...DONE_CAMPAIGN(),
      history: [{ builder: { id: 706000, campaign_id: 1260000, campaign_name: 'first' }, creatives: {}, fate: 'paused' }],
    } });
    const result = plan(contents(remade()), withOld([live()]), state);
    expect(result.resolved.campaigns['de-a']?.history.map(h => h.builder.id)).toEqual([706000, 707000]);
  });

  it('is the same plan when nothing changed after a relaunch', () => {
    const state = topicState({ 'de-a': {
      ...DONE_CAMPAIGN(),
      creatives: { '01.mp4': { id: 1005, hash: 'h-remade' }, '02.mp4': { id: 1002, hash: 'h-02.mp4' } },
      builder: { id: 707001, campaign_id: null, campaign_name: null },
      history: [{ builder: { id: 707000, campaign_id: 1267704, campaign_name: 'old' }, creatives: DONE_CAMPAIGN().creatives, fate: 'paused' }],
    } });
    const both = snapshot({
      ...DONE_SNAPSHOT(),
      creatives: [...DONE_SNAPSHOT().creatives, video(1005, '01.mp4')],
      builders: [builderOnPlatform(707000, [1503646, 1001, 1002]), builderOnPlatform(707001, [1503646, 1005, 1002], { campaigns: [] })],
      campaigns: [live({ status: 'PAUSED' })],
    });
    expect(plan(contents(remade()), both, state).steps).toEqual([]);
  });
});

describe('two campaigns in one plan', () => {
  it('share the headline and the TSP when they are the same, and the second references the first', () => {
    const result = plan(contents(campaign('de-a'), campaign('de-b', { files: ['11.mp4'] })), snapshot(), topicState());
    expect(result.errors).toEqual([]);
    expect(kinds(result)).toEqual([
      'creatives.upload', 'headline.create', 'tsp.create', 'builder.create',
      'creatives.upload', 'builder.create',
    ]);
    expect(result.steps[5]).toMatchObject({
      body: { traffic_source_profile_ids: [{ tsp: 'de-a' }], creative_repo_ids: [{ campaign: 'de-a', headline: 'Learn more' }, { campaign: 'de-b', file: '11.mp4' }] },
    });
  });

  it('refuses the same file name in two campaigns of one plan', () => {
    const result = plan(contents(campaign('de-a'), campaign('de-b')), snapshot(), topicState());
    expect(result.errors.join()).toMatch(/01\.mp4/);
  });
});

describe('the plan for one campaign', () => {
  it('keeps the topic steps, the campaign\'s own, and the steps of another campaign it leans on', () => {
    const whole = plan(contents(campaign('de-a'), campaign('de-b', { files: ['11.mp4'] })), snapshot({ topics: [], configurations: [], termGroups: [], posts: [] }), emptyState());
    const b = narrowPlan(whole, 'de-b');
    expect(kinds(b)).toEqual([
      'topic.create', 'configuration.create', 'termgroup.create', 'termgroup.weight', 'article.create',
      'headline.create', 'tsp.create', 'creatives.upload', 'builder.create',
    ]);
    // de-a's headline and TSP are there because de-b's builder points at them; de-a's own upload and builder are not.
    expect(b.steps.filter(s => 'campaign' in s && s.campaign === 'de-a').map(s => s.kind)).toEqual(['headline.create', 'tsp.create']);
    const a = narrowPlan(whole, 'de-a');
    expect(a.steps.filter(s => 'campaign' in s).every(s => s.campaign === 'de-a')).toBe(true);
  });

  it('leaves out the errors and warnings of the other campaigns and keeps the topic\'s', () => {
    const broken = campaign('de-b', { files: ['11.mp4'] });
    broken.manifest = { ...broken.manifest, account: 'ghost' };
    const whole = plan({ ...contents(campaign('de-a'), broken), notes: ['campaigns/de-c: у creatives/ немає mp4 — кампанію пропущено'] }, snapshot(), topicState());
    expect(whole.errors.join()).toMatch(/ghost/);
    const a = narrowPlan(whole, 'de-a');
    expect(a.errors).toEqual([]);
    expect(a.warnings).toEqual([]);
    expect(narrowPlan(whole, 'de-b').errors.join()).toMatch(/ghost/);
    expect(narrowPlan(whole, 'de-c').warnings.join()).toMatch(/de-c/);
    expect(a.resolved).toBe(whole.resolved);
  });

  it('is outlined per folder: how many steps, whether it is a relaunch, whether it has errors', () => {
    const remade = campaign('de-a');
    remade.creatives[0] = { name: '01.mp4', hash: 'h-remade' };
    const broken = campaign('de-b', { files: ['11.mp4'] });
    broken.manifest = { ...broken.manifest, account: 'ghost' };
    const whole = plan(contents(remade, broken), snapshot({ ...DONE_SNAPSHOT(), campaigns: [] }), topicState({ 'de-a': DONE_CAMPAIGN() }));
    expect(campaignOutline(whole, ['de-a', 'de-b', 'de-c'])).toEqual([
      { name: 'de-a', steps: 2, relaunch: true, errors: 0 },
      { name: 'de-b', steps: 0, relaunch: false, errors: 1 },
      { name: 'de-c', steps: 0, relaunch: false, errors: 0 },
    ]);
  });
});

describe('what stops a campaign plan', () => {
  it('a cabinet the topic map does not have', () => {
    const c = campaign('de-a');
    c.manifest = { ...c.manifest, account: 'ghost' };
    expect(plan(contents(c), snapshot(), topicState()).errors.join()).toMatch(/ghost/);
  });

  it('an ad account or pixel the platform does not list; a pixel made under another account is fine, as the real launches pair them', () => {
    const c = campaign('de-a');
    const off = { ...topic(), accounts: { main: { ad_account: '1', pixel: '35967' } } };
    expect(plan({ ...contents(c), topic: off }, snapshot(), topicState()).errors.join()).toMatch(/кабінет/);
    const noPixel = { ...topic(), accounts: { main: { ad_account: '53560', pixel: '1' } } };
    expect(plan({ ...contents(c), topic: noPixel }, snapshot(), topicState()).errors.join()).toMatch(/піксел/);
    const swapped = { ...topic(), accounts: { main: { ad_account: '53560', pixel: '35968' } } };
    const result = plan({ ...contents(c), topic: swapped }, snapshot(), topicState());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('a theme, rsoc count, country, language, age band or gender the platform does not know', () => {
    const bad = (yaml: string) => plan(contents(campaign('de-a', { yaml })), snapshot(), topicState()).errors.join();
    expect(bad(CAMPAIGN.replace('theme: 768', 'theme: 999'))).toMatch(/999/);
    expect(bad(CAMPAIGN.replace('rsoc_count: 5', 'rsoc_count: 9'))).toMatch(/rsoc/);
    expect(bad(CAMPAIGN.replace('country: DE', 'country: XX'))).toMatch(/XX/);
    expect(bad(CAMPAIGN + '  language: Klingon\n')).toMatch(/Klingon/);
    expect(bad(CAMPAIGN + '  age: [12-15]\n')).toMatch(/12-15/);
    expect(bad(CAMPAIGN + '  gender: other\n')).toMatch(/other/);
  });

  it('a theme by key or title is accepted and resolved to its id', () => {
    for (const theme of ['g', 'Dark Gray', 'dark gray']) {
      const result = plan(contents(campaign('de-a', { yaml: CAMPAIGN.replace('theme: 768', `theme: ${theme}`) })), snapshot(), topicState());
      expect(result.errors).toEqual([]);
      expect(result.steps.find(s => s.kind === 'builder.create')).toMatchObject({ body: { themes: ['768'] } });
    }
  });

  it('a schedule, which the request form was never taken for', () => {
    expect(plan(contents(campaign('de-a', { yaml: CAMPAIGN + '  schedule: [mon 9-18]\n' })), snapshot(), topicState()).errors.join()).toMatch(/розклад/);
  });

  it('a term group or article the folder does not have, an empty script, no creatives', () => {
    const noGroup = campaign('de-a');
    noGroup.manifest = { ...noGroup.manifest, termgroup: 'tg-none' };
    expect(plan(contents(noGroup), snapshot(), topicState()).errors.join()).toMatch(/tg-none/);
    const noArticle = campaign('de-a');
    noArticle.manifest = { ...noArticle.manifest, article: 'nope' };
    expect(plan(contents(noArticle), snapshot(), topicState()).errors.join()).toMatch(/nope/);
    expect(plan(contents(campaign('de-a', { script: '  ' })), snapshot(), topicState()).errors.join()).toMatch(/script\.md/);
    expect(plan(contents(campaign('de-a', { files: [] })), snapshot(), topicState()).errors.join()).toMatch(/creatives/);
  });

  it('a manifest with placeholders still in it', () => {
    const yaml = CAMPAIGN.replace('country: DE', 'country: "REPLACE_COUNTRY"').replace('theme: 768', 'theme: "REPLACE_THEME_ID"');
    const errors = plan(contents(campaign('de-a', { yaml })), snapshot(), topicState()).errors.join();
    expect(errors).toMatch(/REPLACE_COUNTRY/);
    expect(errors).toMatch(/REPLACE_THEME_ID/);
  });

  it('carries the folder notes as warnings', () => {
    const result = plan({ ...contents(), notes: ['campaigns/example: creatives/ порожня — кампанію пропущено'] }, snapshot(), topicState());
    expect(result.warnings).toContain('campaigns/example: creatives/ порожня — кампанію пропущено');
  });
});

describe('matchUploads', () => {
  const before = [1001];
  const after = [video(1001, '01.mp4'), video(1002, '02.mp4'), video(1003, '03.mp4'), video(1004, '03.mp4')];

  it('pairs each expected name with the one new entry that carries it', () => {
    expect(matchUploads(before, after, ['02.mp4'])).toEqual({ ids: { '02.mp4': 1002 }, ambiguous: [], missing: [] });
  });

  it('ignores an entry that was there before, even under the expected name', () => {
    expect(matchUploads(before, after, ['01.mp4'])).toEqual({ ids: {}, ambiguous: [], missing: ['01.mp4'] });
  });

  it('takes the newest when a retry left two new entries with one name, and says so', () => {
    expect(matchUploads(before, after, ['03.mp4'])).toEqual({ ids: { '03.mp4': 1004 }, ambiguous: ['03.mp4'], missing: [] });
  });

  it('names what the platform never showed', () => {
    expect(matchUploads(before, after, ['09.mp4']).missing).toEqual(['09.mp4']);
  });

  it('does not match a headline to a file name', () => {
    expect(matchUploads([], [headline(5, '<p>02.mp4</p>'), { ...video(6, '02.mp4'), media_type: 'Headline' }], ['02.mp4']).ids).toEqual({});
  });
});

describe('headline text', () => {
  it('is the words with the markup and entities taken off', () => {
    expect(headlineText('<p><strong>Learn more</strong></p>')).toBe('Learn more');
    expect(headlineText('<h3>L&auml;s mer!</h3>')).toBe('Läs mer!');
    expect(headlineText('<p>Tom &amp; Jerry&nbsp; </p>')).toBe('Tom & Jerry');
    expect(headlineText(null)).toBe('');
  });

  it('is wrapped the way the admin wraps it, with the text escaped', () => {
    expect(headlineHtml('Learn more')).toBe('<p><strong>Learn more</strong></p>');
    expect(headlineHtml('Tom & <Jerry>')).toBe('<p><strong>Tom &amp; &lt;Jerry&gt;</strong></p>');
    expect(headlineText(headlineHtml('Tom & <Jerry>'))).toBe('Tom & <Jerry>');
  });
});

describe('TSP fields', () => {
  it('compare by what the buyer sets, whatever order the lists come in', () => {
    const a = tspFieldsOf({ ...campaign('de-a').manifest.tsp, age: ['25-34', '18-24'] }, 'Germany', 'All');
    const b = { ...a, age: ['18-24', '25-34'] };
    expect(sameTsp(a, b)).toBe(true);
    expect(sameTsp(a, { ...a, bid: 0.5 })).toBe(false);
    expect(sameTsp(a, { ...a, location: ['Italy'] })).toBe(false);
  });
});

describe('campaign state', () => {
  it('reads a file and fills what it lacks', () => {
    const parsed = parseCampaignState('{"creatives":{"01.mp4":{"id":5,"hash":"x"}},"tsp":{"id":7,"name":"n"}}');
    expect(parsed).toEqual({
      ok: true,
      value: { creatives: { '01.mp4': { id: 5, hash: 'x' } }, headline: null, tsp: { id: 7, name: 'n' }, builder: null, pending: null, history: [] },
    });
    expect(parseCampaignState('[]').ok).toBe(false);
  });

  it('keeps the history of earlier campaigns of the folder', () => {
    const parsed = parseCampaignState(JSON.stringify({
      builder: { id: 2, campaign_id: null, campaign_name: null },
      history: [{ builder: { id: 1, campaign_id: 10, campaign_name: 'old' }, creatives: { '01.mp4': { id: 5, hash: 'x' } }, fate: 'paused' }, { nonsense: true }],
    }));
    expect(parsed.ok && parsed.value.history).toEqual([
      { builder: { id: 1, campaign_id: 10, campaign_name: 'old' }, creatives: { '01.mp4': { id: 5, hash: 'x' } }, fate: 'paused' },
    ]);
  });
});

describe('previewPlan', () => {
  it('folds the schedule grid into a line', () => {
    const shown = previewPlan(plan(contents(campaign('de-a')), snapshot(), topicState()));
    const tsp = shown.steps.find(s => s.kind === 'tsp.create') as unknown as { body: { schedule_cells: unknown } };
    expect(tsp.body.schedule_cells).toBe('9×24, жодної клітинки');
  });
});
