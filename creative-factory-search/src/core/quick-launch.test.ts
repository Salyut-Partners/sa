import { describe, expect, it } from 'vitest';
import type { FacebookSettings, PlatformBuilder, PlatformCampaign, PlatformCreative, PlatformTsp, TspFields } from './platform-model.ts';
import {
  campaignWarnings, FB_TEAM_DEFAULTS, forCabinet, launchSteps, nextCampaign, linksWanted, pixelNiche, placeSources, plainFailure, ratioWarning, setsAndDefaults,
  TEAM_DEFAULTS, teamDefaults, topicFolder, uploadName, remadeUploadName, isUploadOf,
  type LaunchCampaign, type LaunchFile, type LaunchForm, type LaunchStep, type TopicSnapshot,
} from './quick-launch.ts';

const builder = (id: number, over: Partial<PlatformBuilder> = {}): PlatformBuilder => ({
  id, topic_id: 107567, post_id: 501, pixel_id: 35967, status: 'APPROVED', traffic_source: 'tiktok', creative_ids: [], rejection: null, review: [],
  campaigns: [{ id: id * 10, name: `c-${id}`, term_group_id: 11, ad_account: '53560' }], country: 'Germany', ...over,
});

const campaign = (id: number, over: Partial<PlatformCampaign> = {}): PlatformCampaign => ({
  id, name: `c-${id / 10}`, status: 'ACTIVE', published: true, revenue: 0, spend: null, budget: null, bid: null, ...over,
});

const fields = (over: Partial<TspFields> = {}): TspFields => ({
  source: 'tiktok', facebook: null, budget: 30, bid: 0.6, location: ['Germany'], language: 'All', gender: 'All', age: ['All'], devices: ['All'], os: [],
  launch_tomorrow: false, end_date: null, scheduled: false, ...over,
});

const tsp = (id: number, over: Partial<TspFields> = {}): PlatformTsp => ({ id, name: `tsp-${id}`, topic_id: 107567, fields: fields(over) });

const snapshot = (over: Partial<TopicSnapshot> = {}): TopicSnapshot => ({
  source: 'tiktok',
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
    { id: 34040, name: 'Джобс', ad_pixel_id: '', ad_account_id: '1', business_id: 'P' }, { id: 35967, name: 'Джобс', ad_pixel_id: '', ad_account_id: '1', business_id: 'GB' },
    { id: 35968, name: 'Лонс', ad_pixel_id: '', ad_account_id: '2', business_id: 'GB' },
  ],
  buyerPixels: [],
  buyerPages: [],
  adAccounts: [{ id: 53560, name: 'GB / Account-7', account_id: '7', business_id: 'GB' }, { id: 38341, name: 'P / Account-08', account_id: '8', business_id: 'P' }],
  pages: [{ id: 27134, name: '1acc35', business_id: 'P' }, { id: 30040, name: 'Good Life', business_id: 'GB' }, { id: 30041, name: 'Like me', business_id: 'GB' }],
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
    expect(set!.defaults.countries).toEqual(['AT']);
    expect(set!.campaigns).toBe(2);
  });

  it('fills countries, budget, bid, the start and the identity from the latest campaign\'s profile, and never the cabinet', () => {
    const s = snapshot({
      builders: [builder(1, { page_id: 30040 })],
      links: { 1: { tsp: 7, term_group: 11, ad_account: '53560' } },
      tsps: [tsp(7, { budget: 35, bid: 0.8, launch_tomorrow: true })],
    });
    const d = setsAndDefaults(s, TEAM_DEFAULTS).sets[0]!.defaults;
    expect(d).toMatchObject({ countries: ['DE'], budget: 35, bid: 0.8, launch_tomorrow: true, pixel: '35967', page: '30040' });
  });

  it('reads the country off the profile when the builder targets All', () => {
    const s = snapshot({
      builders: [builder(1, { country: 'All' })],
      links: { 1: { tsp: 7, term_group: 11, ad_account: null } },
      tsps: [tsp(7, { location: ['Austria'] })],
    });
    expect(setsAndDefaults(s, TEAM_DEFAULTS).sets[0]!.defaults.countries).toEqual(['AT']);
  });

  it('reads every country of a multi-geo profile', () => {
    const s = snapshot({
      builders: [builder(1, { country: 'All' })],
      links: { 1: { tsp: 7, term_group: 11, ad_account: null } },
      tsps: [tsp(7, { location: ['Austria', 'United Kingdom'] })],
    });
    expect(setsAndDefaults(s, TEAM_DEFAULTS).sets[0]!.defaults.countries).toEqual(['AT', 'GB']);
  });

  it('falls back to the campaign list for budget and bid when the profile is not known, and to the team\'s start — today', () => {
    const s = snapshot({ builders: [builder(1)], campaigns: [campaign(10, { budget: 25, bid: 0.5 })] });
    expect(setsAndDefaults(s, TEAM_DEFAULTS).sets[0]!.defaults).toMatchObject({ budget: 25, bid: 0.5, launch_tomorrow: false });
  });

  it('gives a new set the topic\'s latest budget, bid and pixel, no country, and the team\'s start', () => {
    const s = snapshot({
      builders: [builder(1, { pixel_id: 40000 })],
      links: { 1: { tsp: 7, term_group: 11, ad_account: null } },
      tsps: [tsp(7, { budget: 40, bid: 0.9, launch_tomorrow: false })],
    });
    expect(setsAndDefaults(s, TEAM_DEFAULTS).newSet).toMatchObject({ countries: [], budget: 40, bid: 0.9, launch_tomorrow: false, pixel: '40000', page: null });
  });

  it('gives a topic without campaigns the team\'s values, and of its niche\'s pixels the one the buyer last used elsewhere', () => {
    const result = setsAndDefaults(snapshot({ buyerPixels: [35968, 35967, 34040] }), TEAM_DEFAULTS);
    expect(result.niche).toBe('jobs');
    expect(result.newSet).toMatchObject({ budget: 25, bid: 0.3, launch_tomorrow: false, pixel: '35967', rsoc_count: 6, theme: 'dark', headline: 'Learn more', language: 'All', source: 'tiktok' });
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
    expect(['AUTO', 'LONS', 'loans', 'credit', 'JOBS', 'Job', 'ECOM', 'АВТО1', 'AUTO 2'].map(pixelNiche))
      .toEqual(['auto', 'credits', 'credits', 'credits', 'jobs', 'jobs', 'ecommerce', 'auto', 'auto']);
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
  it('reads a block per source, the flat config as TikTok\'s, and the top-level source as the one to open with', () => {
    expect(teamDefaults({ budget: 50 }).budget).toBe(50);
    expect(teamDefaults({ budget: 50 }, 'facebook')).toEqual(FB_TEAM_DEFAULTS);
    const config = { source: 'facebook', budget: 50, tiktok: { budget: 40 }, facebook: { budget: 30, bid_strategy: 'LOWEST_COST_WITHOUT_CAP', launch_time: '00:00', age_from: 25 } };
    expect(teamDefaults(config)).toMatchObject({ source: 'facebook', budget: 30, facebook: { bid_strategy: 'LOWEST_COST_WITHOUT_CAP', launch_time: '00:00', age_from: 25, age_to: 65 } });
    expect(teamDefaults(config, 'tiktok')).toMatchObject({ source: 'tiktok', budget: 40 });
    expect(teamDefaults({ facebook: { launch_time: '25:99', placements: 'nowhere' } }, 'facebook').facebook).toEqual(FB_TEAM_DEFAULTS.facebook);
  });

  it('gives Facebook the team\'s numbers: 20, 0.3, step 0.05, Bid Cap, Number of Conversions, Advantage+, 18–65+, start now, no team page', () => {
    expect(FB_TEAM_DEFAULTS).toMatchObject({
      source: 'facebook', budget: 20, bid: 0.3, bid_step: 0.05, identity: '',
      facebook: { bid_strategy: 'LOWEST_COST_WITH_BID_CAP', performance_goal: 'MAXIMIZE_NUMBER_OF_CONVERSIONS', placements: 'advantage', age_from: 18, age_to: 65, launch_time: null },
    });
  });

  it('overrides field by field and ignores what has the wrong type', () => {
    expect(teamDefaults({ budget: 50, bid: 'x', rsoc_count: 5, launch_tomorrow: true, identity: '' })).toMatchObject({
      budget: 50, bid: 0.3, rsoc_count: 5, launch_tomorrow: true, identity: '',
    });
    expect(teamDefaults(null)).toBe(TEAM_DEFAULTS);
    expect(TEAM_DEFAULTS.bid_step).toBe(0.05);
    expect(teamDefaults({ bid_step: 0.01 }).bid_step).toBe(0.01);
  });
});

// -------------------------------------------------------------- steps --

const row = (over: Partial<LaunchCampaign> = {}): LaunchCampaign => ({ account: '53560', budget: 20, bid: 0.45, pixel: '35967', page: null, ...over });

const form = (over: Partial<LaunchForm> = {}): LaunchForm => ({
  termGroupId: 11, postId: 501, campaigns: [row()], countries: ['DE'], launch_tomorrow: true,
  source: 'tiktok', rsoc_count: 6, theme: 'dark', headline: 'Learn more', primary_text: '', facebook: FB_TEAM_DEFAULTS.facebook,
  keyword_rotation: false, language: 'All',
  gender: 'All', age: ['All'], devices: ['All'], os: ['All'], end_date: null, ...over,
});

const file = (name: string, hash = 'abcdef0123456789', script = 'Find warehouse jobs'): LaunchFile => ({ name, hash, script });

describe('uploadName', () => {
  it('tags the name with the first eight of the digest, once', () => {
    expect(uploadName(file('photo-1-en.mp4'))).toBe('photo-1-en-abcdef01.mp4');
    expect(uploadName(file('photo-1-en-abcdef01.mp4'))).toBe('photo-1-en-abcdef01.mp4');
  });
});

describe('a file the platform dropped, sent again under a marked name', () => {
  it('keeps the first name and adds the mark before the extension', () => {
    expect(remadeUploadName('photo-1-en-abcdef01.mp4', '1a2b')).toBe('photo-1-en-abcdef01-u1a2b.mp4');
  });

  it('is known as the same upload, and nothing else is', () => {
    expect(isUploadOf('photo-1-en-abcdef01.mp4', 'photo-1-en-abcdef01.mp4')).toBe(true);
    expect(isUploadOf('photo-1-en-abcdef01-u1a2b.mp4', 'photo-1-en-abcdef01.mp4')).toBe(true);
    expect(isUploadOf('photo-1-en-abcdef01-uzzzz.mp4', 'photo-1-en-abcdef01.mp4')).toBe(false);
    expect(isUploadOf('photo-1-en-abcdef01-u1a2b.png', 'photo-1-en-abcdef01.mp4')).toBe(false);
    expect(isUploadOf('photo-1-en-abcdef02.mp4', 'photo-1-en-abcdef01.mp4')).toBe(false);
    expect(isUploadOf(null, 'photo-1-en-abcdef01.mp4')).toBe(false);
  });

  it('is reused by the next launch into the topic', () => {
    const held = snapshot();
    held.creatives = [...held.creatives, { ...held.creatives.find(c => c.media_type !== 'Headline')!, id: 9001, original_filename: 'a-en-11111111-u0f0f.mp4' }];
    const plan = launchSteps(form(), held, [file('a-en.mp4', '11111111aaaa')]);
    if (!plan.ok) throw new Error(plan.errors.join('; '));
    expect(plan.steps.some(s => s.kind === 'creative.upload')).toBe(false);
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
      traffic_source_profile_ids: [{ tsp: '20|0.45' }],
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
    expect(plan.reused).toEqual({ creatives: [{ file: 'a.mp4', id: 900 }], headline: 901, tsps: [7] });
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
    const none = launchSteps(form({ campaigns: [row({ account: null, pixel: null })], countries: [] }), snapshot(), [file('a.mp4')]);
    expect(none.ok).toBe(false);
    expect(!none.ok && none.errors).toEqual(expect.arrayContaining(['не вибрано кабінет', 'не вибрано піксель', 'не вибрано країну']));
    const dead = launchSteps(form({ campaigns: [row({ account: '11111' })] }), snapshot(), [file('a.mp4')]);
    expect(!dead.ok && dead.errors.join()).toMatch(/кабінету 11111/);
  });

  it('refuses an RSOC count the platform does not take, an unknown theme, and no files', () => {
    const plan = launchSteps(form({ rsoc_count: 9, theme: 'neon' }), snapshot(), []);
    const errors = plan.ok ? '' : plan.errors.join('\n');
    expect(errors).toMatch(/RSOC 9/);
    expect(errors).toMatch(/теми «neon»/);
    expect(errors).toMatch(/жодного креативу/);
  });

  it('launches several countries as one multi-geo profile, the builder targeting All', () => {
    const plan = launchSteps(form({ countries: ['DE', 'AT', 'DE'] }), snapshot(), [file('a.mp4')]);
    if (!plan.ok) throw new Error(plan.errors.join('; '));
    const [upload, , profile, build] = plan.steps;
    expect(upload!.kind === 'creative.upload' && upload!.body.countries).toEqual(['Germany', 'Austria']);
    expect(profile!.kind === 'tsp.create' && [profile!.body.location, profile!.label]).toEqual([['Germany', 'Austria'], 'створити TSP (Germany, Austria, бюджет 20, бід 0.45, старт завтра)']);
    expect(build!.kind === 'builder.create' && build!.body.country).toBe('All');
    const all = launchSteps(form({ countries: ['DE', 'All'] }), snapshot(), [file('a.mp4')]);
    const allProfile = all.ok ? all.steps.find(x => x.kind === 'tsp.create') : undefined;
    expect(allProfile?.kind === 'tsp.create' && allProfile.body.location).toEqual(['All']);
  });

  it('refuses a pixel or identity of another business than the cabinet\'s — the cabinet would not see it', () => {
    const pixel = launchSteps(form({ campaigns: [row({ account: '38341', pixel: '35968' })] }), snapshot(), [file('a.mp4')]);
    expect(!pixel.ok && pixel.errors.join()).toMatch(/піксель «Лонс» \(35968\) з іншого бізнесу, ніж кабінет «P \/ Account-08»/);
    const page = launchSteps(form({ campaigns: [row({ page: '27134' })] }), snapshot(), [file('a.mp4')]);
    expect(!page.ok && page.errors.join()).toMatch(/FP «1acc35» з іншого бізнесу/);
  });

  it('sends the identity, and none for the cabinet\'s default', () => {
    const build = (page: string | null) => {
      const plan = launchSteps(form({ campaigns: [row({ page })] }), snapshot(), [file('a.mp4')]);
      const step = plan.ok ? plan.steps.at(-1) : undefined;
      return step?.kind === 'builder.create' ? step.body.page_id : undefined;
    };
    expect(build('30040')).toBe('30040');
    expect(build(null)).toBeNull();
  });

  it('reuses a video the topic holds under another name with the same bytes, rather than send what the platform would drop', () => {
    const s = snapshot({
      creatives: [{ id: 950, media_type: 'Video', original_filename: 'hand upload.mp4', headline: null, status: 'New', ad_script: 'x' }],
      heldByDigest: { abcdef0123456789: 950 },
    });
    const plan = launchSteps(form(), s, [file('a.mp4')]);
    if (!plan.ok) throw new Error(plan.errors.join('; '));
    expect(plan.steps.some(x => x.kind === 'creative.upload')).toBe(false);
    expect(plan.reused.creatives).toEqual([{ file: 'a.mp4', id: 950 }]);
  });

  it('refuses a set the topic does not have', () => {
    const plan = launchSteps(form({ termGroupId: 99, postId: 98 }), snapshot(), [file('a.mp4')]);
    expect(!plan.ok && plan.errors).toEqual(expect.arrayContaining(['термгрупи 99 у топіку немає', 'статті 98 у топіку немає']));
  });

  it('builds a campaign per row, last, each with its cabinet, pixel, identity and profile — one profile per budget and bid', () => {
    const rows = [
      row({ bid: 0.3 }),
      row({ account: '38341', pixel: '34040', page: '27134', bid: 0.35 }),
      row({ budget: 30, bid: 0.4 }),
      row({ account: '38341', pixel: '34040', bid: 0.35 }),
    ];
    const plan = launchSteps(form({ campaigns: rows }), snapshot(), [file('a.mp4')]);
    if (!plan.ok) throw new Error(plan.errors.join('; '));
    expect(plan.steps.map(s => s.kind)).toEqual([
      'creative.upload', 'headline.create', 'tsp.create', 'tsp.create', 'tsp.create', 'builder.create', 'builder.create', 'builder.create', 'builder.create',
    ]);
    const profiles = plan.steps.flatMap(s => (s.kind === 'tsp.create' ? [[s.key, s.body.budget, s.body.bid]] : []));
    expect(profiles).toEqual([['20|0.3', 20, '0.3'], ['20|0.35', 20, '0.35'], ['30|0.4', 30, '0.4']]);
    const builds = plan.steps.flatMap(s => (s.kind === 'builder.create'
      ? [[s.campaign, s.body.ad_account_ids, s.body.pixel_id, s.body.page_id, s.body.traffic_source_profile_ids]] : []));
    expect(builds).toEqual([
      [0, ['53560'], '35967', null, [{ tsp: '20|0.3' }]],
      [1, ['38341'], '34040', '27134', [{ tsp: '20|0.35' }]],
      [2, ['53560'], '35967', null, [{ tsp: '30|0.4' }]],
      [3, ['38341'], '34040', null, [{ tsp: '20|0.35' }]],
    ]);
    const labels = plan.steps.filter(s => s.kind === 'builder.create').map(s => s.label);
    expect(new Set(labels).size).toBe(4);
    expect(labels[1]).toMatch(/^кампанія 2\/4: P \/ Account-08, бюджет 20, бід 0\.35/);
  });

  it('reuses a profile the topic holds for one row and makes one for another', () => {
    const plan = launchSteps(form({ campaigns: [row(), row({ bid: 0.5 })] }), snapshot({ tsps: [tsp(7, { budget: 20, bid: 0.45, launch_tomorrow: true, os: [] })] }), [file('a.mp4')]);
    if (!plan.ok) throw new Error(plan.errors.join('; '));
    expect(plan.steps.filter(s => s.kind === 'tsp.create').map(s => s.kind === 'tsp.create' && s.key)).toEqual(['20|0.5']);
    expect(plan.steps.flatMap(s => (s.kind === 'builder.create' ? [s.body.traffic_source_profile_ids] : []))).toEqual([[7], [{ tsp: '20|0.5' }]]);
    expect(plan.found).toContain('TSP знайдено (7): Germany, бюджет 20, бід 0.45, старт завтра');
  });

  it('refuses a row without a cabinet, a pixel or a bid, naming the row, and a launch with no row', () => {
    const plan = launchSteps(form({ campaigns: [row(), row({ account: null, pixel: null }), row({ account: '38341', pixel: '35968', bid: 0 })] }), snapshot(), [file('a.mp4')]);
    expect(!plan.ok && plan.errors).toEqual(expect.arrayContaining([
      'кампанія 2: не вибрано кабінет', 'кампанія 2: не вибрано піксель', 'кампанія 3: бід має бути більшим за нуль',
    ]));
    expect(!plan.ok && plan.errors.join()).toMatch(/кампанія 3: піксель «Лонс» \(35968\) з іншого бізнесу/);
    const none = launchSteps(form({ campaigns: [] }), snapshot(), [file('a.mp4')]);
    expect(!none.ok && none.errors).toContain('не додано жодної кампанії');
  });

  it('warns of one bid in two campaigns — one auction — and of more than fifteen at once, without refusing', () => {
    const same = launchSteps(form({ campaigns: [row({ bid: 0.3 }), row({ bid: 0.35 }), row({ account: '38341', pixel: '34040', bid: 0.3 })] }), snapshot(), [file('a.mp4')]);
    expect(same.ok && same.warnings.join()).toMatch(/бід 0\.3 у кампаніях 1, 3/);
    const many = launchSteps(form({ campaigns: Array.from({ length: 16 }, (_, i) => row({ bid: 0.3 + i / 100 })) }), snapshot(), [file('a.mp4')]);
    expect(many.ok && many.warnings.join()).toMatch(/16 кампаній/);
    expect(campaignWarnings([row({ bid: 0.3 }), row({ bid: 0.35 })])).toEqual([]);
  });
});

describe('nextCampaign', () => {
  it('starts from the set\'s budget and bid, then climbs the bid a step at a time from the last row, keeping its budget', () => {
    expect(nextCampaign([], { budget: 25, bid: 0.3 }, 0.05)).toEqual({ budget: 25, bid: 0.3 });
    expect(nextCampaign([row({ budget: 40, bid: 0.3 })], { budget: 25, bid: 0.3 }, 0.05)).toEqual({ budget: 40, bid: 0.35 });
    expect(nextCampaign([row({ bid: 0.1 }), row({ bid: 0.15 })], { budget: 25, bid: 0.3 }, 0.05)).toEqual({ budget: 20, bid: 0.2 });
  });
});

describe('forCabinet', () => {
  const lists = {
    accounts: [{ id: '53560', name: 'GB / 7', business: 'GB' }, { id: '38341', name: 'P / 08', business: 'P' }, { id: '1', name: '?', business: '' }],
    pixels: [{ id: '34086', name: 'Лонс', business: 'P' }, { id: '35968', name: 'Лонс', business: 'GB' }, { id: '35970', name: 'Еком', business: 'GB' }],
    pages: [{ id: '27134', name: '1acc35', business: 'P' }, { id: '30040', name: 'Good Life', business: 'GB' }, { id: '30041', name: 'Like me', business: 'GB' }],
  };

  it('takes the pixel of the same name in the cabinet\'s business, and nothing when it has none', () => {
    expect(forCabinet({ pixel: '35968', page: null }, '38341', lists, 'Good Life').pixel).toBe('34086');
    expect(forCabinet({ pixel: '35968', page: null }, '53560', lists, 'Good Life').pixel).toBe('35968');
    expect(forCabinet({ pixel: '35970', page: null }, '38341', lists, 'Good Life').pixel).toBeNull();
  });

  it('goes out under the team\'s identity where the business has it, the default where not, and keeps one the business owns', () => {
    expect(forCabinet({ pixel: null, page: null }, '53560', lists, 'Good Life').page).toBe('30040');
    expect(forCabinet({ pixel: null, page: '30040' }, '38341', lists, 'Good Life').page).toBeNull();
    expect(forCabinet({ pixel: null, page: '30041' }, '53560', lists, 'Good Life').page).toBe('30041');
    expect(forCabinet({ pixel: null, page: null }, '53560', lists, '').page).toBeNull();
  });

  it('leaves both alone for a cabinet whose business is not known', () => {
    expect(forCabinet({ pixel: '35968', page: '30040' }, '1', lists, 'Good Life')).toEqual({ pixel: '35968', page: '30040' });
  });
});

// ------------------------------------------------------------ Facebook --

const fbSettings = (over: Partial<FacebookSettings> = {}): FacebookSettings => ({ ...FB_TEAM_DEFAULTS.facebook, ...over });

const fbFields = (over: Partial<TspFields> = {}): TspFields => ({
  ...fields({ launch_tomorrow: false, os: [], budget: 20, bid: 0.3 }), source: 'facebook', facebook: fbSettings(), ...over,
});

/** A Facebook topic: two businesses, a pixel as a row per cabinet that holds it, pages with and without a business. */
const fbSnapshot = (over: Partial<TopicSnapshot> = {}): TopicSnapshot => snapshot({
  source: 'facebook',
  topic: { id: 107990, name: 'AIautoDEfb', internal_name: 'AIautoDEfb', user_id: 1099 },
  adAccounts: [
    { id: 70001, name: 'FB / Agency-1', account_id: 'act_1201', business_id: '9001' },
    { id: 70002, name: 'FB / Agency-2', account_id: '1202', business_id: '9001' },
    { id: 70003, name: 'FB / Other-1', account_id: '1301', business_id: '9002' },
    { id: 70004, name: 'FB / Agency-3', account_id: '1203', business_id: '9001' },
  ],
  pixels: [
    { id: 61001, name: 'АВТО1', ad_pixel_id: '880011', ad_account_id: '1201', business_id: '9001' },
    { id: 61002, name: 'АВТО1', ad_pixel_id: '880011', ad_account_id: 'act_1202', business_id: '9001' },
    { id: 61003, name: 'АВТО1', ad_pixel_id: '880099', ad_account_id: '1301', business_id: '9002' },
    { id: 61004, name: 'ЛОНС1', ad_pixel_id: '880022', ad_account_id: '1201', business_id: '9001' },
  ],
  pages: [{ id: 501, name: 'Good Life', business_id: '9001' }, { id: 502, name: 'Fresh Page', business_id: '' }, { id: 503, name: 'Other Page', business_id: '9002' }],
  ...over,
});

const fbRow = (over: Partial<LaunchCampaign> = {}): LaunchCampaign => ({ account: '70001', budget: 20, bid: 0.3, pixel: '61001', page: '501', ...over });

const fbForm = (over: Partial<LaunchForm> = {}): LaunchForm => form({
  source: 'facebook', campaigns: [fbRow()], launch_tomorrow: false, primary_text: 'Find work near you', facebook: fbSettings(), ...over,
});

const ok = (plan: ReturnType<typeof launchSteps>) => {
  if (!plan.ok) throw new Error(plan.errors.join('; '));
  return plan;
};
const kinds = <K extends LaunchStep['kind']>(steps: readonly LaunchStep[], kind: K) => steps.filter((s): s is Extract<LaunchStep, { kind: K }> => s.kind === kind);

const headlineEntry = (id: number, html: string, over: Partial<PlatformCreative> = {}): PlatformCreative =>
  ({ id, media_type: 'Headline', original_filename: null, headline: html, status: 'New', ad_script: null, ...over });

describe('launchSteps on Facebook', () => {
  it('sends the profile as the Facebook form does, bid capped, starting at once', () => {
    const plan = ok(launchSteps(fbForm(), fbSnapshot(), [file('a.mp4')]));
    const [profile] = kinds(plan.steps, 'tsp.create');
    expect(profile!.body).toMatchObject({
      traffic_source: 'facebook', bid: '0.3', budget: 20, bid_strategy: 'LOWEST_COST_WITH_BID_CAP', performance_goal: 'MAXIMIZE_NUMBER_OF_CONVERSIONS',
      placements: 'advantage', age_from: '18', age_to: '65', launch_time: null, pixel_attribution: '7-1-1', lunch_tomorrow: 0,
    });
    expect(profile!.label).toBe('створити TSP (Germany, бюджет 20, бід 0.3, старт одразу)');
    const [build] = kinds(plan.steps, 'builder.create');
    expect(build!.body).toMatchObject({ traffic_source: 'facebook', page_id: '501', pixel_id: '61001', ad_account_ids: ['70001'] });
  });

  it('starts tomorrow at the time, ages from–to, and Value of Conversions when asked', () => {
    const plan = ok(launchSteps(fbForm({ facebook: fbSettings({ launch_time: '00:00', age_from: 25, age_to: 54, performance_goal: 'MAXIMIZE_VALUE_OF_CONVERSIONS' }) }), fbSnapshot(), [file('a.mp4')]));
    const [profile] = kinds(plan.steps, 'tsp.create');
    expect(profile!.body).toMatchObject({ launch_type: 'tomorrow', launch_time: '00:00', age_from: '25', age_to: '54', performance_goal: 'MAXIMIZE_VALUE_OF_CONVERSIONS' });
    expect(profile!.label).toMatch(/старт завтра о 00:00/);
  });

  it('refuses a start time that is not a time, and ages Facebook does not offer', () => {
    const plan = launchSteps(fbForm({ facebook: fbSettings({ launch_time: '24:30', age_from: 40, age_to: 30 }) }), fbSnapshot(), [file('a.mp4')]);
    expect(!plan.ok && plan.errors.join('\n')).toMatch(/час старту «24:30»/);
    expect(!plan.ok && plan.errors.join('\n')).toMatch(/вік від 40 до 30/);
  });

  it('without a cap sends no bid, wants none, and makes one profile per budget', () => {
    const rows = [fbRow({ bid: 0.3 }), fbRow({ bid: 0.35, account: '70002', pixel: '61002' }), fbRow({ budget: 30, bid: 0 })];
    const plan = ok(launchSteps(fbForm({ campaigns: rows, facebook: fbSettings({ bid_strategy: 'LOWEST_COST_WITHOUT_CAP' }) }), fbSnapshot(), [file('a.mp4')]));
    const profiles = kinds(plan.steps, 'tsp.create');
    expect(profiles.map(p => [p.key, p.body.budget, 'bid' in p.body])).toEqual([['20', 20, false], ['30', 30, false]]);
    expect(profiles[0]!.label).toBe('створити TSP (Germany, бюджет 20, без капу, старт одразу)');
    expect(kinds(plan.steps, 'builder.create').map(b => b.body.traffic_source_profile_ids)).toEqual([[{ tsp: '20' }], [{ tsp: '20' }], [{ tsp: '30' }]]);
    expect(plan.warnings.join()).not.toMatch(/однаковий бід/);
  });

  it('wants an FP on every campaign', () => {
    const plan = launchSteps(fbForm({ campaigns: [fbRow({ page: null })] }), fbSnapshot(), [file('a.mp4')]);
    expect(!plan.ok && plan.errors).toContain('не вибрано FP — на Facebook оголошення без сторінки не існує');
  });

  it('refuses a page of another business naming both, and takes one the platform links to no business', () => {
    const other = launchSteps(fbForm({ campaigns: [fbRow({ page: '503' })] }), fbSnapshot(), [file('a.mp4')]);
    expect(!other.ok && other.errors.join()).toMatch(/FP «Other Page» з іншого бізнесу, ніж кабінет «FB \/ Agency-1»/);
    expect(launchSteps(fbForm({ campaigns: [fbRow({ page: '502' })] }), fbSnapshot(), [file('a.mp4')]).ok).toBe(true);
  });

  it('warns when the pixel\'s row is another cabinet\'s of the same business, and says nothing when it is the cabinet\'s own', () => {
    const neighbour = ok(launchSteps(fbForm({ campaigns: [fbRow({ account: '70004' })] }), fbSnapshot(), [file('a.mp4')]));
    expect(neighbour.warnings.join()).toMatch(/піксель «АВТО1» \(61001\) прив'язаний не до кабінету «FB \/ Agency-3»/);
    const own = ok(launchSteps(fbForm({ campaigns: [fbRow({ account: '70002', pixel: '61002' })] }), fbSnapshot(), [file('a.mp4')]));
    expect(own.warnings.join()).not.toMatch(/прив'язаний не до кабінету/);
  });

  it('makes the headline with its primary text as plain paragraphs, the description empty', () => {
    const plan = ok(launchSteps(fbForm(), fbSnapshot(), [file('a.mp4')]));
    const [headline] = kinds(plan.steps, 'headline.create');
    expect(headline!.body).toMatchObject({
      headlines: ['<p>Learn more</p>'], primary_texts: ['<p>Find work near you</p>'], descriptions: [''], source: 'facebook',
    });
    expect(headline!.label).toBe('створити headline «Learn more» · primary text «Find work near you»');
  });

  it('reuses a headline only of its own source and with the same title and primary text', () => {
    const files = [file('a.mp4')];
    const made = (creatives: PlatformCreative[]) => ok(launchSteps(fbForm(), fbSnapshot({ creatives }), files)).reused.headline;
    expect(made([headlineEntry(901, '<p><strong>Learn more</strong></p>', { traffic_sources: ['tiktok'] })])).toBeNull();
    expect(made([headlineEntry(902, '<p>Learn more</p>', { traffic_sources: ['facebook'], primary_text: '<p>Other text</p>' })])).toBeNull();
    expect(made([headlineEntry(903, '<p>Learn more</p>', { traffic_sources: ['facebook'], primary_text: '<p>Find work near you</p>' })])).toBe(903);
    // A list that says neither rules nothing out.
    expect(made([headlineEntry(904, '<p>Learn more</p>')])).toBe(904);
  });

  it('reuses a profile only of its own source', () => {
    const tiktokTwin = tsp(7, { budget: 20, bid: 0.3, launch_tomorrow: false, os: [] });
    const fbOwn: PlatformTsp = { id: 8, name: 'fb', topic_id: 107990, fields: fbFields() };
    expect(ok(launchSteps(fbForm(), fbSnapshot({ tsps: [tiktokTwin] }), [file('a.mp4')])).reused.tsps).toEqual([]);
    expect(ok(launchSteps(fbForm(), fbSnapshot({ tsps: [tiktokTwin, fbOwn] }), [file('a.mp4')])).reused.tsps).toEqual([8]);
    expect(ok(launchSteps(form({ launch_tomorrow: false, campaigns: [row({ bid: 0.3 })] }), snapshot({ tsps: [{ ...fbOwn, topic_id: 107567 }] }), [file('a.mp4')])).reused.tsps).toEqual([]);
  });

  it('reuses a video the topic holds from TikTok as it is', () => {
    const s = fbSnapshot({ creatives: [{ id: 900, media_type: 'Video', original_filename: 'a-abcdef01.mp4', headline: null, status: 'New', ad_script: 'x', traffic_sources: ['tiktok'] }] });
    expect(ok(launchSteps(fbForm(), s, [file('a.mp4')])).reused.creatives).toEqual([{ file: 'a.mp4', id: 900 }]);
  });

  it('lists what has not been checked on a live launch instead of saying the bodies are not', () => {
    const plan = ok(launchSteps(fbForm({ facebook: fbSettings({ placements: 'facebook' }) }), fbSnapshot(), [file('a.mp4')]));
    const said = plan.warnings.join('\n');
    expect(said).not.toMatch(/не звірені з дампами адмінки/);
    expect(said).toMatch(/Facebook Only/);
    expect(said).toMatch(/bid рядком при Bid Cap/);
    expect(ok(launchSteps(form(), snapshot(), [file('a.mp4')])).warnings.join()).not.toMatch(/не звірено/);
  });
});

describe('images', () => {
  const images = [file('Banner 1.PNG', '1111aaaa2222', ''), file('photo.jpeg', '3333bbbb4444', ''), file('x.webp', '5555cccc6666', '')];

  it('go up as images under their own extension and mime, with no script, each its own ad beside the videos', () => {
    const plan = ok(launchSteps(form(), snapshot(), [file('a.mp4'), ...images]));
    const uploads = kinds(plan.steps, 'creative.upload');
    expect(uploads.map(u => [u.upload, u.mime, u.body.media_type, 'ad_script' in u.body])).toEqual([
      ['a-abcdef01.mp4', 'video/mp4', 'Video', true],
      ['Banner_1-1111aaaa.png', 'image/png', 'Image', false],
      ['photo-3333bbbb.jpeg', 'image/jpeg', 'Image', false],
      ['x-5555cccc.webp', 'image/webp', 'Image', false],
    ]);
    expect(uploads[1]!.body).toMatchObject({ grade: 'New', traffic_sources: ['tiktok'], topic_ids: [107567], countries: ['Germany'] });
    expect(kinds(plan.steps, 'builder.create')[0]!.body.creative_repo_ids).toHaveLength(5);
    expect(plan.steps.find(s => s.kind === 'builder.create')!.label).toMatch(/1 відео, 3 картинки/);
  });

  it('are reused when the topic holds them under the upload name or by their bytes, and the same image twice goes up once', () => {
    const s = snapshot({
      creatives: [{ id: 960, media_type: 'Image', original_filename: 'Banner_1-1111aaaa.png', headline: null, status: 'New', ad_script: null }],
      heldByDigest: { '3333bbbb4444': 961 },
    });
    const plan = ok(launchSteps(form(), s, [...images, file('copy.png', '5555cccc6666', '')]));
    expect(plan.reused.creatives).toEqual([{ file: 'Banner 1.PNG', id: 960 }, { file: 'photo.jpeg', id: 961 }]);
    expect(kinds(plan.steps, 'creative.upload').map(u => u.upload)).toEqual(['x-5555cccc.webp']);
  });

  it('refuse a file that is neither mp4 nor a supported image', () => {
    const plan = launchSteps(form(), snapshot(), [file('anim.gif', '7777dddd', '')]);
    expect(!plan.ok && plan.errors).toContain('anim.gif — не mp4 і не картинка jpg, png чи webp');
  });

  it('warn on TikTok that a static creative may be refused or shown only on Pangle', () => {
    expect(ok(launchSteps(form(), snapshot(), images)).warnings.join()).toMatch(/Pangle/);
    expect(ok(launchSteps(fbForm(), fbSnapshot(), images)).warnings.join()).not.toMatch(/Pangle/);
  });
});

describe('ratioWarning', () => {
  it('says an unusual proportion for the source, and nothing for the usual ones', () => {
    expect(ratioWarning(1080, 1920, 'tiktok')).toBeNull();
    expect(ratioWarning(1080, 1080, 'tiktok')).toMatch(/1:1.*TikTok.*9:16/);
    expect([[1080, 1920], [1080, 1350], [1080, 1080], [1200, 628]].map(([w, h]) => ratioWarning(w!, h!, 'facebook'))).toEqual([null, null, null, null]);
    expect(ratioWarning(1600, 900, 'facebook')).toMatch(/16:9/);
  });
});

describe('a topic with campaigns of both sources', () => {
  const mixed = (source: 'tiktok' | 'facebook') => (source === 'facebook' ? fbSnapshot : snapshot)({
    builders: [
      builder(1, { traffic_source: 'tiktok', pixel_id: 35967, page_id: 30040, country: 'Germany', creative_ids: [901] }),
      builder(2, { traffic_source: 'facebook', pixel_id: 61001, page_id: 501, country: 'Austria', creative_ids: [902] }),
      builder(3, { traffic_source: 'tiktok', post_id: 502, country: 'United Kingdom', campaigns: [{ id: 30, name: 'x', term_group_id: 12, ad_account: null }] }),
    ],
    links: { 1: { tsp: 7, term_group: 11, ad_account: null }, 2: { tsp: 8, term_group: 11, ad_account: null }, 3: { tsp: 9, term_group: 12, ad_account: null } },
    tsps: [
      tsp(7, { budget: 35, bid: 0.8, launch_tomorrow: true }),
      { id: 8, name: 'fb', topic_id: 107990, fields: fbFields({ budget: 40, bid: 0.5, facebook: fbSettings({ launch_time: '00:00', placements: 'facebook', age_from: 25 }) }) },
      tsp(9, { budget: 50, bid: 0.9, location: ['United Kingdom'] }),
    ],
    creatives: [
      headlineEntry(901, '<p><strong>Mehr erfahren</strong></p>', { traffic_sources: ['tiktok'] }),
      headlineEntry(902, '<p>Jetzt ansehen</p>', { traffic_sources: ['facebook'], primary_text: '<p>Autos ab 99 €</p>' }),
    ],
    buyerPages: [503, 501, 502],
  });

  it('offers the sets of both sources', () => {
    expect(setsAndDefaults(mixed('facebook'), FB_TEAM_DEFAULTS).sets.map(s => s.termGroup.name)).toEqual(['tg-forklift', 'tg-wh']);
  });

  it('fills a Facebook launch from the set\'s Facebook campaign only — its pixel, page, numbers, profile fields, headline and primary text', () => {
    const { sets } = setsAndDefaults(mixed('facebook'), FB_TEAM_DEFAULTS);
    const wh = sets.find(s => s.termGroup.id === 11)!.defaults;
    expect(wh).toMatchObject({
      countries: ['AT'], budget: 40, bid: 0.5, pixel: '61001', page: '501', headline: 'Jetzt ansehen', primary_text: 'Autos ab 99 €', source: 'facebook',
      facebook: { launch_time: '00:00', placements: 'facebook', age_from: 25 },
    });
  });

  it('fills a set with no Facebook campaign from the topic\'s Facebook one, its countries from its own campaign', () => {
    const { sets, newSet } = setsAndDefaults(mixed('facebook'), FB_TEAM_DEFAULTS);
    const forklift = sets.find(s => s.termGroup.id === 12)!.defaults;
    expect(forklift).toMatchObject({ countries: ['GB'], budget: 40, bid: 0.5, pixel: '61001', page: null, headline: 'Jetzt ansehen', primary_text: 'Autos ab 99 €' });
    expect(newSet).toMatchObject({ budget: 40, pixel: '61001', page: null });
  });

  it('fills a TikTok launch from TikTok campaigns only', () => {
    const wh = setsAndDefaults(mixed('tiktok'), TEAM_DEFAULTS).sets.find(s => s.termGroup.id === 11)!.defaults;
    expect(wh).toMatchObject({ countries: ['AT'], budget: 35, bid: 0.8, launch_tomorrow: true, pixel: '35967', page: '30040', headline: 'Mehr erfahren', primary_text: '' });
  });

  it('falls to the team for a Facebook launch on a topic with TikTok campaigns only', () => {
    const tiktokOnly = { ...mixed('facebook'), builders: mixed('facebook').builders.filter(b => b.traffic_source === 'tiktok') };
    expect(setsAndDefaults(tiktokOnly, FB_TEAM_DEFAULTS).newSet).toMatchObject({ budget: 20, bid: 0.3, headline: 'Learn more', primary_text: '', page: null, facebook: FB_TEAM_DEFAULTS.facebook });
  });

  it('gives the buyer\'s recent pages, the topic\'s first', () => {
    expect(setsAndDefaults(mixed('facebook'), FB_TEAM_DEFAULTS).recentPages).toEqual(['501', '503', '502']);
  });

  it('reads the links of the newest campaign of each set and of the newest of its own source', () => {
    const s = { ...mixed('facebook'), links: {}, builders: [...mixed('facebook').builders, builder(4, { traffic_source: 'tiktok' })] };
    expect(linksWanted(s)).toEqual([4, 3, 2]);
  });
});

describe('forCabinet on Facebook', () => {
  const lists = {
    accounts: [
      { id: '70001', name: 'FB / Agency-1', business: '9001', account: 'act_1201' }, { id: '70002', name: 'FB / Agency-2', business: '9001', account: '1202' },
      { id: '70003', name: 'FB / Other-1', business: '9002', account: '1301' }, { id: '70004', name: 'FB / Agency-3', business: '9001', account: '1203' },
      { id: '70005', name: 'FB / Bare', business: '9003', account: '1401' },
    ],
    pixels: [
      { id: '61001', name: 'АВТО1', business: '9001', account: '1201', pixel: '880011' }, { id: '61002', name: 'АВТО1', business: '9001', account: 'act_1202', pixel: '880011' },
      { id: '61003', name: 'АВТО1', business: '9002', account: '1301', pixel: '880099' },
    ],
    pages: [{ id: '501', name: 'Good Life', business: '9001' }, { id: '502', name: 'Fresh Page', business: '' }, { id: '503', name: 'Other Page', business: '9002' }],
  };
  const fit = (pixel: string | null, page: string | null, account: string, recent: string[] = []) =>
    forCabinet({ pixel, page }, account, lists, 'Good Life', { recentPages: recent });

  it('takes the pixel\'s row bound to the cabinet, then the business\'s, then the same name there, then none', () => {
    expect(fit('61001', null, '70002').pixel).toBe('61002');
    expect(fit('61002', null, '70001').pixel).toBe('61001');
    expect(fit('61001', null, '70004').pixel).toBe('61001');
    expect(fit('61001', null, '70003').pixel).toBe('61003');
    expect(fit('61001', null, '70005').pixel).toBeNull();
  });

  it('keeps a page of the cabinet\'s business or of none, then takes the latest recent one there, and never the team\'s page by name', () => {
    expect(fit(null, '501', '70002').page).toBe('501');
    expect(fit(null, '502', '70003').page).toBe('502');
    expect(fit(null, '501', '70003', ['501', '503']).page).toBe('503');
    expect(fit(null, null, '70001').page).toBeNull();
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
