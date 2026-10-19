import { describe, expect, it } from 'vitest';
import { archiveName, batchNames, burnCount, groupDuration, keepItems, planBatch, planOne, subtitleCount, VOICE_TAIL } from './batch.ts';
import { apply, createProject, defaultButton } from './project.ts';
import type { LocaleId, Project } from './types.ts';

const photos = (...names: string[]) =>
  names.map((name, i) => ({ id: 'p' + i, name, image: 'data:image/jpeg;base64,' + i, canvas: { width: 1080, height: 1920 } }));

function batchOf(...names: string[]): Project {
  const project = apply(createProject(), { type: 'photo/add', photos: photos(...names) });
  return apply(project, { type: 'selection/all' });
}

const withLocales = (project: Project, ...ids: LocaleId[]): Project =>
  ids.reduce((p, id) => apply(p, { type: 'locale/add', id }), project);

const script = (project: Project, id: LocaleId, text: string): Project =>
  apply(project, { type: 'locale/patch', id, patch: { script: text } });

describe('planBatch', () => {
  it('lays the selected photos out against every language going out', () => {
    const plan = planBatch(withLocales(batchOf('a.jpg', 'b.jpg'), 'de'));
    expect(plan.total).toBe(4);
    expect(plan.groups.flatMap(g => g.items).map(i => `${i.photoId}/${i.locale}`).sort())
      .toEqual(['p0/de', 'p0/en', 'p1/de', 'p1/en']);
  });

  it('leaves out a photo nobody selected', () => {
    const project = apply(batchOf('a.jpg', 'b.jpg'), { type: 'photo/activate', id: 'p1' });
    expect(planBatch(project).groups.flatMap(g => g.items).map(i => i.photoId)).toEqual(['p1']);
  });

  it('leaves out a language the user has taken off the release', () => {
    const project = apply(withLocales(batchOf('a.jpg'), 'de'), {
      type: 'locale/patch', id: 'de', patch: { include: false },
    });
    expect(planBatch(project).groups.flatMap(g => g.items).map(i => i.locale)).toEqual(['en']);
  });

  it('plans nothing when there is nothing selected or nothing to release', () => {
    expect(planBatch(createProject()).total).toBe(0);
    const noLanguage = apply(batchOf('a.jpg'), {
      type: 'locale/patch', id: 'en', patch: { include: false },
    });
    expect(planBatch(noLanguage).total).toBe(0);
    expect(planBatch(noLanguage).groups).toEqual([]);
  });

  it('numbers by grid position, not by position in the selection', () => {
    // Otherwise the same creative gets a different name depending on how many
    // photos happen to be selected, and two exports of one job disagree.
    const project = apply(batchOf('a.jpg', 'b.jpg', 'c.jpg'), {
      type: 'photo/activate', id: 'p2',
    });
    expect(planBatch(project).groups.flatMap(g => g.items).map(i => i.name))
      .toEqual(['03-c-en.mp4']);
    expect(planOne(project, 'p2').groups[0]!.items[0]!.name).toBe('03-c-en.mp4');
  });
});

describe('planBatch and the shared video', () => {
  /** Two languages over a creative with no template: one picture, two soundtracks. */
  const twoSilentLanguages = (): Project =>
    script(script(withLocales(batchOf('a.jpg'), 'de'), 'en', 'Hello'), 'de', 'Hallo');

  it('puts videos that look the same into one group', () => {
    const plan = planBatch(twoSilentLanguages());
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]!.items.map(i => i.locale)).toEqual(['en', 'de']);
  });

  it('counts the frame walks it saved', () => {
    const plan = planBatch(twoSilentLanguages());
    expect(plan.total).toBe(2);
    expect(plan.renders).toBe(1);
  });

  it('renders the group once and mixes the rest onto it', () => {
    const group = planBatch(twoSilentLanguages()).groups[0]!;
    // The spec whose frames get walked is the group's, and every item in the
    // group takes the result — which is only sound to say because the key hashes
    // exactly what reaches the frame.
    expect(group.spec.locale).toBe('en');
    // Each item keeps its own language's words. The group carries the picture
    // and nothing else, so a soundtrack landing on the wrong file is the one way
    // this grouping could go wrong quietly.
    expect(group.items.map(i => `${i.locale}: ${i.sound.script}`))
      .toEqual(['en: Hello', 'de: Hallo']);
  });

  it('splits languages whose words reach the frame', () => {
    // A template says something different in every language, so every language
    // is its own video and there is nothing to share.
    const project = apply(twoSilentLanguages(), {
      type: 'template/set', ids: ['p0'], definitionId: 'rates',
    });
    const plan = planBatch(project);
    expect(plan.groups).toHaveLength(2);
    expect(plan.renders).toBe(2);
  });

  it('keeps two photos apart however alike everything over them is', () => {
    const plan = planBatch(batchOf('a.jpg', 'b.jpg'));
    expect(plan.groups).toHaveLength(2);
  });

  it('groups two photos that really are the same picture', () => {
    const same = [
      { id: 'p0', name: 'a.jpg', image: 'data:image/jpeg;base64,x', canvas: { width: 1080, height: 1920 } },
      { id: 'p1', name: 'b.jpg', image: 'data:image/jpeg;base64,x', canvas: { width: 1080, height: 1920 } },
    ];
    let project = apply(createProject(), { type: 'photo/add', photos: same });
    project = apply(project, { type: 'selection/all' });
    const plan = planBatch(project);
    expect(plan.total).toBe(2);
    expect(plan.renders).toBe(1);
    // Two files out of one walk: the batch still gets both names.
    expect(plan.groups[0]!.items.map(i => i.name)).toEqual(['01-a-en.mp4', '02-b-en.mp4']);
  });

  it('carries the photo once per group, not once per file', () => {
    // Otherwise a batch of 12 photos in 7 languages posts 84 copies of the same
    // pictures — tens of megabytes of request body for a dozen images.
    const onWire = (project: Project) =>
      JSON.stringify(planBatch(project).groups).split('data:image/jpeg;base64,').length - 1;
    // Two languages over one picture: two files, one image on the wire.
    expect(onWire(twoSilentLanguages())).toBe(1);
    // And it stays one per group, not one per group plus one per file: two
    // pictures in two languages is four files and still only two images.
    const four = script(withLocales(batchOf('a.jpg', 'b.jpg'), 'de'), 'de', 'Hallo');
    expect(planBatch(four).total).toBe(4);
    expect(onWire(four)).toBe(2);
  });

  it('splits a difference the user made on one photo only', () => {
    let project = batchOf('a.jpg', 'a.jpg');
    project = apply(project, {
      type: 'button/add', ids: ['p0', 'p1'], index: 0,
      button: defaultButton('b1', 'glow', 0, '#1fa94b'),
    });
    expect(planBatch(project).renders).toBe(2);
    // Same image would have grouped them; different images did not.
    const changed = apply(project, {
      type: 'button/patch', ids: ['p0'], index: 0, patch: { text: 'ІНШЕ' },
    });
    expect(planBatch(changed).renders).toBe(2);
  });
});

describe('planOne', () => {
  it('plans the one creative in the language on screen', () => {
    let project = withLocales(batchOf('a.jpg', 'b.jpg'), 'de');
    project = apply(project, { type: 'locale/activate', id: 'de' });
    const plan = planOne(project, 'p1');
    expect(plan.total).toBe(1);
    expect(plan.groups[0]!.items[0]).toMatchObject({ photoId: 'p1', locale: 'de' });
  });

  it('names it by its place in the batch, as the archive would', () => {
    expect(planOne(batchOf('a.jpg', 'b.jpg'), 'p1').groups[0]!.items[0]!.name)
      .toBe('02-b-en.mp4');
  });

  it('goes through the same plan a release does, so there is one render path', () => {
    // One photo in one language is a release of one, and this says so exactly:
    // the same groups, the same names, the same sound reaching the same queue.
    const project = batchOf('a.jpg');
    expect(planOne(project, 'p0')).toEqual(planBatch(project));
  });

  it('ignores a language taken off the release — this is not the release', () => {
    const project = apply(batchOf('a.jpg'), {
      type: 'locale/patch', id: 'en', patch: { include: false },
    });
    expect(planOne(project, 'p0').total).toBe(1);
  });

  it('plans nothing for a photo the project does not have', () => {
    expect(planOne(batchOf('a.jpg'), 'ghost')).toEqual({ groups: [], total: 0, renders: 0 });
  });
});

describe('archiveName', () => {
  it('names a file by its photo and its language', () => {
    expect(archiveName(0, 'airport.jpg', 'de')).toBe('01-airport-de.mp4');
  });

  it('numbers by grid position, so the archive sorts the way the batch reads', () => {
    expect(archiveName(9, 'x.jpg', 'en')).toBe('10-x-en.mp4');
  });

  it('keeps the name a file system will take', () => {
    expect(archiveName(0, 'фото 1 (копія).jpeg', 'pl')).toBe('01-фото_1_копія-pl.mp4');
  });

  it('falls back rather than producing a file with no name', () => {
    expect(archiveName(0, '///.png', 'en')).toBe('01-creative-en.mp4');
  });
});

describe('groupDuration', () => {
  it('takes the longest voice-over in the group, plus a tail', () => {
    expect(groupDuration(10, [8, 12.5, 9], true)).toBe(12.5 + VOICE_TAIL);
  });

  it('never shortens the video below what the user set', () => {
    expect(groupDuration(10, [4], true)).toBe(10);
  });

  it('holds the length the user set when they asked it to', () => {
    // A platform with a hard slot length: the voice is cut, not the video
    // stretched, and that is the user's call to make.
    expect(groupDuration(10, [20], false)).toBe(10);
  });

  it('leaves a group with nothing to say at the set length', () => {
    expect(groupDuration(10, [], true)).toBe(10);
  });
});

describe('subtitles in the plan', () => {
  const styled = (): Project => {
    let p = withLocales(batchOf('a.jpg', 'b.jpg'), 'de', 'it');
    p = script(script(script(p, 'en', 'one'), 'de', 'eins'), 'it', 'uno');
    p = apply(p, { type: 'project/patch', patch: { subtitles: 'yellow' } });
    return apply(p, { type: 'locale/patch', id: 'de', patch: { subtitles: false } });
  };

  it('marks every file of a language left on with the style, and a language switched off with none', () => {
    const items = planBatch(styled()).groups.flatMap(g => g.items);
    expect(items.filter(i => i.locale !== 'de').every(i => i.subtitles === 'yellow')).toBe(true);
    expect(items.filter(i => i.locale === 'de').every(i => i.subtitles === null)).toBe(true);
    expect(burnCount(planBatch(styled()))).toBe(4);
  });

  it('marks nothing when the batch has no style', () => {
    const plain = apply(styled(), { type: 'project/patch', patch: { subtitles: null } });
    expect(planBatch(plain).groups.flatMap(g => g.items).every(i => i.subtitles === null)).toBe(true);
    expect(burnCount(planBatch(plain))).toBe(0);
  });

  it('does not cost a single extra frame walk', () => {
    const plain = apply(styled(), { type: 'project/patch', patch: { subtitles: null } });
    expect(planBatch(styled()).renders).toBe(planBatch(plain).renders);
    expect(planBatch(styled()).groups.map(g => g.key)).toEqual(planBatch(plain).groups.map(g => g.key));
  });
});

describe('batchNames', () => {
  it('names the files the plan makes, without planning them', () => {
    const project = withLocales(batchOf('a.jpg', 'b.jpg'), 'de');
    const planned = planBatch(project).groups.flatMap(g => g.items.map(i => i.name)).sort();
    expect(batchNames(project).map(n => n.name).sort()).toEqual(planned);
  });
});

describe('keepItems', () => {
  it('cuts a plan to the files named, dropping groups left empty', () => {
    const plan = planBatch(withLocales(batchOf('a.jpg', 'b.jpg'), 'de'));
    const one = plan.groups[0]!.items[0]!.name;
    const kept = keepItems(plan, new Set([one]));
    expect(kept.groups.flatMap(g => g.items.map(i => i.name))).toEqual([one]);
    expect([kept.total, kept.renders]).toEqual([1, 1]);
  });
});

describe('subtitleCount', () => {
  it('counts the files that will get subtitles the way the plan comes out', () => {
    const styled = apply(withLocales(batchOf('a.jpg', 'b.jpg'), 'de', 'it'), { type: 'project/patch', patch: { subtitles: 'yellow' } });
    const project = apply(styled, { type: 'locale/patch', id: 'de', patch: { subtitles: false } });
    const plan = planBatch(project);
    expect(subtitleCount(project)).toEqual({ burned: burnCount(plan), total: plan.total });
    expect(subtitleCount(project).burned).toBeLessThan(plan.total);
  });
});
