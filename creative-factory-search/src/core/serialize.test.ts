import { describe, expect, it } from 'vitest';
import { newLocale } from './locales.ts';
import { apply, createProject, defaultButton, MAX_PHOTOS } from './project.ts';
import { fromFile, SCHEMA_VERSION, toFile } from './serialize.ts';
import { DEFAULT_MODEL_ID } from './voice.ts';
import type { Locale, Project } from './types.ts';

function sample(): Project {
  let p = apply(createProject(), {
    type: 'photo/add',
    photos: [
      { id: 'a', name: 'a.jpg', image: 'data:image/jpeg;base64,aa', canvas: { width: 1080, height: 1920 } },
      { id: 'b', name: 'b.jpg', image: 'data:image/jpeg;base64,bb', canvas: { width: 1080, height: 1920 } },
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
      type: 'photo/add', photos: [{ id: 'a', name: 'a.jpg', image: 'data:,a', canvas: { width: 1080, height: 1920 } }],
    });
    p = apply(p, { type: 'template/set', ids: ['a'], definitionId: 'jobs-card-panel' });
    p = apply(p, { type: 'locale/field', id: 'en', key: 'headline', value: 'Робота' });
    p = apply(p, { type: 'locale/field', id: 'en', key: 'jobs', value: ['Охорона', 'Кухня'] });
    return apply(p, { type: 'template/patch', ids: ['a'], patch: { timing: { appearAt: 1.5 } } });
  };

  it('comes back with the template, the edits and the window intact', () => {
    const result = fromFile(JSON.parse(JSON.stringify(toFile(saved()))));
    expect(result.ok).toBe(true);
    const project = (result as { project: Project }).project;
    const layer = project.photos[0]!.template!;
    expect(layer.definitionId).toBe('jobs-card-panel');
    expect(layer.timing.appearAt).toBe(1.5);
    expect(project.locales[0]!.overrides)
      .toEqual({ headline: 'Робота', jobs: ['Охорона', 'Кухня'] });
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

  it('opens a version 4 file, whose layouts sat where they drew themselves', () => {
    // Written before a layout could be slid up the frame. The field it is
    // missing has one right answer, and normalising it on the way in is what
    // lets the rest of the app assume every template carries one.
    const file = toFile(saved()) as unknown as Record<string, unknown>;
    const older = {
      ...file,
      version: 4,
      photos: (file['photos'] as Record<string, unknown>[]).map(p => {
        const template = p['template'] as Record<string, unknown> | null;
        if (template === null) return p;
        const { offsetY: _dropped, ...rest } = template;
        return { ...p, template: rest };
      }),
    };
    const result = fromFile(older);
    expect(result.ok).toBe(true);
    expect((result as { project: Project }).project.photos[0]!.template).toMatchObject({ offsetX: 0, offsetY: 0 });
  });

  it('keeps a layout slid up and down where it was, and adds no sideways move', () => {
    // Written when a layout could only be lifted: `offsetY` alone. The lift is
    // the same figure in the same unit now, so the creative opens unchanged.
    const file = toFile(saved()) as unknown as Record<string, unknown>;
    const lifted = {
      ...file,
      photos: (file['photos'] as Record<string, unknown>[]).map(p => {
        const template = p['template'] as Record<string, unknown> | null;
        if (template === null) return p;
        const { offsetX: _dropped, ...rest } = template;
        return { ...p, template: { ...rest, offsetY: -18 } };
      }),
    };
    const result = fromFile(lifted);
    expect(result.ok).toBe(true);
    expect((result as { project: Project }).project.photos[0]!.template).toMatchObject({ offsetX: 0, offsetY: -18 });
  });

  it('comes back with the overlay drawn over the template', () => {
    const p = apply(saved(), { type: 'template/set', ids: ['a'], definitionId: 'news-tv', slot: 'overlay' });
    const result = fromFile(JSON.parse(JSON.stringify(toFile(p))));
    expect(result.ok).toBe(true);
    const photo = (result as { project: Project }).project.photos[0]!;
    expect(photo.template!.definitionId).toBe('jobs-card-panel');
    expect(photo.overlay!.definitionId).toBe('news-tv');
  });

  it('opens a file written before overlays existed, with none on the photos', () => {
    const file = toFile(saved()) as unknown as Record<string, unknown>;
    const photos = (file['photos'] as Record<string, unknown>[]).map(({ overlay: _gone, ...rest }) => rest);
    const result = fromFile({ ...file, photos });
    expect(result.ok).toBe(true);
    expect((result as { project: Project }).project.photos[0]!.overlay).toBeNull();
  });

  it('refuses a file whose overlay is not a layout', () => {
    const file = toFile(saved()) as unknown as Record<string, unknown>;
    const photos = (file['photos'] as Record<string, unknown>[])
      .map(p => ({ ...p, overlay: { definitionId: 7 } }));
    expect(fromFile({ ...file, photos })).toEqual({ ok: false, reason: 'not-a-project' });
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

  it('opens a file saved while photos carried catalogue objects, and drops them', () => {
    // The editor once placed objects from a catalogue on a photo, under a
    // `props` field. The layer is gone; a batch saved with it still opens, and
    // is saved back without it rather than carrying a field nothing reads.
    const file = toFile(saved()) as unknown as Record<string, unknown>;
    const older = {
      ...file,
      photos: (file['photos'] as Record<string, unknown>[]).map(p => ({
        ...p,
        props: [{
          id: 'x', propId: 'iron', rect: { x: 55, y: 26, w: 36, h: 34 }, colors: ['#ff0000'],
          timing: { appearAt: 0.35, hideAt: null, enter: 'pop', enterDuration: 0.5 },
        }],
      })),
    };
    const result = fromFile(older);
    expect(result.ok).toBe(true);
    const project = (result as { project: Project }).project;
    expect(project.photos[0]).not.toHaveProperty('props');
    expect(project.photos[0]!.template!.definitionId).toBe('jobs-card-panel');
    expect(toFile(project).photos[0]).not.toHaveProperty('props');
  });
});

describe('a project file carrying languages', () => {
  const saved = (): Project => {
    let p = apply(createProject(), {
      type: 'photo/add', photos: [{ id: 'a', name: 'a.jpg', image: 'data:,a', canvas: { width: 1080, height: 1920 } }],
    });
    p = apply(p, { type: 'locale/add', id: 'de' });
    p = apply(p, { type: 'locale/patch', id: 'de', patch: { script: 'Hallo.' } });
    p = apply(p, { type: 'locale/patch', id: 'en', patch: { include: false } });
    p = apply(p, { type: 'locale/field', id: 'de', key: 'cta', value: 'JETZT' });
    return apply(p, {
      type: 'project/patch', patch: { voiceId: 'george', modelId: 'flash', fitToVoice: false },
    });
  };

  const reopened = (file: unknown): Project => {
    const result = fromFile(JSON.parse(JSON.stringify(file)));
    expect(result.ok).toBe(true);
    return (result as { project: Project }).project;
  };

  it('comes back with every language, its script and its edits', () => {
    const project = reopened(toFile(saved()));
    expect(project.locales.map(l => l.id)).toEqual(['en', 'de']);
    expect(project.locales[1]).toEqual({
      id: 'de', script: 'Hallo.', include: true, subtitles: true, overrides: { cta: 'JETZT' },
    });
    expect(project.locales[0]!.include).toBe(false);
  });

  it('drops a language\'s own voice from an older file, and speaks it in the project\'s', () => {
    const file = toFile(saved()) as unknown as { locales: Record<string, unknown>[] };
    file.locales[1]!['voiceId'] = 'lily';
    const project = reopened(file);
    expect(project.locales[1]).not.toHaveProperty('voiceId');
    expect(project.voiceId).toBe('george');
  });

  it('still writes an empty voice on every language, which an older editor needs to open it', () => {
    expect(toFile(saved()).locales.map(l => l.voiceId)).toEqual([null, null]);
  });

  it('comes back knowing which script was translated from what, and reads a malformed mark as written by hand', () => {
    const file = toFile(saved()) as unknown as { locales: Record<string, unknown>[] };
    file.locales[1]!['translatedFrom'] = { id: 'en', script: 'Hi.' };
    expect(reopened(file).locales[1]!.translatedFrom).toEqual({ id: 'en', script: 'Hi.' });
    file.locales[1]!['translatedFrom'] = { id: 'xx', script: 3 };
    expect(reopened(file).locales[1]!.translatedFrom).toBeUndefined();
  });

  it('comes back with the project voice, model and whether it stretches', () => {
    const project = reopened(toFile(saved()));
    expect(project.voiceId).toBe('george');
    expect(project.modelId).toBe('flash');
    expect(project.fitToVoice).toBe(false);
  });

  it('opens on the first language it carries, whichever one was on screen', () => {
    // Where the cursor was is not what was made — the same reason selection is
    // left out of the file.
    expect(reopened(toFile(saved())).activeLocale).toBe('en');
  });

  it('shares nothing with the project it was written from', () => {
    const project = saved();
    const file = toFile(project);
    file.locales[0]!.script = 'підмінено';
    expect(project.locales[0]!.script).toBe('');
  });

  it('drops a language this build has never heard of rather than refusing the file', () => {
    const file = toFile(saved()) as unknown as Record<string, unknown>;
    const locales = [...(file['locales'] as unknown[]), { ...newLocale('en'), id: 'kl' }];
    expect(reopened({ ...file, locales }).locales.map(l => l.id)).toEqual(['en', 'de']);
  });

  it('keeps one record per language', () => {
    const file = toFile(saved()) as unknown as Record<string, unknown>;
    const locales = file['locales'] as Locale[];
    expect(reopened({ ...file, locales: [...locales, locales[0]] }).locales.map(l => l.id))
      .toEqual(['en', 'de']);
  });
});

describe('opening a project written before languages existed', () => {
  /** A version 2 file: field edits sat on each photo's template, in the one language. */
  const v2 = (values: Record<string, unknown>, second?: Record<string, unknown>) => ({
    version: 2,
    canvas: { width: 1080, height: 1920 },
    fps: 30,
    duration: 10,
    photos: [
      photoFile('a', values),
      ...(second === undefined ? [] : [photoFile('b', second)]),
    ],
  });

  const photoFile = (id: string, values: Record<string, unknown>) => ({
    id, name: id + '.jpg', image: 'data:,' + id, accent: '#1fa94b', pushIn: true, glare: true,
    buttons: [],
    template: {
      definitionId: 'rates',
      values,
      timing: { appearAt: 0, hideAt: null, enter: 'none', enterDuration: 0.6 },
    },
  });

  const opened = (file: unknown): Project => {
    const result = fromFile(file);
    expect(result.ok).toBe(true);
    return (result as { project: Project }).project;
  };

  it('gives it the one language it was written in', () => {
    const project = opened(v2({}));
    expect(project.locales.map(l => l.id)).toEqual(['en']);
    expect(project.activeLocale).toBe('en');
  });

  it('carries the wording its owner typed over into that language', () => {
    // Dropping it would mean a batch opens having quietly forgotten its offer.
    expect(opened(v2({ ratesHead: 'Знайди свою', rates: ['200 €'] })).locales[0]!.overrides)
      .toEqual({ ratesHead: 'Знайди свою', rates: ['200 €'] });
  });

  it('takes the first photo of the grid where two disagreed', () => {
    const project = opened(v2({ ratesHead: 'Перше' }, { ratesHead: 'Друге' }));
    expect(project.locales[0]!.overrides['ratesHead']).toBe('Перше');
  });

  it('leaves the template on the photo, having taken only the words off it', () => {
    const layer = opened(v2({ ratesHead: 'x' })).photos[0]!.template!;
    expect(layer.definitionId).toBe('rates');
    expect('values' in layer).toBe(false);
  });

  it('defaults the sound it was written without', () => {
    const project = opened(v2({}));
    expect(project.voiceId).toBe('');
    expect(project.modelId).toBe(DEFAULT_MODEL_ID);
    expect(project.fitToVoice).toBe(true);
  });
});

describe('a project file carrying subtitles', () => {
  const styled = (): Project => {
    let p = apply(sample(), { type: 'locale/add', id: 'de' });
    p = apply(p, { type: 'project/patch', patch: { subtitles: 'yellow' } });
    return apply(p, { type: 'locale/patch', id: 'de', patch: { subtitles: false } });
  };

  it('keeps the style and the language switched off', () => {
    const back = reopen(styled());
    expect(back.subtitles).toBe('yellow');
    expect(back.locales.find(l => l.id === 'en')!.subtitles).toBe(true);
    expect(back.locales.find(l => l.id === 'de')!.subtitles).toBe(false);
  });

  it('opens a file written before subtitles existed, with none and every language on', () => {
    const file = toFile(styled()) as unknown as Record<string, unknown>;
    const older: Record<string, unknown> = {
      ...file,
      locales: (file['locales'] as Record<string, unknown>[]).map(({ subtitles: _, ...rest }) => rest),
    };
    delete older['subtitles'];
    const result = fromFile(older);
    expect(result.ok).toBe(true);
    const project = (result as { project: Project }).project;
    expect(project.subtitles).toBeNull();
    expect(project.locales.every(l => l.subtitles === true)).toBe(true);
  });

  it('writes the field under the schema version the older editor still reads', () => {
    expect(toFile(styled()).version).toBe(SCHEMA_VERSION);
    expect(toFile(styled()).subtitles).toBe('yellow');
  });
});
