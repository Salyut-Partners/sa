import { describe, expect, it } from 'vitest';
import { apply, createProject, defaultButton } from './project.ts';
import { buttonCount, buttonField, photoField, shared } from './selection.ts';
import type { Project } from './types.ts';

const photo = (id: string) => ({ id, name: id + '.jpg', image: 'data:,' + id });

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
