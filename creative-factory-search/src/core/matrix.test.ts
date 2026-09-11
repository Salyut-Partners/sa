import { describe, expect, it } from 'vitest';
import { parseCampaignManifest, parseTopicManifest, type TopicManifest } from './launch.ts';
import {
  campaignFolderName, expandMatrix, HEADLINE_PLACEHOLDER, parseMatrix, renderCampaignYaml, singleCampaignMatrix,
  THEME_PLACEHOLDER, type Existing, type MatrixSpec,
} from './matrix.ts';

const TOPIC = `
launch_key: ai-jobs-de-wh
name: AI jobs DE wh
site: 182
accounts:
  main-tk:
    source: tiktok
    ad_account: "53560"
    pixel: "35967"
  fb-1:
    source: facebook
    ad_account: "9001"
    pixel: "9002"
`;

const topic = (): TopicManifest => {
  const result = parseTopicManifest(TOPIC);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.value;
};

const NOTHING: Existing = { termgroups: [], articles: [], campaigns: [] };

const MATRIX = {
  termgroups: {
    'tg-wh': { keywords: ['warehouse jobs', 'lagerjobs'] },
    'tg-clean': { keywords: ['cleaning jobs'], country: 'All', language: 'All' },
  },
  articles: { 'a-wh': { title: 'Warehouse jobs' }, 'a-clean': { title: 'Cleaning jobs' } },
  geos: [{ language: 'de', country: 'DE' }, { language: 'de', country: 'AT' }],
  defaults: { theme: '768', headline: 'Mehr erfahren', rsoc_count: 5, tsp: { budget: 20, bid: 0.45 } },
  overrides: [
    { where: { country: 'DE', account: 'fb-1' }, set: { tsp: { bid: 0.55 } } },
    { where: { termgroup: 'tg-wh', article: 'a-wh', country: 'AT', account: 'main-tk' }, set: { name: 'at-special', headline: 'Jetzt' } },
  ],
};

const spec = (raw: unknown = MATRIX): MatrixSpec => {
  const result = parseMatrix(raw, topic());
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.value;
};

describe('the folder name rule', () => {
  it('is language-country-account-termgroup-article, lower case, anything odd made a dash', () => {
    expect(campaignFolderName({ language: 'de', country: 'DE', account: 'main-tk', termgroup: 'tg-wh', article: 'a-wh' })).toBe('de-de-main-tk-tg-wh-a-wh');
    expect(campaignFolderName({ language: 'fr', country: 'BE', account: 'Main TK', termgroup: 'tg_1', article: 'A1' })).toBe('fr-be-main-tk-tg-1-a1');
  });
});

describe('expanding a matrix', () => {
  it('makes every cell of 2 × 2 × 2 × 2 and a second run makes none', () => {
    const first = expandMatrix(spec(), topic(), NOTHING);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.created.campaigns).toHaveLength(16);
    expect(first.value.created.termgroups).toEqual(['tg-wh', 'tg-clean']);
    expect(first.value.created.articles).toEqual(['a-wh', 'a-clean']);
    expect(first.value.files.filter(f => f.path.endsWith('campaign.yaml'))).toHaveLength(16);
    expect(first.value.files.find(f => f.path === 'termgroups/tg-wh/keywords.txt')?.content).toBe('warehouse jobs\nlagerjobs\n');
    expect(first.value.files.find(f => f.path === 'termgroups/tg-wh/termgroup.yaml')).toBeUndefined();
    expect(first.value.files.find(f => f.path === 'termgroups/tg-clean/termgroup.yaml')?.content).toBe('country: All\nlanguage: All\n');
    expect(first.value.dirs).toContain('campaigns/de-de-main-tk-tg-wh-a-wh/creatives');

    const again = expandMatrix(spec(), topic(), first.value.created);
    expect(again.ok && again.value.created).toEqual({ termgroups: [], articles: [], campaigns: [] });
    expect(again.ok && again.value.skipped.campaigns).toHaveLength(16);
    expect(again.ok && again.value.files).toEqual([]);
  });

  it('writes manifests the campaign parser reads back, with the cell\'s own fields', () => {
    const result = expandMatrix(spec(), topic(), NOTHING);
    if (!result.ok) throw new Error(result.errors.join());
    const read = (name: string) => {
      const file = result.value.files.find(f => f.path === `campaigns/${name}/campaign.yaml`);
      if (file === undefined) throw new Error(`no ${name}`);
      const parsed = parseCampaignManifest(file.content, topic());
      if (!parsed.ok) throw new Error(parsed.errors.join('; '));
      return parsed.value;
    };
    const plain = read('de-de-main-tk-tg-wh-a-wh');
    expect(plain).toMatchObject({ termgroup: 'tg-wh', article: 'a-wh', language: 'de', country: 'DE', account: 'main-tk', theme: '768', headline: 'Mehr erfahren', rsoc_count: 5 });
    expect(plain.tsp).toMatchObject({ budget: 20, bid: 0.45, launch_tomorrow: true, end_date: null, language: 'All' });
    // the DE/fb-1 override changes the bid and nothing else
    expect(read('de-de-fb-1-tg-wh-a-wh').tsp.bid).toBe(0.55);
    expect(read('de-de-fb-1-tg-wh-a-wh').headline).toBe('Mehr erfahren');
    expect(read('de-at-fb-1-tg-wh-a-wh').tsp.bid).toBe(0.45);
    // the named cell takes its name and its headline
    expect(result.value.created.campaigns).toContain('at-special');
    expect(result.value.created.campaigns).not.toContain('de-at-main-tk-tg-wh-a-wh');
    expect(read('at-special').headline).toBe('Jetzt');
  });

  it('skips folders that exist and refuses a null term group or article that does not', () => {
    const existing: Existing = { termgroups: ['tg-wh'], articles: [], campaigns: ['de-de-main-tk-tg-wh-a-wh'] };
    const result = expandMatrix(spec({ ...MATRIX, termgroups: { 'tg-wh': null, 'tg-clean': MATRIX.termgroups['tg-clean'] } }), topic(), existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.skipped).toEqual({ termgroups: ['tg-wh'], articles: [], campaigns: ['de-de-main-tk-tg-wh-a-wh'] });
    expect(result.value.created.campaigns).toHaveLength(15);

    const missing = expandMatrix(spec({ ...MATRIX, articles: ['a-ghost'] }), topic(), NOTHING);
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.errors.join()).toMatch(/статті `a-ghost` немає/);
  });

  it('refuses two cells landing on one folder name', () => {
    const clash = spec({ ...MATRIX, overrides: [{ where: { country: 'AT' }, set: { name: 'same' } }] });
    const result = expandMatrix(clash, topic(), NOTHING);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/одну теку `same`/);
  });

  it('leaves placeholders where nothing was said and says so', () => {
    const bare = spec({ termgroups: ['tg-wh'], articles: ['a-wh'], geos: [{ language: 'de', country: 'DE' }], accounts: ['main-tk'] });
    const result = expandMatrix(bare, topic(), { termgroups: ['tg-wh'], articles: ['a-wh'], campaigns: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const yaml = result.value.files.find(f => f.path.endsWith('campaign.yaml'))!.content;
    expect(yaml).toContain(THEME_PLACEHOLDER);
    expect(yaml).toContain(HEADLINE_PLACEHOLDER);
    expect(result.value.notes.join()).toMatch(/theme, headline, tsp.budget, tsp.bid/);
  });
});

describe('parsing a matrix', () => {
  it('names what is wrong at once: an unknown cabinet, a missing geo, duplicate keys, a stray field', () => {
    const result = parseMatrix({
      termgroups: { 'tg-wh': { keywords: ['a', 'A'] } },
      articles: ['a-wh'],
      accounts: ['ghost'],
      extra: 1,
    }, topic());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = result.errors.join('\n');
    expect(text).toMatch(/кабінету `ghost` немає/);
    expect(text).toMatch(/geos/);
    expect(text).toMatch(/tg-wh/);
    expect(text).toMatch(/невідоме поле матриці `extra`/);
  });

  it('takes every cabinet of the topic when none are named', () => {
    expect(spec().accounts).toEqual(['main-tk', 'fb-1']);
  });

  it('wants weight on every term group or on none', () => {
    const result = parseMatrix({ ...MATRIX, termgroups: { a: { keywords: ['x'], weight: 60 }, b: { keywords: ['y'] } } }, topic());
    expect(!result.ok && result.errors.join()).toMatch(/вага/);
  });
});

describe('one campaign', () => {
  it('is a one-cell matrix over folders that exist, with the flags as its fields', () => {
    const one = singleCampaignMatrix({
      termgroup: 'tg-wh', article: 'a-wh', language: 'de', country: 'DE', account: 'fb-1', bid: 0.6, budget: 30, theme: '768', headline: 'Hi',
    }, topic());
    if (!one.ok) throw new Error(one.errors.join());
    const result = expandMatrix(one.value, topic(), { termgroups: ['tg-wh'], articles: ['a-wh'], campaigns: [] });
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.value.created.campaigns).toEqual(['de-de-fb-1-tg-wh-a-wh']);
    const parsed = parseCampaignManifest(result.value.files.find(f => f.path.endsWith('campaign.yaml'))!.content, topic());
    expect(parsed.ok && parsed.value.tsp).toMatchObject({ bid: 0.6, budget: 30 });
    expect(result.value.notes).toEqual([]);
  });

  it('refuses without every axis', () => {
    const result = singleCampaignMatrix({ termgroup: 'tg-wh', article: '', language: 'de', country: 'DE', account: 'fb-1' }, topic());
    expect(!result.ok && result.errors.join()).toMatch(/--article/);
  });
});

describe('rendering a manifest', () => {
  it('round-trips through the parser', () => {
    const m = {
      termgroup: 'tg', article: 'a', language: 'de', country: 'DE', account: 'main-tk', theme: '768', rsoc_count: 6,
      keyword_rotation: true, headline: 'Mehr: erfahren', tsp: {
        budget: 25, bid: 0.5, launch_tomorrow: false, end_date: '2026-10-01', age: ['25-34', '35-44'], gender: 'Female',
        devices: ['Mobile'], os: ['iOS'], schedule: [], language: 'German',
      },
    };
    const parsed = parseCampaignManifest(renderCampaignYaml(m), topic());
    expect(parsed.ok && parsed.value).toEqual(m);
  });
});
