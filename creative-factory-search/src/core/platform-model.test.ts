import { describe, expect, it } from 'vitest';
import {
  articleText, headlineHtml, headlineText, resolveCountry, sameTsp, tspBody, uploadedId, type PlatformCreative, type TspFields,
} from './platform-model.ts';

const video = (id: number, name: string): PlatformCreative => ({ id, media_type: 'Video', original_filename: name, headline: null, status: 'New', ad_script: '' });

const fields = (over: Partial<TspFields> = {}): TspFields => ({
  budget: 20, bid: 0.45, location: ['Germany'], language: 'All', gender: 'All', age: ['All'], devices: ['All'], os: [],
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
    expect(headlineHtml('Learn more')).toBe('<p><strong>Learn more</strong></p>');
    expect(headlineHtml('Tom & <Jerry>')).toBe('<p><strong>Tom &amp; &lt;Jerry&gt;</strong></p>');
    expect(headlineText(headlineHtml('Tom & <Jerry>'))).toBe('Tom & <Jerry>');
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
    expect(tspBody('tiktok', 106752, fields())).toMatchObject({
      topic_id: 106752, traffic_source: 'tiktok', budget_type: 'Daily Budget', budget: 20, bid: '0.45', lunch_tomorrow: 1, end_date: 0,
      age_from: ['All'], gender: 'All', location: ['Germany'], language: 'All', devices: ['All'], device_os: null, schedule: [], quantity: 1,
    });
    expect(tspBody('tiktok', 1, fields({ launch_tomorrow: false, os: ['iOS'] }))).toMatchObject({ lunch_tomorrow: 0, device_os: ['iOS'] });
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
