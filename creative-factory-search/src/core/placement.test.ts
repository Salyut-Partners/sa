import { describe, expect, it } from 'vitest';
import { planBatch } from './batch.ts';
import {
  campaignSummary, CREATIVES_DIR, creativesFolder, defaultLayout, destinationFor, mergeLayout,
  placementSize, placePlan, rowSummary, selectionTarget, setLocaleTarget, setPhotoTarget,
  type CampaignInfo, type ExportLayout,
} from './placement.ts';
import { apply, createProject } from './project.ts';
import type { LocaleId, Project } from './types.ts';

const photos = (...names: string[]) =>
  names.map((name, i) => ({ id: 'p' + i, name, image: 'data:image/jpeg;base64,' + i }));

function batchOf(...names: string[]): Project {
  const project = apply(createProject(), { type: 'photo/add', photos: photos(...names) });
  return apply(project, { type: 'selection/all' });
}

const withLocales = (project: Project, ...ids: LocaleId[]): Project =>
  ids.reduce((p, id) => apply(p, { type: 'locale/add', id }), project);

const CAMPAIGNS: CampaignInfo[] = [
  { name: 'it-rome', language: 'it', country: 'IT' },
  { name: 'de-main', language: 'DE', country: 'DE' },
  { name: 'it-milan', language: 'it', country: 'IT' },
  { name: 'example', language: null, country: null },
];

describe('defaultLayout', () => {
  it('sends each release language to the campaign that speaks it', () => {
    const project = withLocales(batchOf('a.jpg'), 'de', 'it');
    const layout = defaultLayout(project, CAMPAIGNS);
    expect(layout.locales['de']).toBe('de-main');
    // Two Italian campaigns: the first by name, and the row says so for the buyer to change.
    expect(layout.locales['it']).toBe('it-milan');
  });

  it('leaves a language out when no campaign speaks it', () => {
    const layout = defaultLayout(withLocales(batchOf('a.jpg'), 'pl'), CAMPAIGNS);
    expect(layout.locales['pl']).toBeNull();
    expect(layout.locales['en']).toBeNull();
  });

  it('only lays out the languages marked for release', () => {
    const project = apply(withLocales(batchOf('a.jpg'), 'de'), {
      type: 'locale/patch', id: 'de', patch: { include: false },
    });
    expect(Object.keys(defaultLayout(project, CAMPAIGNS))).toEqual(['locales', 'overrides']);
    expect('de' in defaultLayout(project, CAMPAIGNS).locales).toBe(false);
  });
});

describe('placePlan', () => {
  const project = withLocales(batchOf('a.jpg', 'b.jpg', 'c.jpg'), 'de', 'it');

  it('lays three languages into three folders without a hand on the files', () => {
    const layout: ExportLayout = {
      locales: { en: 'en-main', de: 'de-main', it: 'it-rome' },
      overrides: {},
    };
    const placed = placePlan(planBatch(project), layout);
    expect(placed.plan.total).toBe(9);
    expect(placed.skipped).toBe(0);
    expect(placed.destinations['01-a-de.mp4']).toBe('de-main');
    expect(placed.destinations['03-c-it.mp4']).toBe('it-rome');
    expect(new Set(Object.values(placed.destinations))).toEqual(new Set(['en-main', 'de-main', 'it-rome']));
  });

  it('drops a language switched off, and the groups that only held it', () => {
    const layout: ExportLayout = { locales: { en: 'en-main', de: null, it: 'it-rome' }, overrides: {} };
    const placed = placePlan(planBatch(project), layout);
    expect(placed.plan.total).toBe(6);
    expect(placed.skipped).toBe(3);
    expect(placed.plan.groups.flatMap(g => g.items).every(i => i.locale !== 'de')).toBe(true);
    expect(placed.plan.renders).toBe(placed.plan.groups.length);
    expect(placed.plan.groups.every(g => g.items.length > 0)).toBe(true);
  });

  it('sends the photos the buyer singled out to another campaign than the rest of the language', () => {
    const layout = setPhotoTarget(
      { locales: { en: null, de: null, it: 'it-rome' }, overrides: {} },
      ['p1', 'p2'], 'it', 'it-milan',
    );
    const placed = placePlan(planBatch(project), layout);
    expect(placed.destinations).toEqual({
      '01-a-it.mp4': 'it-rome', '02-b-it.mp4': 'it-milan', '03-c-it.mp4': 'it-milan',
    });
  });

  it('lets a singled-out photo stay home while its language goes out', () => {
    const layout = setPhotoTarget(
      { locales: { en: null, de: null, it: 'it-rome' }, overrides: {} }, ['p0'], 'it', null,
    );
    const placed = placePlan(planBatch(project), layout);
    expect(Object.keys(placed.destinations).sort()).toEqual(['02-b-it.mp4', '03-c-it.mp4']);
    expect(placed.skipped).toBe(7);
  });

  it('counts what the button will say the same way the plan comes out', () => {
    const layout = setPhotoTarget(
      { locales: { en: 'en-main', de: null, it: 'it-rome' }, overrides: {} }, ['p0'], 'it', null,
    );
    const placed = placePlan(planBatch(project), layout);
    expect(placementSize(project, layout)).toEqual({ total: placed.plan.total, skipped: placed.skipped });
    expect(placementSize(project, layout)).toEqual({ total: 5, skipped: 4 });
  });

  it('places nothing when no language has a campaign', () => {
    const placed = placePlan(planBatch(project), { locales: {}, overrides: {} });
    expect(placed.plan.total).toBe(0);
    expect(placed.plan.groups).toEqual([]);
  });
});

describe('the layout as the buyer edits it', () => {
  const base: ExportLayout = {
    locales: { it: 'it-rome' },
    overrides: { p0: { it: 'it-milan' } },
  };

  it('answers where one file goes: the photo first, then the language', () => {
    expect(destinationFor(base, 'p0', 'it')).toBe('it-milan');
    expect(destinationFor(base, 'p1', 'it')).toBe('it-rome');
    expect(destinationFor(base, 'p1', 'de')).toBeNull();
  });

  it('changes the language row without touching a photo the buyer placed by hand', () => {
    const next = setLocaleTarget(base, 'it', 'it-milan');
    expect(next.locales['it']).toBe('it-milan');
    expect(next.overrides).toEqual(base.overrides);
    expect(base.locales['it']).toBe('it-rome');
  });

  it('puts a photo back under its language when the override is withdrawn', () => {
    const next = setPhotoTarget(base, ['p0'], 'it', 'inherit');
    expect(destinationFor(next, 'p0', 'it')).toBe('it-rome');
    expect(next.overrides).toEqual({});
  });

  it('sums a row up: how many files go where', () => {
    const project = withLocales(batchOf('a.jpg', 'b.jpg', 'c.jpg'), 'it');
    expect(rowSummary(project, base, 'it')).toEqual([
      { campaign: 'it-rome', count: 2 },
      { campaign: 'it-milan', count: 1 },
    ]);
    const home = setPhotoTarget(base, ['p1'], 'it', null);
    expect(rowSummary(project, home, 'it')).toEqual([
      { campaign: 'it-rome', count: 1 },
      { campaign: 'it-milan', count: 1 },
      { campaign: null, count: 1 },
    ]);
  });

  it('keeps the rows the buyer set when a language joins or leaves the release', () => {
    const edited: ExportLayout = { locales: { it: 'it-milan', de: null }, overrides: { p0: { it: null } } };
    const fresh: ExportLayout = { locales: { it: 'it-rome', de: 'de-main', pl: null }, overrides: {} };
    expect(mergeLayout(edited, fresh, ['it', 'pl'])).toEqual({
      locales: { it: 'it-milan', pl: null },
      overrides: { p0: { it: null } },
    });
  });

  it('says what the selection agrees on, for the photo select to show', () => {
    expect(selectionTarget(base, ['p0'], 'it')).toBe('it-milan');
    expect(selectionTarget(base, ['p1', 'p2'], 'it')).toBe('inherit');
    expect(selectionTarget(base, ['p0', 'p1'], 'it')).toBe('mixed');
    expect(selectionTarget(setPhotoTarget(base, ['p1'], 'it', null), ['p1'], 'it')).toBeNull();
    expect(selectionTarget(base, [], 'it')).toBe('inherit');
  });

  it('only counts the selected photos, which are what the export takes', () => {
    const project = apply(withLocales(batchOf('a.jpg', 'b.jpg', 'c.jpg'), 'it'), {
      type: 'photo/activate', id: 'p1',
    });
    expect(rowSummary(project, base, 'it')).toEqual([{ campaign: 'it-rome', count: 1 }]);
  });
});

describe('campaign folders', () => {
  it('reads the language and country off a manifest without judging the rest of it', () => {
    expect(campaignSummary('language: it\ncountry: IT\ntheme: "REPLACE"\n')).toEqual({ language: 'it', country: 'IT' });
    expect(campaignSummary('termgroup: x\n')).toEqual({ language: null, country: null });
    expect(campaignSummary('not: [valid')).toEqual({ language: null, country: null });
  });

  it('names the folder the files land in', () => {
    expect(creativesFolder('it-rome')).toBe(`campaigns/it-rome/${CREATIVES_DIR}`);
  });
});
