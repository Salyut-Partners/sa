import { describe, expect, it } from 'vitest';
import {
  articleText, headlineHtml, headlineText, parseCreatives, parsePages, parsePixels, parseTsp, resolveCountry, sameTsp, tspBody, uploadedId,
  type FacebookSettings, type PlatformCreative, type TspFields,
} from './platform-model.ts';

const video = (id: number, name: string): PlatformCreative => ({ id, media_type: 'Video', original_filename: name, headline: null, status: 'New', ad_script: '' });

const fields = (over: Partial<TspFields> = {}): TspFields => ({
  source: 'tiktok', facebook: null, budget: 20, bid: 0.45, location: ['Germany'], language: 'All', gender: 'All', age: ['All'], devices: ['All'], os: [],
  launch_tomorrow: true, end_date: null, scheduled: false, ...over,
});

describe('uploadedId', () => {
  const before = [1001];
  const after = [video(1001, '01.mp4'), video(1002, '02.mp4'), video(1003, '03.mp4'), video(1004, '03.mp4')];

  it('finds the one new entry that carries the name', () => {
    expect(uploadedId(before, after, '02.mp4')).toBe(1002);
  });

  it('ignores an entry that was there before, even under the name', () => {
    expect(uploadedId(before, after, '01.mp4')).toBeNull();
  });

  it('takes the newest when a retry left two new entries with one name', () => {
    expect(uploadedId(before, after, '03.mp4')).toBe(1004);
  });

  it('does not take a headline for a file', () => {
    expect(uploadedId([], [{ ...video(6, '02.mp4'), media_type: 'Headline' }], '02.mp4')).toBeNull();
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
    expect(headlineHtml('Learn more', 'tiktok')).toBe('<p><strong>Learn more</strong></p>');
    expect(headlineHtml('Tom & <Jerry>', 'tiktok')).toBe('<p><strong>Tom &amp; &lt;Jerry&gt;</strong></p>');
    expect(headlineText(headlineHtml('Tom & <Jerry>', 'tiktok'))).toBe('Tom & <Jerry>');
  });
});

describe('articleText', () => {
  it('reads an article as lines: paragraphs, headings, list items', () => {
    expect(articleText('<h2>Jobs</h2><p>Work in a <b>warehouse</b> &amp; earn.</p><ul><li>Day</li><li>Night</li></ul>'))
      .toBe('Jobs\nWork in a warehouse & earn.\n\n- Day\n- Night');
  });
});

describe('TSP', () => {
  it('compares by what the buyer sets, whatever order the lists come in', () => {
    const a = fields({ age: ['25-34', '18-24'] });
    expect(sameTsp(a, { ...a, age: ['18-24', '25-34'] })).toBe(true);
    expect(sameTsp(a, { ...a, bid: 0.5 })).toBe(false);
    expect(sameTsp(a, { ...a, location: ['Italy'] })).toBe(false);
  });

  it('is sent as the admin sends it: bid as text, launch tomorrow as 1, no end date as 0, no OS as null', () => {
    expect(tspBody(106752, fields())).toMatchObject({
      topic_id: 106752, traffic_source: 'tiktok', budget_type: 'Daily Budget', budget: 20, bid: '0.45', lunch_tomorrow: 1, end_date: 0,
      age_from: ['All'], gender: 'All', location: ['Germany'], language: 'All', devices: ['All'], device_os: null, schedule: [], quantity: 1,
    });
    expect(tspBody(1, fields({ launch_tomorrow: false, os: ['iOS'] }))).toMatchObject({ lunch_tomorrow: 0, device_os: ['iOS'] });
  });
});

describe('resolveCountry', () => {
  const countries = [{ name: 'Germany', code: 'DE' }, { name: 'United States', code: 'US' }];
  it('passes All, turns a code into the name, accepts a name in any case', () => {
    expect(resolveCountry('All', countries)).toEqual({ ok: true, value: 'All' });
    expect(resolveCountry('de', countries)).toEqual({ ok: true, value: 'Germany' });
    expect(resolveCountry('united states', countries)).toEqual({ ok: true, value: 'United States' });
    expect(resolveCountry('Mars', countries).ok).toBe(false);
  });
});

// ---------------------------------------------------------------- Facebook --

const fb = (over: Partial<FacebookSettings> = {}): FacebookSettings => ({
  performance_goal: 'MAXIMIZE_NUMBER_OF_CONVERSIONS', bid_strategy: 'LOWEST_COST_WITH_BID_CAP', placements: 'advantage',
  age_from: 18, age_to: 65, launch_time: null, ...over,
});

const fbFields = (over: Partial<TspFields> = {}): TspFields => ({
  ...fields({ launch_tomorrow: false }), source: 'facebook', facebook: fb(), ...over,
});

/**
 * `GET /traffic-source-profiles/142169`, cut down to what is read — the shape
 * the session's dump had (no token in it): ages as text, `bid` a number,
 * `device_os: "ALL"`, the schedule a row per day.
 */
const PROFILE_142169 = {
  id: 142169, name: 'AIautoDEfb-fb-DE-20', topic_id: 107990, traffic_source: 'facebook',
  budget: 20, bid: 0.3, budget_type: 'Daily Budget', location: ['Germany'], language: 'All', gender: 'All',
  age_from: '18', age_to: '65', devices: ['All'], device_os: 'ALL', placements: 'advantage',
  performance_goal: 'MAXIMIZE_NUMBER_OF_CONVERSIONS', bid_strategy: 'LOWEST_COST_WITH_BID_CAP', pixel_attribution: '7-1-1',
  launch_type: 'tomorrow', launch_time: '00:00', lunch_tomorrow: 0, end_date: '0',
  schedule: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({ day, from: null, to: null, checked: false })),
};

describe('parseTsp', () => {
  it('reads a Facebook profile with its source and its own fields, the OS left out', () => {
    expect(parseTsp(PROFILE_142169)).toEqual({
      id: 142169, name: 'AIautoDEfb-fb-DE-20', topic_id: 107990,
      fields: fbFields({ budget: 20, bid: 0.3, facebook: fb({ launch_time: '00:00' }) }),
    });
  });

  it('reads a start of now, and no bid without a cap', () => {
    const now = parseTsp({ ...PROFILE_142169, launch_type: null, launch_time: null, bid_strategy: 'LOWEST_COST_WITHOUT_CAP', bid: 0.3 });
    expect(now.fields.facebook).toMatchObject({ launch_time: null, bid_strategy: 'LOWEST_COST_WITHOUT_CAP' });
    expect(now.fields.bid).toBe(0);
  });

  it('reads a Cost per result profile as one, with its bid as the goal', () => {
    const cost = parseTsp({ ...PROFILE_142169, bid_strategy: 'COST_CAP', bid: 0.8 });
    expect(cost.fields.facebook).toMatchObject({ bid_strategy: 'COST_CAP' });
    expect(cost.fields.bid).toBe(0.8);
  });

  it('reads a TikTok profile as before, as TikTok also when the source is not said', () => {
    const raw = { id: 7, name: 'x', topic_id: 1, budget: '20', bid: '0.45', location: '["Germany"]', age_from: '["All"]', lunch_tomorrow: 1, device_os: null };
    expect(parseTsp(raw).fields).toEqual(fields());
    expect(parseTsp({ ...raw, traffic_source: 'tiktok' }).fields.source).toBe('tiktok');
  });

  it('tells a Facebook profile from a TikTok one with the same numbers, and two Facebook ones by their own fields', () => {
    const tiktok = fields({ launch_tomorrow: false });
    expect(sameTsp(tiktok, { ...tiktok, source: 'facebook', facebook: fb() })).toBe(false);
    expect(sameTsp(fbFields(), fbFields())).toBe(true);
    expect(sameTsp(fbFields(), fbFields({ facebook: fb({ launch_time: '00:00' }) }))).toBe(false);
    expect(sameTsp(fbFields(), fbFields({ facebook: fb({ placements: 'facebook' }) }))).toBe(false);
  });
});

describe('Facebook profile body', () => {
  it('is sent as the admin\'s Facebook form sends it: the fixed part, ages as text, attribution 7-1-1', () => {
    const body = tspBody(106752, fbFields());
    expect(body).toMatchObject({
      topic_id: 106752, traffic_source: 'facebook', acb: 0, acb_budget_type: '', acb_schedule: 0, budget_type: 'Daily Budget',
      schedule_time_zone: '', start_date: '', lunch_tomorrow: 0, dynamic_creative: 0, quantity: 1, pixel_attribution: '7-1-1',
      devices: ['All'], device_os: null, performance_goal: 'MAXIMIZE_NUMBER_OF_CONVERSIONS', bid_strategy: 'LOWEST_COST_WITH_BID_CAP',
      budget: 20, bid: '0.45', age_from: '18', age_to: '65', gender: 'All', location: ['Germany'], language: 'All', placements: 'advantage', end_date: 0,
      launch_time: null,
    });
    expect('schedule' in body && body.schedule).toEqual(
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({ day, from: null, to: null, checked: false })),
    );
    expect('launch_type' in body).toBe(false);
  });

  it('starts tomorrow at a time, and sends no bid without a cap', () => {
    const body = tspBody(1, fbFields({ bid: 0, facebook: fb({ launch_time: '00:00', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', age_from: 25, age_to: 54 }) }));
    expect(body).toMatchObject({ launch_type: 'tomorrow', launch_time: '00:00', lunch_tomorrow: 0, bid_strategy: 'LOWEST_COST_WITHOUT_CAP', age_from: '25', age_to: '54' });
    expect('bid' in body).toBe(false);
  });

  it('sends the bid as the cost per result goal on Cost per result', () => {
    const body = tspBody(1, fbFields({ bid: 0.8, facebook: fb({ bid_strategy: 'COST_CAP' }) }));
    expect(body).toMatchObject({ bid_strategy: 'COST_CAP', bid: '0.8' });
  });

  it('leaves the TikTok body as it was', () => {
    expect(tspBody(1, fields())).toMatchObject({ traffic_source: 'tiktok', bid: '0.45', lunch_tomorrow: 1, age_from: ['All'], cbo: 0 });
  });
});

describe('headline html by source', () => {
  it('is a bold paragraph on TikTok and a plain one on Facebook', () => {
    expect(headlineHtml('Learn more', 'tiktok')).toBe('<p><strong>Learn more</strong></p>');
    expect(headlineHtml('Learn & earn', 'facebook')).toBe('<p>Learn &amp; earn</p>');
  });
});

describe('parsePages', () => {
  it('reads a page by its name and business, a page with no business as unknown, and skips the inactive', () => {
    const raw = { pages: [
      { id: 501, page_name: 'Good Life', business_id: '9001', is_active: 1 },
      { id: 502, page_name: 'Fresh Page', business_id: null, is_active: 1 },
      { id: 503, page_name: 'Gone', business_id: '9001', is_active: 0 },
      { id: 504, page_name: 'TikTok identity', business_id: '9002' },
    ] };
    expect(parsePages(raw)).toEqual([
      { id: 501, name: 'Good Life', business_id: '9001' }, { id: 502, name: 'Fresh Page', business_id: '' },
      { id: 504, name: 'TikTok identity', business_id: '9002' },
    ]);
  });
});

describe('parsePixels', () => {
  it('reads one Facebook pixel as a row per cabinet, each with the pixel\'s own id', () => {
    const raw = { pixels: [
      { id: 61001, name: 'АВТО1', ad_pixel_id: '880011', ad_account_id: 'act_1201', business_id: '9001' },
      { id: 61002, name: 'АВТО1', ad_pixel_id: '880011', ad_account_id: 'act_1202', business_id: '9001' },
      { id: 34040, name: 'Джобс', ad_account_id: '7', business_id: null },
    ] };
    expect(parsePixels(raw)).toEqual([
      { id: 61001, name: 'АВТО1', ad_pixel_id: '880011', ad_account_id: 'act_1201', business_id: '9001' },
      { id: 61002, name: 'АВТО1', ad_pixel_id: '880011', ad_account_id: 'act_1202', business_id: '9001' },
      { id: 34040, name: 'Джобс', ad_pixel_id: '', ad_account_id: '7', business_id: '' },
    ]);
  });
});

describe('parseCreatives', () => {
  it('reads the sources an entry is marked with and a headline\'s primary text where the list gives them, and none where it does not', () => {
    const raw = { creativeRepos: [
      { id: 1, media_type: 'Image', original_filename: 'a-1234abcd.png', file_path_url: 'https://cdn/x.png', traffic_sources: ['facebook'], status: 'New' },
      { id: 2, media_type: 'Headline', headline: '<p>Learn more</p>', primary_text: '<p>Find work near you</p>', traffic_sources: '["facebook"]' },
      { id: 3, media_type: 'Video', original_filename: 'v.mp4', ad_script: 'hi', file_path_url: '' },
    ] };
    const [image, headline, video] = parseCreatives(raw);
    expect(image).toMatchObject({ id: 1, media_type: 'Image', traffic_sources: ['facebook'], file_url: 'https://cdn/x.png' });
    expect(headline).toMatchObject({ headline: '<p>Learn more</p>', primary_text: '<p>Find work near you</p>', traffic_sources: ['facebook'] });
    expect(video).toMatchObject({ traffic_sources: null, primary_text: null, file_url: null, ad_script: 'hi' });
  });
});

describe('uploadedId for an image', () => {
  it('finds a new image under its upload name as it finds a video', () => {
    expect(uploadedId([], [{ ...video(8, 'a-1234abcd.png'), media_type: 'Image' }], 'a-1234abcd.png')).toBe(8);
  });
});
