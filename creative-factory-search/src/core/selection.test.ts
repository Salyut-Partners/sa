import { describe, expect, it } from 'vitest';
import { apply, createProject, defaultButton } from './project.ts';
import {
  buttonCount, buttonField, buttonRectField, buttonTimingField, NO_TEMPLATE, photoField,
  shared, templateChoice, templateOffsetField, templateTimingField,
} from './selection.ts';
import type { Project } from './types.ts';

const photo = (id: string) => ({ id, name: id + '.jpg', image: 'data:,' + id, canvas: { width: 1080, height: 1920 } });

const withPhotos = (...ids: string[]): Project =>
  apply(createProject(), { type: 'photo/add', photos: ids.map(photo) });

const withButton = (project: Project, ids: string[]): Project =>
  apply(project, { type: 'button/add', ids, index: 0, button: defaultButton('b', 'glow', 0, '#1fa94b') });

describe('shared', () => {
  it('reports the value when everyone agrees', () => {
    expect(shared(['#fff', '#fff'])).toEqual({ mixed: false, value: '#fff' });
  });

  it('reports mixed as soon as one differs', () => {
    expect(shared(['#fff', '#000'])).toEqual({ mixed: true });
  });

  it('reads a single value as agreement', () => {
    expect(shared([true])).toEqual({ mixed: false, value: true });
  });

  it('has nothing to agree on when there are no values', () => {
    expect(shared([])).toEqual({ mixed: true });
  });
});

describe('photoField', () => {
  it('gives the common value across the selection', () => {
    const p = withPhotos('a', 'b');
    expect(photoField(p, ['a', 'b'], 'glare')).toEqual({ mixed: false, value: true });
  });

  it('goes mixed rather than showing one photo value as if it were all of them', () => {
    const p = apply(withPhotos('a', 'b'), {
      type: 'photo/patch', ids: ['a'], patch: { accent: '#ff0000' },
    });
    expect(photoField(p, ['a', 'b'], 'accent')).toEqual({ mixed: true });
  });

  it('is mixed when a selected id is not in the project at all', () => {
    expect(photoField(withPhotos('a'), ['a', 'ghost'], 'accent')).toEqual({ mixed: true });
  });
});

describe('buttonField', () => {
  it('reads the same slot across the selection', () => {
    const p = withButton(withPhotos('a', 'b'), ['a', 'b']);
    expect(buttonField(p, ['a', 'b'], 0, 'text')).toEqual({
      mixed: false,
      value: 'ДІЗНАТИСЬ БІЛЬШЕ',
    });
  });

  it('goes mixed when the same slot holds different text', () => {
    let p = withButton(withPhotos('a', 'b'), ['a', 'b']);
    p = apply(p, { type: 'button/patch', ids: ['a'], index: 0, patch: { text: 'ЗАМОВИТИ' } });
    expect(buttonField(p, ['a', 'b'], 0, 'text')).toEqual({ mixed: true });
  });

  it('goes mixed when one of the selected photos has no button in that slot', () => {
    const p = withButton(withPhotos('a', 'b'), ['a']);
    expect(buttonField(p, ['a', 'b'], 0, 'color')).toEqual({ mixed: true });
  });

  it('reads a slot nobody has as mixed rather than inventing a value', () => {
    expect(buttonField(withPhotos('a'), ['a'], 3, 'text')).toEqual({ mixed: true });
  });
});

describe('buttonCount', () => {
  it('agrees when the selected photos carry the same buttons', () => {
    const p = withButton(withPhotos('a', 'b'), ['a', 'b']);
    expect(buttonCount(p, ['a', 'b'])).toEqual({ mixed: false, value: 1 });
  });

  it('goes mixed when one photo has a button the others do not', () => {
    const p = withButton(withPhotos('a', 'b'), ['a']);
    expect(buttonCount(p, ['a', 'b'])).toEqual({ mixed: true });
  });

  it('counts an untouched batch as agreeing on none', () => {
    expect(buttonCount(withPhotos('a', 'b'), ['a', 'b'])).toEqual({ mixed: false, value: 0 });
  });
});

describe('buttonRectField', () => {
  it('reads one coordinate of the button at that slot', () => {
    const p = withButton(withPhotos('a', 'b'), ['a', 'b']);
    expect(buttonRectField(p, ['a', 'b'], 0, 'w')).toEqual({ mixed: false, value: 73.3 });
  });

  it('goes mixed when the selection has dragged that button apart', () => {
    let p = withButton(withPhotos('a', 'b'), ['a', 'b']);
    p = apply(p, {
      type: 'button/patch', ids: ['a'], index: 0, patch: { rect: { x: 4, y: 4, w: 40, h: 5 } },
    });
    expect(buttonRectField(p, ['a', 'b'], 0, 'x')).toEqual({ mixed: true });
  });

  it('agrees on the coordinates the drag left alone', () => {
    let p = withButton(withPhotos('a', 'b'), ['a', 'b']);
    const rect = p.photos[0]!.buttons[0]!.rect;
    p = apply(p, { type: 'button/patch', ids: ['a'], index: 0, patch: { rect: { ...rect, x: 4 } } });
    expect(buttonRectField(p, ['a', 'b'], 0, 'y')).toEqual({ mixed: false, value: rect.y });
  });
});

describe('buttonTimingField', () => {
  it('reads one part of the window of the button at that slot', () => {
    const p = withButton(withPhotos('a', 'b'), ['a', 'b']);
    expect(buttonTimingField(p, ['a', 'b'], 0, 'appearAt')).toEqual({ mixed: false, value: 0 });
  });

  it('reads an open end as a value rather than as an absence', () => {
    const p = withButton(withPhotos('a', 'b'), ['a', 'b']);
    expect(buttonTimingField(p, ['a', 'b'], 0, 'hideAt')).toEqual({ mixed: false, value: null });
  });

  it('goes mixed when only one of the selected buttons was retimed', () => {
    let p = withButton(withPhotos('a', 'b'), ['a', 'b']);
    const timing = p.photos[0]!.buttons[0]!.timing;
    p = apply(p, {
      type: 'button/patch', ids: ['a'], index: 0, patch: { timing: { ...timing, appearAt: 3 } },
    });
    expect(buttonTimingField(p, ['a', 'b'], 0, 'appearAt')).toEqual({ mixed: true });
    expect(buttonTimingField(p, ['a', 'b'], 0, 'enter')).toEqual({ mixed: false, value: 'fade' });
  });

  it('reads a slot nobody has as mixed rather than inventing a window', () => {
    expect(buttonTimingField(withPhotos('a'), ['a'], 0, 'appearAt')).toEqual({ mixed: true });
  });
});

describe('reading a template across the selection', () => {
  const batch = (): Project => {
    let p = ['a', 'b'].reduce(
      (acc, id) => apply(acc, {
        type: 'photo/add', photos: [{ id, name: id, image: 'data:,' + id, canvas: { width: 1080, height: 1920 } }],
      }),
      createProject(),
    );
    return apply(p, { type: 'selection/all' });
  };

  const withTemplate = (id: string): Project => {
    const p = batch();
    return apply(p, { type: 'template/set', ids: p.selection, definitionId: id });
  };

  it('reports the template the whole selection wears', () => {
    expect(templateChoice(withTemplate('rates'), ['a', 'b']))
      .toEqual({ mixed: false, value: 'rates' });
  });

  it('reports no template as a value, not as an absence', () => {
    expect(templateChoice(batch(), ['a', 'b'])).toEqual({ mixed: false, value: NO_TEMPLATE });
  });

  it('reports mixed when the selection wears different templates', () => {
    const p = apply(withTemplate('rates'), {
      type: 'template/set', ids: ['b'], definitionId: 'jobs-banner',
    });
    expect(templateChoice(p, ['a', 'b']).mixed).toBe(true);
  });

  it('reads the template window like any other layer field', () => {
    const p = apply(withTemplate('rates'), {
      type: 'template/patch', ids: ['a'], patch: { timing: { appearAt: 3 } },
    });
    expect(templateTimingField(p, ['a', 'b'], 'appearAt').mixed).toBe(true);
    expect(templateTimingField(p, ['a'], 'appearAt')).toEqual({ mixed: false, value: 3 });
  });

  it('reads where the layout was slid to, and says so when the two disagree', () => {
    const p = apply(withTemplate('tier-rows'), {
      type: 'template/patch', ids: ['a'], patch: { offsetY: -18 },
    });
    expect(templateOffsetField(p, ['a', 'b']).mixed).toBe(true);
    expect(templateOffsetField(p, ['a'])).toEqual({ mixed: false, value: -18 });
    expect(templateOffsetField(p, ['b'])).toEqual({ mixed: false, value: 0 });
  });
});
