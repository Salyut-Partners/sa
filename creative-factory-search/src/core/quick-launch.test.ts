import { describe, expect, it } from 'vitest';
import type { PlatformBuilder, PlatformCampaign, PlatformTsp, TspFields } from './platform-model.ts';
import {
  launchSteps, linksWanted, pixelNiche, placeSources, plainFailure, setsAndDefaults, TEAM_DEFAULTS, teamDefaults, topicFolder, uploadName,
  type LaunchFile, type LaunchForm, type TopicSnapshot,
} from './quick-launch.ts';

const builder = (id: number, over: Partial<PlatformBuilder> = {}): PlatformBuilder => ({
  id, topic_id: 107567, post_id: 501, pixel_id: 35967, status: 'APPROVED', traffic_source: 'tiktok', creative_ids: [], rejection: null, review: [],
  campaigns: [{ id: id * 10, name: `c-${id}`, term_group_id: 11, ad_account: '53560' }], country: 'Germany', ...over,
});

const campaign = (id: number, over: Partial<PlatformCampaign> = {}): PlatformCampaign => ({
  id, name: `c-${id / 10}`, status: 'ACTIVE', published: true, revenue: 0, spend: null, budget: null, bid: null, ...over,
});

const fields = (over: Partial<TspFields> = {}): TspFields => ({
  budget: 30, bid: 0.6, location: ['Germany'], language: 'All', gender: 'All', age: ['All'], devices: ['All'], os: [],
  launch_tomorrow: false, end_date: null, scheduled: false, ...over,
});

const tsp = (id: number, over: Partial<TspFields> = {}): PlatformTsp => ({ id, name: `tsp-${id}`, topic_id: 107567, fields: fields(over) });

const snapshot = (over: Partial<TopicSnapshot> = {}): TopicSnapshot => ({
  topic: { id: 107567, name: 'AIjobsDEwh', internal_name: 'AIjobsDEwh', user_id: 1099 },
  termGroups: [{ id: 11, name: 'tg-wh' }, { id: 12, name: 'tg-forklift' }],
  posts: [{ id: 501, title: 'Warehouse Jobs', site_id: 182 }, { id: 502, title: 'Forklift Jobs', site_id: 182 }],
  builders: [],
  links: {},
  tsps: [],
  campaigns: [],
  creatives: [],
  countries: [{ name: 'Germany', code: 'DE' }, { name: 'Austria', code: 'AT' }, { name: 'United Kingdom', code: 'GB' }],
  pixels: [
    { id: 34040, name: 'Джобс', ad_account_id: '1' }, { id: 35967, name: 'Джобс', ad_account_id: '1' }, { id: 35968, name: 'Лонс', ad_account_id: '2' },
  ],
  buyerPixels: [],
  adAccounts: [{ id: 53560, name: 'Account-7', account_id: '7' }],
  themes: [{ id: 768, key: 'dark', title: 'Dark' }, { id: 790, key: 'light', title: 'Light' }],
  rsocCounts: [3, 4, 5, 6],
  languages: ['English', 'German'],
  ...over,
});

describe('setsAndDefaults', () => {
  it('folds campaigns of one term group and article into one set, whatever the name, cabinet or country', () => {
    const s = snapshot({
      builders: [
        builder(1, { country: 'Germany' }),
        builder(2, { country: 'Austria', campaigns: [{ id: 20, name: 'other-name', term_group_id: 11, ad_account: '99999' }] }),
        builder(3, { post_id: 502, campaigns: [{ id: 30, name: 'x', term_group_id: 12, ad_account: '53560' }] }),
      ],
    });
    const { sets } = setsAndDefaults(s, TEAM_DEFAULTS);
    expect(sets.map(x => [x.termGroup.name, x.article.title, x.campaigns])).toEqual([
      ['tg-forklift', 'Forklift Jobs', 1],
      ['tg-wh', 'Warehouse Jobs', 2],
    ]);
  });

  it('orders sets by their latest campaign, newest first', () => {
    const s = snapshot({
      builders: [
        builder(5, { post_id: 502, campaigns: [{ id: 50, name: 'x', term_group_id: 12, ad_account: null }] }),
        builder(9),
      ],
    });
    expect(setsAndDefaults(s, TEAM_DEFAULTS).sets.map(x => x.latest)).toEqual([9, 5]);
  });

  it('takes the latest campaign without the deleted, and counts a rejected one', () => {
    const s = snapshot({
      builders: [builder(1, { country: 'Germany' }), builder(2, { country: 'Austria', status: 'NOT_APPROVED' }), builder(3, { country: 'United Kingdom' })],
      campaigns: [campaign(30, { status: 'DELETED' })],
    });
    const [set] = setsAndDefaults(s, TEAM_DEFAULTS).sets;
    expect(set!.latest).toBe(2);
    expect(set!.defaults.country).toBe('AT');
    expect(set!.campaigns).toBe(2);
  });

  it('fills country, budget, bid and the start from the latest campaign\'s profile, and never the cabinet', () => {
    const s = snapshot({
      builders: [builder(1)],
      links: { 1: { tsp: 7, term_group: 11, ad_account: '53560' } },
      tsps: [tsp(7, { budget: 35, bid: 0.8, launch_tomorrow: false })],
    });
    const d = setsAndDefaults(s, TEAM_DEFAULTS).sets[0]!.defaults;
    expect(d).toMatchObject({ country: 'DE', budget: 35, bid: 0.8, launch_tomorrow: false, pixel: '35967', account: null });
  });

  it('reads the country off the profile when the builder targets All', () => {
    const s = snapshot({
      builders: [builder(1, { country: 'All' })],
      links: { 1: { tsp: 7, term_group: 11, ad_account: null } },
      tsps: [tsp(7, { location: ['Austria'] })],
    });
    expect(setsAndDefaults(s, TEAM_DEFAULTS).sets[0]!.defaults.country).toBe('AT');
  });

  it('falls back to the campaign list for budget and bid when the profile is not known, and to tomorrow for the start', () => {
    const s = snapshot({ builders: [builder(1)], campaigns: [campaign(10, { budget: 25, bid: 0.5 })] });
    expect(setsAndDefaults(s, TEAM_DEFAULTS).sets[0]!.defaults).toMatchObject({ budget: 25, bid: 0.5, launch_tomorrow: true });
  });

  it('gives a new set the topic\'s latest budget, bid and pixel, no country, and a start tomorrow', () => {
    const s = snapshot({
      builders: [builder(1, { pixel_id: 40000 })],
      links: { 1: { tsp: 7, term_group: 11, ad_account: null } },
      tsps: [tsp(7, { budget: 40, bid: 0.9, launch_tomorrow: false })],
    });
    expect(setsAndDefaults(s, TEAM_DEFAULTS).newSet).toMatchObject({ country: null, budget: 40, bid: 0.9, launch_tomorrow: true, pixel: '40000', account: null });
  });

  it('gives a topic without campaigns the team\'s values, and of its niche\'s pixels the one the buyer last used elsewhere', () => {
    const result = setsAndDefaults(snapshot({ buyerPixels: [35968, 35967, 34040] }), TEAM_DEFAULTS);
    expect(result.niche).toBe('jobs');
    expect(result.newSet).toMatchObject({ budget: 20, bid: 0.45, pixel: '35967', rsoc_count: 6, theme: 'dark', headline: 'Learn more', language: 'All', source: 'tiktok' });
  });

  it('leaves the pixel for the buyer when the niche cannot be read off the name, or the buyer never used its pixels', () => {
    const unnamed = setsAndDefaults(snapshot({ topic: { id: 1, name: 'AMivfSE', internal_name: 'AMivfSE', user_id: 1 }, buyerPixels: [35967] }), TEAM_DEFAULTS);
    expect(unnamed.niche).toBeNull();
    expect(unnamed.newSet.pixel).toBeNull();
    expect(setsAndDefaults(snapshot({ buyerPixels: [35968] }), TEAM_DEFAULTS).newSet.pixel).toBeNull();
  });

  it('takes the headline of the set\'s latest campaign, then the topic\'s, then the team\'s', () => {
    const s = snapshot({
      builders: [builder(1, { creative_ids: [901] }), builder(2, { post_id: 502, creative_ids: [], campaigns: [{ id: 20, name: 'x', term_group_id: 12, ad_account: null }] })],
      creatives: [{ id: 901, media_type: 'Headline', original_filename: null, headline: '<p><strong>Mehr erfahren</strong></p>', status: 'New', ad_script: null }],
    });
    const result = setsAndDefaults(s, TEAM_DEFAULTS);
    // Set 2's campaign has no headline the topic holds: it falls to the topic's latest one.
    expect(result.sets.map(x => [x.latest, x.defaults.headline])).toEqual([[2, 'Mehr erfahren'], [1, 'Mehr erfahren']]);
    expect(result.newSet.headline).toBe('Mehr erfahren');
    expect(setsAndDefaults(snapshot(), TEAM_DEFAULTS).newSet.headline).toBe('Learn more');
  });

  it('says what is missing when the topic has no term group or no article', () => {
    expect(setsAndDefaults(snapshot({ termGroups: [] }), TEAM_DEFAULTS).missing).toMatch(/термгрупи/);
    expect(setsAndDefaults(snapshot({ posts: [] }), TEAM_DEFAULTS).missing).toMatch(/статті/);
    expect(setsAndDefaults(snapshot(), TEAM_DEFAULTS).missing).toBeNull();
  });

  it('places a builder without a campaign by the term group its own page names', () => {
    const s = snapshot({ builders: [builder(4, { campaigns: [], status: 'NOT_APPROVED' })], links: { 4: { tsp: null, term_group: 12, ad_account: null } } });
    expect(setsAndDefaults(s, TEAM_DEFAULTS).sets.map(x => x.termGroup.name)).toEqual(['tg-forklift']);
  });
});

describe('pixelNiche', () => {
  it('reads the niche off the pixel name as the team writes it, on either source', () => {
    expect(['Джобс', 'Лонс', 'Авто', 'Еком', 'ДЖОБС1', 'ЛОНС1'].map(pixelNiche)).toEqual(['jobs', 'credits', 'auto', 'ecommerce', 'jobs', 'credits']);
    expect(pixelNiche('Кредити')).toBeNull();
  });
});

describe('linksWanted', () => {
  it('asks first for builders without a campaign, then for the newest of each set', () => {
    const s = snapshot({ builders: [builder(1), builder(2), builder(3, { campaigns: [] })] });
    expect(linksWanted(s)).toEqual([3]);
    const next = { ...s, links: { 3: { tsp: null, term_group: 12, ad_account: null } } };
    expect(linksWanted(next)).toEqual([2]);
    expect(linksWanted({ ...next, links: { ...next.links, 2: { tsp: 7, term_group: 11, ad_account: null } } })).toEqual([]);
  });
});

describe('teamDefaults', () => {
  it('overrides field by field and ignores what has the wrong type', () => {
    expect(teamDefaults({ budget: 50, bid: 'x', rsoc_count: 5 })).toMatchObject({ budget: 50, bid: 0.45, rsoc_count: 5 });
    expect(teamDefaults(null)).toBe(TEAM_DEFAULTS);
  });
});

// -------------------------------------------------------------- steps --

const form = (over: Partial<LaunchForm> = {}): LaunchForm => ({
  termGroupId: 11, postId: 501, account: '53560', country: 'DE', budget: 20, bid: 0.45, launch_tomorrow: true, pixel: '35967',
  source: 'tiktok', rsoc_count: 6, theme: 'dark', headline: 'Learn more', keyword_rotation: false, language: 'All',
  gender: 'All', age: ['All'], devices: ['All'], os: ['All'], end_date: null, ...over,
});

const file = (name: string, hash = 'abcdef0123456789', script = 'Find warehouse jobs'): LaunchFile => ({ name, hash, script });

describe('uploadName', () => {
  it('tags the name with the first eight of the digest, once', () => {
    expect(uploadName(file('photo-1-en.mp4'))).toBe('photo-1-en-abcdef01.mp4');
    expect(uploadName(file('photo-1-en-abcdef01.mp4'))).toBe('photo-1-en-abcdef01.mp4');
  });
});

describe('launchSteps', () => {
  it('uploads, makes the headline and profile, and builds the campaign last from the form', () => {
    const plan = launchSteps(form(), snapshot(), [file('a-en.mp4', '11111111aaaa'), file('a-de.mp4', '22222222bbbb', 'Lagerjobs')]);
    if (!plan.ok) throw new Error(plan.errors.join('; '));
    expect(plan.steps.map(s => s.kind)).toEqual(['creative.upload', 'creative.upload', 'headline.create', 'tsp.create', 'builder.create']);
    const upload = plan.steps[1]!;
    expect(upload.kind === 'creative.upload' && [upload.upload, upload.body.ad_script, upload.body.countries]).toEqual(['a-de-22222222.mp4', 'Lagerjobs', ['Germany']]);
    const tspStep = plan.steps[3]!;
    expect(tspStep.kind === 'tsp.create' && tspStep.body).toMatchObject({ budget: 20, bid: '0.45', lunch_tomorrow: 1, location: ['Germany'], language: 'All', traffic_source: 'tiktok' });
    const build = plan.steps[4]!;
    expect(build.kind === 'builder.create' && build.body).toMatchObject({
      topic_id: 107567, country: 'Germany', site_id: '182', post_id: 501, rsoc_count: '6', pixel_id: '35967', ad_account_ids: ['53560'],
      term_group_ids: [11], themes: ['768'], traffic_source: 'tiktok', use_keyword_rotation: '0',
      creative_repo_ids: [{ headline: 'Learn more' }, { file: 'a-en-11111111.mp4' }, { file: 'a-de-22222222.mp4' }],
      traffic_source_profile_ids: ['new'],
    });
  });

  it('sends the start as the buyer ticked it', () => {
    const plan = launchSteps(form({ launch_tomorrow: false }), snapshot(), [file('a.mp4')]);
    const step = plan.ok ? plan.steps.find(s => s.kind === 'tsp.create') : undefined;
    expect(step?.kind === 'tsp.create' && step.body.lunch_tomorrow).toBe(0);
  });

  it('reuses a creative the topic holds under the upload name, the headline with those words and the profile with those fields', () => {
    const s = snapshot({
      creatives: [
        { id: 900, media_type: 'Video', original_filename: 'a-abcdef01.mp4', headline: null, status: 'New', ad_script: 'x' },
        { id: 901, media_type: 'Headline', original_filename: null, headline: '<p><strong>Learn more</strong></p>', status: 'New', ad_script: null },
      ],
      tsps: [tsp(7, { budget: 20, bid: 0.45, launch_tomorrow: true, location: ['Germany'], os: [] })],
    });
    const plan = launchSteps(form(), s, [file('a.mp4')]);
    if (!plan.ok) throw new Error(plan.errors.join('; '));
    expect(plan.steps.map(x => x.kind)).toEqual(['builder.create']);
    expect(plan.reused).toEqual({ creatives: [{ file: 'a.mp4', id: 900 }], headline: 901, tsp: 7 });
    expect(plan.found).toEqual([
      'a.mp4 — уже в топіку (900), не вантажу',
      'headline «Learn more» — знайдено в топіку (901)',
      'TSP знайдено (7): Germany, бюджет 20, бід 0.45, старт завтра',
    ]);
    const build = plan.steps[0]!;
    expect(build.kind === 'builder.create' && [build.body.creative_repo_ids, build.body.traffic_source_profile_ids]).toEqual([[901, 900], [7]]);
  });

  it('uploads a remade file under the same name again', () => {
    const s = snapshot({ creatives: [{ id: 900, media_type: 'Video', original_filename: 'a-abcdef01.mp4', headline: null, status: 'New', ad_script: 'x' }] });
    const plan = launchSteps(form(), s, [file('a.mp4', '99999999ffff')]);
    expect(plan.ok && plan.steps[0]).toMatchObject({ kind: 'creative.upload', upload: 'a-99999999.mp4' });
  });

  it('uploads the same file given twice once, whatever it is called the second time', () => {
    const plan = launchSteps(form(), snapshot(), [file('a.mp4'), file('a.mp4'), file('designer copy.mp4')]);
    if (!plan.ok) throw new Error(plan.errors.join('; '));
    expect(plan.steps.filter(s => s.kind === 'creative.upload').map(s => s.kind === 'creative.upload' && s.upload)).toEqual(['a-abcdef01.mp4']);
    const build = plan.steps.at(-1)!;
    expect(build.kind === 'builder.create' && build.body.creative_repo_ids).toHaveLength(2);
  });

  it('launches a designer\'s file from disk beside the renders, in another language, under a name the platform takes', () => {
    const plan = launchSteps(form(), snapshot(), [file('a-de.mp4', '11111111aaaa', 'Lagerjobs'), file('Відео фінал (2).mp4', '33333333cccc', '')]);
    if (!plan.ok) throw new Error(plan.errors.join('; '));
    const uploads = plan.steps.filter(s => s.kind === 'creative.upload');
    expect(uploads.map(s => s.kind === 'creative.upload' && [s.upload, s.body.ad_script])).toEqual([
      ['a-de-11111111.mp4', 'Lagerjobs'], ['Відео_фінал_2-33333333.mp4', ''],
    ]);
  });

  it('refuses without a cabinet, with a cabinet the platform no longer lists, and says every reason at once', () => {
    const none = launchSteps(form({ account: null, pixel: null, country: null }), snapshot(), [file('a.mp4')]);
    expect(none.ok).toBe(false);
    expect(!none.ok && none.errors).toEqual(expect.arrayContaining(['не вибрано кабінет', 'не вибрано піксель', 'не вибрано країну']));
    const dead = launchSteps(form({ account: '11111' }), snapshot(), [file('a.mp4')]);
    expect(!dead.ok && dead.errors.join()).toMatch(/кабінету 11111/);
  });

  it('refuses an RSOC count the platform does not take, an unknown theme, and no files', () => {
    const plan = launchSteps(form({ rsoc_count: 9, theme: 'neon' }), snapshot(), []);
    const errors = plan.ok ? '' : plan.errors.join('\n');
    expect(errors).toMatch(/RSOC 9/);
    expect(errors).toMatch(/теми «neon»/);
    expect(errors).toMatch(/жодного креативу/);
  });

  it('refuses a set the topic does not have', () => {
    const plan = launchSteps(form({ termGroupId: 99, postId: 98 }), snapshot(), [file('a.mp4')]);
    expect(!plan.ok && plan.errors).toEqual(expect.arrayContaining(['термгрупи 99 у топіку немає', 'статті 98 у топіку немає']));
  });
});

describe('placeSources', () => {
  it('writes each picture once, flat, suffixing a different picture under a taken name', () => {
    const held = [{ name: 'airport.jpg', hash: 'a1' }, { name: 'office.png', hash: 'o1' }];
    const incoming = [
      { name: 'airport.jpg', hash: 'a1' }, // already there
      { name: 'renamed.jpg', hash: 'o1' }, // already there under another name
      { name: 'airport.jpg', hash: 'a2' }, // another picture, same name
      { name: 'Airport.jpg', hash: 'a3' }, // and another, differing only in case
      { name: 'dock.jpg', hash: 'd1' },
      { name: 'dock-copy.jpg', hash: 'd1' }, // the same picture twice in one project
    ];
    expect(placeSources(held, incoming)).toEqual([
      { name: 'airport-2.jpg', hash: 'a2' }, { name: 'Airport-3.jpg', hash: 'a3' }, { name: 'dock.jpg', hash: 'd1' },
    ]);
  });
});

describe('topicFolder', () => {
  it('keeps the topic\'s name, minus what a file system reads as a path', () => {
    expect(topicFolder('AIjobsDEwh')).toBe('AIjobsDEwh');
    expect(topicFolder('Jobs/DE: warehouse')).toBe('Jobs_DE_ warehouse');
    expect(topicFolder('..')).toBe('topic');
  });
});

describe('plainFailure', () => {
  it('says what to do, and before the campaign that nothing was bought', () => {
    expect(plainFailure('creative.upload', 'платформа відповіла 401 — запит треба виправити, а не повторювати (Unauthorized)')).toMatch(/токен.*нічого не оплачено/s);
    expect(plainFailure('tsp.create', 'платформа відповіла 422 — запит треба виправити, а не повторювати ({"budget":"too low"})')).toMatch(/\(422\).*budget.*too low/s);
    expect(plainFailure('builder.create', 'платформа відповіла 502 — запит треба виправити, а не повторювати')).not.toMatch(/нічого не оплачено/);
    expect(plainFailure('headline.create', 'після 3 спроб платформа не відповідає — зупиняюсь')).toMatch(/інтернет/);
  });
});
