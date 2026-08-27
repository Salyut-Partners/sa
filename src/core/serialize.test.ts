import { describe, expect, it } from 'vitest';
import { apply, createProject, defaultButton, MAX_PHOTOS } from './project.ts';
import { fromFile, SCHEMA_VERSION, toFile } from './serialize.ts';
import type { Project } from './types.ts';

function sample(): Project {
  let p = apply(createProject(), {
    type: 'photo/add',
    photos: [
      { id: 'a', name: 'a.jpg', image: 'data:image/jpeg;base64,aa' },
      { id: 'b', name: 'b.jpg', image: 'data:image/jpeg;base64,bb' },
    ],
  });
  p = apply(p, { type: 'photo/patch', ids: ['a'], patch: { accent: '#ff0000' } });
  return apply(p, {
    type: 'button/add', ids: ['a'], index: 0, button: defaultButton('btn', 'glow', 0, '#ff0000'),
  });
}

const reopen = (project: Project): Project => {
  const result = fromFile(JSON.parse(JSON.stringify(toFile(project))));
  if (!result.ok) throw new Error('expected the file to load: ' + result.reason);
  return result.project;
};

describe('a saved project', () => {
  it('comes back with every creative intact', () => {
    const back = reopen(sample());
    expect(back.photos).toEqual(sample().photos);
  });

  it('comes back with the project-wide settings', () => {
    const p = apply(sample(), { type: 'project/patch', patch: { duration: 17, fps: 25 } });
    const back = reopen(p);
    expect(back.duration).toBe(17);
    expect(back.fps).toBe(25);
    expect(back.canvas).toEqual({ width: 1080, height: 1920 });
  });

  it('opens on the first photo rather than restoring who was selected', () => {
    const p = apply(sample(), { type: 'selection/all' });
    const back = reopen(p);
    expect(back.activeId).toBe('a');
    expect(back.selection).toEqual(['a']);
  });

  it('opens an empty project without an active photo', () => {
    const back = reopen(createProject());
    expect(back.photos).toEqual([]);
    expect(back.activeId).toBeNull();
  });

  it('carries the schema version, so a later format can tell itself apart', () => {
    expect(toFile(createProject()).version).toBe(SCHEMA_VERSION);
  });
});

describe('opening something else', () => {
  it('turns away a file from a newer format instead of half-reading it', () => {
    const file = { ...toFile(sample()), version: SCHEMA_VERSION + 1 };
    expect(fromFile(file)).toEqual({ ok: false, reason: 'version' });
  });

  it('turns away a file that is not a project at all', () => {
    expect(fromFile({ hello: 'world' }).ok).toBe(false);
    expect(fromFile(null).ok).toBe(false);
    expect(fromFile('a string').ok).toBe(false);
  });

  it('turns away a file holding more photos than the project can carry', () => {
    const one = toFile(sample()).photos[0]!;
    const file = {
      ...toFile(sample()),
      photos: Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => ({ ...one, id: 'p' + i })),
    };
    expect(fromFile(file)).toEqual({ ok: false, reason: 'too-many' });
  });

  it('turns away a project whose photos are malformed', () => {
    const file = { ...toFile(sample()), photos: [{ id: 'a' }] };
    expect(fromFile(file)).toEqual({ ok: false, reason: 'not-a-project' });
  });

  it('turns away a photo whose button is malformed', () => {
    const file = toFile(sample());
    const broken = structuredClone(file);
    broken.photos[0]!.buttons = [{ id: 'x' } as never];
    expect(fromFile(broken)).toEqual({ ok: false, reason: 'not-a-project' });
  });
});
