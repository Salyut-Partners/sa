import { describe, expect, it } from 'vitest';
import { apply, createProject, defaultButton } from './project.ts';
import { buildSpec } from './spec.ts';
import type { Project } from './types.ts';

function projectWithButton(): Project {
  let p = apply(createProject(), {
    type: 'photo/add', photos: [{ id: 'a', name: 'a.jpg', image: 'data:image/jpeg;base64,zz', canvas: { width: 1080, height: 1920 } }],
  });
  p = apply(p, { type: 'photo/patch', ids: ['a'], patch: { accent: '#123456', pushIn: false } });
  return apply(p, {
    type: 'button/add',
    ids: ['a'],
    index: 0,
    button: {
      ...defaultButton('b1', 'glow', 0, '#123456'),
      rect: { x: 10, y: 50, w: 50, h: 10 },
      text: 'КУПИТИ',
    },
  });
}

describe('buildSpec', () => {
  it('carries the photo and the project-wide settings', () => {
    const spec = buildSpec(projectWithButton(), 'a')!;
    expect(spec.image).toBe('data:image/jpeg;base64,zz');
    expect(spec.canvas).toEqual({ width: 1080, height: 1920 });
    expect(spec.duration).toBe(10);
    expect(spec.fps).toBe(30);
    expect(spec.pushIn).toBe(false);
    expect(spec.glare).toBe(true);
  });

  it('resolves button geometry to pixels against the project canvas', () => {
    const spec = buildSpec(projectWithButton(), 'a')!;
    expect(spec.buttons[0]!.rect).toEqual({ x: 108, y: 960, w: 540, h: 192 });
  });

  it("renders at the photo's own frame, not the project's", () => {
    const p = apply(projectWithButton(), {
      type: 'photo/replace', id: 'a', name: 'square.jpg', image: 'data:,sq',
      canvas: { width: 1080, height: 1080 },
    });
    const spec = buildSpec(p, 'a')!;
    expect(spec.canvas).toEqual({ width: 1080, height: 1080 });
    // Same percent, resolved against the square frame.
    expect(spec.buttons[0]!.rect).toEqual({ x: 108, y: 540, w: 540, h: 108 });
  });

  it('carries the text, colour, font and timing of each button', () => {
    const button = buildSpec(projectWithButton(), 'a')!.buttons[0]!;
    expect(button.text).toBe('КУПИТИ');
    expect(button.color).toBe('#123456');
    expect(button.fontId).toBe('anton');
    expect(button.timing).toEqual({ appearAt: 0, hideAt: null, enter: 'fade', enterDuration: 0.4 });
  });

  it('keeps buttons in their slot order', () => {
    let p = projectWithButton();
    p = apply(p, {
      type: 'button/add', ids: ['a'], index: 1,
      button: { ...defaultButton('b2', 'glow', 1, '#123456'), text: 'ДРУГА' },
    });
    expect(buildSpec(p, 'a')!.buttons.map(b => b.text)).toEqual(['КУПИТИ', 'ДРУГА']);
  });

  it('returns nothing for a photo that is not in the project', () => {
    expect(buildSpec(projectWithButton(), 'ghost')).toBeNull();
  });

  it('shares no state with the project it was built from', () => {
    const project = projectWithButton();
    const spec = buildSpec(project, 'a')!;
    spec.buttons[0]!.text = 'ПІДМІНЕНО';
    spec.buttons[0]!.rect.x = 999;
    expect(project.photos[0]!.buttons[0]!.text).toBe('КУПИТИ');
    expect(project.photos[0]!.buttons[0]!.rect.x).toBe(10);
  });
});

describe('buildSpec and the template', () => {
  const withTemplate = (id: string): Project =>
    apply(projectWithButton(), { type: 'template/set', ids: ['a'], definitionId: id });

  it('carries no template for a photo that wears none', () => {
    expect(buildSpec(projectWithButton(), 'a')!.template).toBeNull();
  });

  it('carries the chosen template, its window and the photo accent', () => {
    const template = buildSpec(withTemplate('rates'), 'a')!.template!;
    expect(template.definitionId).toBe('rates');
    expect(template.color).toBe('#123456');
    expect(template.timing.appearAt).toBe(0);
  });

  it('fills every field of the schema from the dictionary', () => {
    const { fields } = buildSpec(withTemplate('rates'), 'a')!.template!;
    expect(fields['ratesHead']).toBe('Find this');
    expect(fields['rates']).toEqual(['£200 – 300', '£450 – 700', '£800 – 1,100']);
  });

  it('puts what the user typed over what the dictionary says', () => {
    const p = apply(withTemplate('rates'), {
      type: 'locale/field', id: 'en', key: 'ratesHead', value: 'Знайди свою',
    });
    expect(buildSpec(p, 'a')!.template!.fields['ratesHead']).toBe('Знайди свою');
  });

  it('builds in the language it is asked for', () => {
    const p = apply(withTemplate('rates'), { type: 'locale/add', id: 'de' });
    expect(buildSpec(p, 'a', 'de')!.template!.fields['ratesHead']).toBe('Finde diesen');
  });

  it('leaves one language edit out of another', () => {
    let p = apply(withTemplate('rates'), { type: 'locale/add', id: 'de' });
    p = apply(p, { type: 'locale/field', id: 'de', key: 'ratesHead', value: 'Von Hand' });
    expect(buildSpec(p, 'a', 'de')!.template!.fields['ratesHead']).toBe('Von Hand');
    expect(buildSpec(p, 'a', 'en')!.template!.fields['ratesHead']).toBe('Find this');
  });

  it('falls back to the dictionary for a language the project does not carry', () => {
    // A stale id in a saved file, or a chip asking for a language nobody added:
    // a frame in plain Italian beats a frame of blanks.
    const spec = buildSpec(withTemplate('rates'), 'a', 'it')!;
    expect(spec.locale).toBe('it');
    expect(spec.template!.fields['ratesHead']).toBe('Trova questo');
  });

  it('carries only the fields of the template on the photo now', () => {
    // A value left behind by the template the photo used to wear stays on the
    // locale, so swapping back restores it — but it is not this template's field
    // and the renderer must never see it.
    let p = apply(withTemplate('jobs-card-pills'), {
      type: 'locale/field', id: 'en', key: 'disclaimer', value: 'дрібний шрифт',
    });
    p = apply(p, { type: 'template/set', ids: ['a'], definitionId: 'rates' });

    const { fields } = buildSpec(p, 'a')!.template!;
    expect(Object.keys(fields).sort()).toEqual(['linkLine', 'rates', 'ratesAccent', 'ratesHead']);
    expect(buildSpec(apply(p, {
      type: 'template/set', ids: ['a'], definitionId: 'jobs-card-pills',
    }), 'a')!.template!.fields['disclaimer']).toBe('дрібний шрифт');
  });

  it('drops a template this build no longer carries rather than failing to build', () => {
    const p = withTemplate('rates');
    const broken: Project = {
      ...p,
      photos: p.photos.map(photo => ({
        ...photo,
        template: { ...photo.template!, definitionId: 'retired-template' },
      })),
    };
    expect(buildSpec(broken, 'a')!.template).toBeNull();
  });

  it('shares no state with the project it was built from', () => {
    const project = withTemplate('rates');
    const spec = buildSpec(project, 'a')!;
    spec.template!.timing.appearAt = 99;
    expect(project.photos[0]!.template!.timing.appearAt).toBe(0);
  });
});

describe('buildSpec and the sound', () => {
  const spoken = (): Project => {
    let p = apply(projectWithButton(), { type: 'locale/patch', id: 'en', patch: { script: '  Hello.  ' } });
    p = apply(p, { type: 'locale/add', id: 'de' });
    return apply(p, { type: 'project/patch', patch: { voiceId: 'george', modelId: 'flash' } });
  };

  it('carries the script of the language it was built in', () => {
    expect(buildSpec(spoken(), 'a', 'en')!.script).toBe('Hello.');
    expect(buildSpec(spoken(), 'a', 'de')!.script).toBe('');
  });

  it('carries the project voice and model', () => {
    const spec = buildSpec(spoken(), 'a', 'de')!;
    expect(spec.voiceId).toBe('george');
    expect(spec.modelId).toBe('flash');
  });

  it('speaks every language in the one project voice', () => {
    expect(buildSpec(spoken(), 'a', 'de')!.voiceId).toBe('george');
    expect(buildSpec(spoken(), 'a', 'en')!.voiceId).toBe('george');
  });

  it('builds in the language on screen when it is not told which', () => {
    const p = apply(spoken(), { type: 'locale/activate', id: 'de' });
    expect(buildSpec(p, 'a')!.locale).toBe('de');
  });

  it('gives a language the project does not carry no voice-over at all', () => {
    // Reachable from a stale id in a saved file. Borrowing the script of the
    // language on screen would ship an Italian video speaking English.
    const spec = buildSpec(spoken(), 'a', 'it')!;
    expect(spec.locale).toBe('it');
    expect(spec.script).toBe('');
    expect(spec.voiceId).toBe('george');
  });
});
