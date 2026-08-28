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

describe('a project file carrying templates', () => {
  const saved = (): Project => {
    let p = apply(createProject(), {
      type: 'photo/add', photos: [{ id: 'a', name: 'a.jpg', image: 'data:,a' }],
    });
    p = apply(p, { type: 'template/set', ids: ['a'], definitionId: 'jobs-card-panel' });
    p = apply(p, { type: 'template/field', ids: ['a'], key: 'headline', value: 'Робота' });
    p = apply(p, { type: 'template/field', ids: ['a'], key: 'jobs', value: ['Охорона', 'Кухня'] });
    return apply(p, { type: 'template/patch', ids: ['a'], patch: { timing: { appearAt: 1.5 } } });
  };

  it('comes back with the template, the edits and the window intact', () => {
    const result = fromFile(JSON.parse(JSON.stringify(toFile(saved()))));
    expect(result.ok).toBe(true);
    const layer = (result as { project: Project }).project.photos[0]!.template!;
    expect(layer.definitionId).toBe('jobs-card-panel');
    expect(layer.values).toEqual({ headline: 'Робота', jobs: ['Охорона', 'Кухня'] });
    expect(layer.timing.appearAt).toBe(1.5);
  });

  it('opens a file written before templates existed, with none on the photos', () => {
    // Refusing it would mean a project made yesterday cannot be opened today,
    // and the missing half is a template nobody had chosen anyway.
    const file = toFile(saved()) as unknown as Record<string, unknown>;
    const older = {
      ...file,
      version: 1,
      photos: (file['photos'] as Record<string, unknown>[]).map(({ template, ...rest }) => rest),
    };
    const result = fromFile(older);
    expect(result.ok).toBe(true);
    expect((result as { project: Project }).project.photos[0]!.template).toBeNull();
  });

  it('refuses a file whose template is not one', () => {
    const file = toFile(saved()) as unknown as Record<string, unknown>;
    const photos = (file['photos'] as Record<string, unknown>[])
      .map(p => ({ ...p, template: { definitionId: 7 } }));
    expect(fromFile({ ...file, photos })).toEqual({ ok: false, reason: 'not-a-project' });
  });

  it('refuses a file from a schema this build has never seen', () => {
    expect(fromFile({ ...toFile(saved()), version: 99 })).toEqual({ ok: false, reason: 'version' });
  });
});
