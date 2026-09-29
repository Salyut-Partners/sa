import { describe, expect, it } from 'vitest';
import { emptyCampaignState, type CampaignState, type PlatformBuilder, type PlatformCampaign } from './campaign-plan.ts';
import { emptyState, type CampaignOutline, type LaunchState } from './plan.ts';
import {
  BUILDER_ADMIN_URL, buildTopicTable, campaignClipboard, emptyPlatformStatus, launchable, launchColumn, NO_CABINET, platformColumn, topicClipboard,
  type PlatformStatus, type TopicFolder,
} from './topic-table.ts';

const TOPIC = `
launch_key: ai-jobs-de
name: AI jobs DE
site: 182
accounts:
  main-tk: { source: tiktok, ad_account: "53560", pixel: "35967" }
  fb-1: { source: facebook, ad_account: "9001", pixel: "9002" }
`;

const CAMPAIGN = (account: string, language = 'de', country = 'DE') => `
termgroup: tg-wh
article: a-wh
language: ${language}
country: ${country}
account: ${account}
theme: 768
rsoc_count: 5
headline: Learn more
tsp: { budget: 20, bid: 0.45 }
`;

const folder = (over: Partial<TopicFolder> = {}): TopicFolder => ({
  key: 'ai-jobs-de',
  topicYaml: TOPIC,
  paths: [
    'topic.yaml',
    'campaigns/de-de-main-tk/campaign.yaml', 'campaigns/de-de-main-tk/script.md',
    'campaigns/de-de-main-tk/creatives/01.mp4', 'campaigns/de-de-main-tk/creatives/02.mp4', 'campaigns/de-de-main-tk/creatives/rejected/03.mp4',
    'campaigns/de-de-fb-1/campaign.yaml', 'campaigns/de-de-fb-1/creatives/01.mp4',
    'campaigns/de-at-main-tk/campaign.yaml',
  ],
  manifests: {
    'de-de-main-tk': CAMPAIGN('main-tk'),
    'de-de-fb-1': CAMPAIGN('fb-1'),
    'de-at-main-tk': CAMPAIGN('main-tk', 'de', 'AT'),
  },
  scripts: { 'de-de-main-tk': true, 'de-de-fb-1': false, 'de-at-main-tk': false },
  batches: ['0911-1432'],
  ...over,
});

const built = (builderId: number, campaignId: number | null = null): CampaignState => ({
  ...emptyCampaignState(),
  builder: { id: builderId, campaign_id: campaignId, campaign_name: campaignId === null ? null : `34-AIjobsDE-${campaignId}` },
});

const state = (campaigns: Record<string, CampaignState> = {}): LaunchState => ({ ...emptyState(), campaigns });

const builder = (id: number, over: Partial<PlatformBuilder> = {}): PlatformBuilder => ({
  id, topic_id: 1, post_id: 2, pixel_id: 3, status: 'APPROVED', traffic_source: 'tiktok', creative_ids: [], campaigns: [], rejection: null, review: [], ...over,
});
const campaign = (id: number, status: string): PlatformCampaign =>
  ({ id, name: `34-AIjobsDE-${id}`, status, published: true, revenue: 0, spend: null, budget: 20, bid: 0.45 });

const platform = (over: Partial<PlatformStatus> = {}): PlatformStatus => ({ builders: [], campaigns: [], at: '2026-09-11T12:00:00Z', note: null, ...over });

const outline = (name: string, over: Partial<CampaignOutline> = {}): CampaignOutline => ({ name, steps: 0, kept: [], relaunch: false, errors: 0, ...over });

describe('the topic table', () => {
  it('is source → cabinet → campaigns, from the manifests, with the file counts and the script beside each', () => {
    const table = buildTopicTable(folder(), state(), null, null);
    expect(table.problem).toBeNull();
    expect(table.name).toBe('AI jobs DE');
    expect(table.sources.map(s => [s.source, s.accounts.map(a => [a.alias, a.adAccount, a.campaigns.map(c => c.name)])])).toEqual([
      ['tiktok', [['main-tk', '53560', ['de-at-main-tk', 'de-de-main-tk']]]],
      ['facebook', [['fb-1', '9001', ['de-de-fb-1']]]],
    ]);
    const first = table.sources[0]!.accounts[0]!.campaigns[1]!;
    expect(first).toMatchObject({ language: 'de', country: 'DE', account: 'main-tk', disk: { creatives: 2, rejected: 1, script: true, problem: null } });
    expect(table.sources[1]!.accounts[0]!.campaigns[0]!.disk).toEqual({ creatives: 1, rejected: 0, script: false, problem: null, changed: false });
    expect(table.batches).toEqual(['0911-1432']);
  });

  it('has a totals row per cabinet, per source and for the topic: campaigns, built, active, rejected, without creatives', () => {
    const table = buildTopicTable(
      folder(),
      state({ 'de-de-main-tk': built(700, 1000), 'de-de-fb-1': built(701) }),
      null,
      platform({
        builders: [builder(700, { campaigns: [{ id: 1000, name: 'x', term_group_id: null }] }), builder(701, { status: 'NOT_APPROVED', rejection: { reasons: ['Policy Violation'], details: '' } })],
        campaigns: [campaign(1000, 'ACTIVE')],
      }),
    );
    expect(table.sources[0]!.totals).toEqual({ campaigns: 2, built: 1, active: 1, rejected: 0, withoutCreatives: 1 });
    expect(table.sources[1]!.totals).toEqual({ campaigns: 1, built: 1, active: 0, rejected: 1, withoutCreatives: 0 });
    expect(table.totals).toEqual({ campaigns: 3, built: 2, active: 1, rejected: 1, withoutCreatives: 1 });
  });

  it('keeps a cabinet with no campaigns as an empty row, and closes with «без кабінету» for a campaign naming none the topic has', () => {
    const table = buildTopicTable(folder({
      paths: ['topic.yaml', 'campaigns/ghost/campaign.yaml', 'campaigns/ghost/creatives/01.mp4', 'campaigns/bare/creatives/01.mp4'],
      manifests: { ghost: CAMPAIGN('ghost') },
      scripts: {},
    }), state(), null, null);
    expect(table.sources.map(s => [s.source, s.accounts.map(a => [a.alias, a.campaigns.map(c => c.name)])])).toEqual([
      ['tiktok', [['main-tk', []]]],
      ['facebook', [['fb-1', []]]],
      [NO_CABINET, [[NO_CABINET, ['bare', 'ghost']]]],
    ]);
    const [bare, ghost] = table.sources[2]!.accounts[0]!.campaigns;
    expect(bare!.disk.problem).toMatch(/campaign\.yaml/);
    expect(ghost!.disk.problem).toMatch(/ghost/);
    expect(ghost!.launch.kind).toBe('errors');
  });

  it('names a topic manifest that does not read, by key, and still lists the campaigns', () => {
    const table = buildTopicTable(folder({ topicYaml: 'name: [' }), state(), null, null);
    expect(table.problem).toMatch(/topic\.yaml/);
    expect(table.name).toBe('ai-jobs-de');
    expect(table.sources[0]!.source).toBe(NO_CABINET);
    expect(table.sources[0]!.accounts[0]!.campaigns).toHaveLength(3);
  });

  it('is offered for launch where a campaign is unbuilt with steps and no errors; relaunches and drafts are not', () => {
    const table = buildTopicTable(
      folder(),
      state({ 'de-de-fb-1': built(701) }),
      [outline('de-de-main-tk', { steps: 4 }), outline('de-de-fb-1', { steps: 2, relaunch: true }), outline('de-at-main-tk', { steps: 3 })],
      null,
    );
    expect(launchable(table)).toEqual(['de-de-main-tk']);
  });

  it('sees files changed since the launch by their hashes against the state, with no plan and no platform', () => {
    const launched = { ...built(700), creatives: { '01.mp4': { id: 1, hash: 'h1' }, '02.mp4': { id: 2, hash: 'h2' } } };
    const read = (hashes: Record<string, string>) => buildTopicTable(
      folder({ hashes: { 'de-de-main-tk': hashes } }),
      state({ 'de-de-main-tk': launched }),
      null,
      null,
    ).sources[0]!.accounts[0]!.campaigns.find(c => c.name === 'de-de-main-tk')!.launch;
    expect(read({ '01.mp4': 'h1', '02.mp4': 'h2' })).toMatchObject({ kind: 'built', label: 'залита' });
    expect(read({ '01.mp4': 'h1', '02.mp4': 'remade' })).toMatchObject({ kind: 'changed' });
    expect(read({ '01.mp4': 'h1', '02.mp4': 'h2', '03.mp4': 'new' })).toMatchObject({ kind: 'changed' });
  });

  it('names a cabinet as the platform does, off the buyer\'s builders, and keeps the id beside it for when it cannot', () => {
    const table = buildTopicTable(folder(), state(), null, platform({
      builders: [builder(700, { campaigns: [{ id: 1000, name: 'x', term_group_id: null, ad_account: '53560', ad_account_name: 'GB / Salyut_Partners / Account 16' }] })],
    }));
    expect(table.sources.map(s => s.accounts.map(a => [a.alias, a.adAccount, a.adAccountName]))).toEqual([
      [['main-tk', '53560', 'GB / Salyut_Partners / Account 16']],
      [['fb-1', '9001', null]],
    ]);
  });
  it('names a cabinet by the platform\'s list of cabinets first, and learns one `sa adopt` left as a placeholder from its launched campaign', () => {
    const adopted = TOPIC.replace('ad_account: "53560"', 'ad_account: "REPLACE_AD_ACCOUNT_ID"');
    const table = buildTopicTable(folder({ topicYaml: adopted }), state({ 'de-de-main-tk': built(700, 1000) }), null, platform({
      builders: [builder(700, { campaigns: [{ id: 1000, name: 'x', term_group_id: null, ad_account: '53560', ad_account_name: 'from the campaign' }] })],
      adAccounts: { tiktok: [{ id: 53560, name: 'GB / Salyut_Partners / Account 16', account_id: '7680550759062339602' }] },
    }));
    expect(table.sources[0]!.accounts.map(a => [a.alias, a.adAccount, a.adAccountName])).toEqual([['main-tk', '53560', 'GB / Salyut_Partners / Account 16']]);
  });

  it('never shows the placeholder as a cabinet, when nothing launched says which it is', () => {
    const adopted = TOPIC.replace('ad_account: "53560"', 'ad_account: "REPLACE_AD_ACCOUNT_ID"');
    const table = buildTopicTable(folder({ topicYaml: adopted }), state(), null, null);
    expect(table.sources[0]!.accounts[0]).toMatchObject({ alias: 'main-tk', adAccount: null, adAccountName: null });
  });

  it('leaves out a cabinet the platform no longer lists, with its campaigns, from the rows and the totals', () => {
    const table = buildTopicTable(folder(), state({ 'de-de-main-tk': built(700, 1000) }), null, platform({
      builders: [builder(700, { campaigns: [{ id: 1000, name: 'x', term_group_id: null }] })],
      campaigns: [campaign(1000, 'ACTIVE')],
      adAccounts: { tiktok: [{ id: 53561, name: 'Account 17', account_id: '1' }], facebook: [{ id: 9001, name: 'FB', account_id: '2' }] },
    }));
    expect(table.sources.map(s => [s.source, s.accounts.map(a => a.alias)])).toEqual([['facebook', ['fb-1']]]);
    expect(table.totals).toEqual({ campaigns: 1, built: 0, active: 0, rejected: 0, withoutCreatives: 0 });
    expect(topicClipboard(table, '/r/ai-jobs-de')).not.toMatch(/main-tk/);
  });

  it('hides nothing for a source whose cabinets were not read', () => {
    const table = buildTopicTable(folder(), state(), null, platform({ adAccounts: { tiktok: [{ id: 53560, name: 'Account 16', account_id: '1' }] } }));
    expect(table.sources.map(s => s.source)).toEqual(['tiktok', 'facebook']);
  });
});

describe('what «Копіювати» puts on the clipboard', () => {
  const read = () => buildTopicTable(
    folder(),
    { ...state({ 'de-de-main-tk': built(700, 1000) }), topic_id: 103902 },
    null,
    platform({
      builders: [builder(700, { campaigns: [{ id: 1000, name: '34-AIjobsDE-1000', term_group_id: null, ad_account: '53560', ad_account_name: 'Account 16' }] })],
      campaigns: [campaign(1000, 'ACTIVE')],
    }),
  );

  it('is a campaign with its topic, the folder by full path, the creatives and the platform ids — enough for Claude to find it', () => {
    expect(campaignClipboard(read(), 'de-de-main-tk', '/Users/b/sa/launches/ai-jobs-de')).toBe([
      'Топік: AI jobs DE — ai-jobs-de (topic 103902)',
      'Кампанія: de-de-main-tk — de-DE · кабінет «Account 16» (53560) · термгрупа tg-wh · стаття a-wh',
      'Тека: /Users/b/sa/launches/ai-jobs-de/campaigns/de-de-main-tk',
      'Креативи: 2 mp4 у creatives/, 1 у creatives/rejected/',
      'Платформа: активна · builder 700 · кампанія 1000 «34-AIjobsDE-1000» · бюджет 20 · бід 0.45',
    ].join('\n'));
  });

  it('is a topic with its folder and every campaign in a line, and says when the topic is not on the platform yet', () => {
    const text = topicClipboard(read(), '/Users/b/sa/launches/ai-jobs-de');
    expect(text.split('\n')).toEqual([
      'Топік: AI jobs DE — ai-jobs-de (topic 103902)',
      'Тека: /Users/b/sa/launches/ai-jobs-de',
      'Кампанії (3):',
      '- de-at-main-tk — de-AT · кабінет «Account 16» (53560) · 0 mp4 · не залита',
      '- de-de-main-tk — de-DE · кабінет «Account 16» (53560) · 2 mp4 · активна · builder 700 · кампанія 1000 «34-AIjobsDE-1000» · бюджет 20 · бід 0.45',
      '- de-de-fb-1 — de-DE · кабінет 9001 · 1 mp4 · не залита',
    ]);
    const fresh = buildTopicTable(folder(), state(), null, null);
    expect(topicClipboard(fresh, '/r/ai-jobs-de').split('\n')[0]).toBe('Топік: AI jobs DE — ai-jobs-de (на платформі ще немає)');
  });
});

describe('the launch column', () => {
  const disk = { creatives: 2, rejected: 0, script: true, problem: null, changed: false };
  it('is a draft without creatives, whatever the plan says — and a launched campaign whose videos stayed on the platform says so', () => {
    expect(launchColumn({ ...disk, creatives: 0 }, undefined, outline('x', { steps: 3 })).kind).toBe('draft');
    expect(launchColumn({ ...disk, creatives: 0 }, built(1), undefined)).toMatchObject({ kind: 'draft', label: 'залита · креативів у теці немає' });
  });
  it('answers from the disk and the state alone while the plan is not counted: not launched, launched, files changed since', () => {
    expect(launchColumn(disk, undefined, undefined)).toMatchObject({ kind: 'unbuilt', label: 'не залита' });
    expect(launchColumn(disk, built(1), undefined)).toMatchObject({ kind: 'built', label: 'залита' });
    expect(launchColumn({ ...disk, changed: true }, built(1), undefined)).toMatchObject({ kind: 'changed', label: 'файли змінились після заливу' });
  });
  it('reads the plan once it is counted: errors first, then a relaunch, then steps', () => {
    expect(launchColumn(disk, built(1), outline('x', { errors: 2, steps: 1, relaunch: true }))).toMatchObject({ kind: 'errors', errors: 2 });
    expect(launchColumn(disk, built(1), outline('x', { steps: 2, relaunch: true }))).toMatchObject({ kind: 'relaunch', steps: 2 });
    expect(launchColumn(disk, undefined, outline('x', { steps: 4 }))).toMatchObject({ kind: 'unbuilt', label: 'не залита · 4 кроків', steps: 4 });
    expect(launchColumn(disk, undefined, outline('x'))).toMatchObject({ kind: 'unbuilt', label: 'не залита · план порожній' });
    expect(launchColumn(disk, built(1), outline('x'))).toMatchObject({ kind: 'built', label: 'залита' });
  });
  it('is errors when the manifest does not read', () => {
    expect(launchColumn({ ...disk, problem: 'x' }, undefined, undefined).kind).toBe('errors');
  });
});

describe('the platform column', () => {
  it('is «не залита» without a builder in the state, and unknown until the platform was asked', () => {
    expect(platformColumn(undefined, platform()).kind).toBe('none');
    expect(platformColumn(emptyCampaignState(), platform()).kind).toBe('none');
    expect(platformColumn(built(700), null)).toMatchObject({ kind: 'unknown', builderId: 700 });
    expect(platformColumn(built(700), emptyPlatformStatus('немає токена'))).toMatchObject({ kind: 'unknown' });
  });

  it('matches the builder by id, never by name, and says when the list does not show it', () => {
    expect(platformColumn(built(700), platform({ builders: [builder(701)] }))).toMatchObject({ kind: 'unknown', label: 'у списку платформи цієї кампанії не видно', builderId: 700 });
  });

  it('is a rejection with the reason in a line, and a link into the admin', () => {
    const column = platformColumn(built(700), platform({
      builders: [builder(700, { status: 'NOT_APPROVED', rejection: { reasons: ['Policy Violation'], details: 'Video script promises specific pay.\nMore.' } })],
    }));
    expect(column).toMatchObject({ kind: 'rejected', label: 'реджект', reason: 'Policy Violation — Video script promises specific pay.', url: BUILDER_ADMIN_URL, builderId: 700 });
  });

  it('is on review for a builder the platform has not approved yet', () => {
    expect(platformColumn(built(700), platform({ builders: [builder(700, { status: 'PENDING' })] }))).toMatchObject({ kind: 'review', label: 'на модерації (PENDING)' });
  });

  it('follows the campaign the builder made: approved without one, pending until the list shows it, then its status', () => {
    const made = (status: string | null) => platform({
      builders: [builder(700, { campaigns: [{ id: 1000, name: '34-x', term_group_id: null }] })],
      campaigns: status === null ? [] : [campaign(1000, status)],
    });
    expect(platformColumn(built(700), platform({ builders: [builder(700)] }))).toMatchObject({ kind: 'approved', campaignId: null });
    expect(platformColumn(built(700), made(null))).toMatchObject({ kind: 'pending', campaignId: 1000, campaignName: '34-x' });
    expect(platformColumn(built(700), made('ACTIVE'))).toMatchObject({ kind: 'active', label: 'активна', budget: 20, bid: 0.45 });
    expect(platformColumn(built(700), made('PAUSED'))).toMatchObject({ kind: 'paused' });
    expect(platformColumn(built(700), made('DELETED'))).toMatchObject({ kind: 'deleted', label: 'знята' });
    expect(platformColumn(built(700), made('PENDING'))).toMatchObject({ kind: 'pending', label: 'не жива (PENDING)' });
  });

  it('takes the campaign id from the state when the builder list has not caught up', () => {
    const column = platformColumn(built(700, 1000), platform({ builders: [builder(700)], campaigns: [campaign(1000, 'ACTIVE')] }));
    expect(column).toMatchObject({ kind: 'active', campaignId: 1000 });
  });
});
