import { describe, expect, it } from 'vitest';
import { apply, createProject, defaultButton } from './project.ts';
import type { Project } from './types.ts';

const photo = (id: string) => ({ id, name: id + '.jpg', image: 'data:image/jpeg;base64,' + id });

const withPhotos = (...ids: string[]): Project =>
  ids.reduce((p, id) => apply(p, { type: 'photo/add', photo: photo(id) }), createProject());

describe('createProject', () => {
  it('starts empty at the output size the templates are built for', () => {
    const p = createProject();
    expect(p.photos).toEqual([]);
    expect(p.activeId).toBeNull();
    expect(p.selection).toEqual([]);
    expect(p.canvas).toEqual({ width: 1080, height: 1920 });
    expect(p.fps).toBe(30);
  });
});

describe('photo commands', () => {
  it('appends a photo and makes it the one being edited', () => {
    const p = withPhotos('a');
    expect(p.photos.map(x => x.id)).toEqual(['a']);
    expect(p.activeId).toBe('a');
    expect(p.selection).toEqual(['a']);
  });

  it('activates each newly added photo', () => {
    expect(withPhotos('a', 'b').activeId).toBe('b');
  });

  it('removes a photo and falls back to the first one left', () => {
    const p = apply(withPhotos('a', 'b'), { type: 'photo/remove', id: 'b' });
    expect(p.photos.map(x => x.id)).toEqual(['a']);
    expect(p.activeId).toBe('a');
    expect(p.selection).toEqual(['a']);
  });

  it('leaves nothing active when the last photo goes', () => {
    const p = apply(withPhotos('a'), { type: 'photo/remove', id: 'a' });
    expect(p.activeId).toBeNull();
    expect(p.selection).toEqual([]);
  });

  it('activating a photo makes it the whole selection', () => {
    const p = apply(withPhotos('a', 'b'), { type: 'photo/activate', id: 'a' });
    expect(p.activeId).toBe('a');
    expect(p.selection).toEqual(['a']);
  });

  it('patches every targeted photo at once', () => {
    const p = apply(withPhotos('a', 'b'), {
      type: 'photo/patch', ids: ['a', 'b'], patch: { accent: '#ff0000' },
    });
    expect(p.photos.map(x => x.accent)).toEqual(['#ff0000', '#ff0000']);
  });

  it('leaves photos outside the target list alone', () => {
    const p = apply(withPhotos('a', 'b'), {
      type: 'photo/patch', ids: ['a'], patch: { accent: '#ff0000' },
    });
    expect(p.photos[1]!.accent).not.toBe('#ff0000');
  });

  it('ignores an id that is not in the project', () => {
    const before = withPhotos('a');
    const after = apply(before, { type: 'photo/patch', ids: ['ghost'], patch: { glare: false } });
    expect(after.photos).toEqual(before.photos);
  });
});

describe('button commands', () => {
  const button = (id: string) => defaultButton(id, 'glow', 0, '#1fa94b');

  it('adds the same button to every targeted photo', () => {
    const p = apply(withPhotos('a', 'b'), {
      type: 'button/add', ids: ['a', 'b'], button: button('btn'),
    });
    expect(p.photos.map(x => x.buttons.length)).toEqual([1, 1]);
  });

  it('gives each photo its own copy, so editing one does not move the other', () => {
    const p = apply(withPhotos('a', 'b'), {
      type: 'button/add', ids: ['a', 'b'], button: button('btn'),
    });
    const moved = apply(p, {
      type: 'button/patch', ids: ['a'], index: 0, patch: { rect: { x: 1, y: 2, w: 3, h: 4 } },
    });
    expect(moved.photos[0]!.buttons[0]!.rect).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(moved.photos[1]!.buttons[0]!.rect).not.toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it('patches the button at the same slot in every targeted photo', () => {
    const p = apply(withPhotos('a', 'b'), {
      type: 'button/add', ids: ['a', 'b'], button: button('btn'),
    });
    const edited = apply(p, {
      type: 'button/patch', ids: ['a', 'b'], index: 0, patch: { text: 'ЗАМОВИТИ' },
    });
    expect(edited.photos.map(x => x.buttons[0]!.text)).toEqual(['ЗАМОВИТИ', 'ЗАМОВИТИ']);
  });

  it('skips photos that have no button in that slot', () => {
    const p = apply(withPhotos('a', 'b'), { type: 'button/add', ids: ['a'], button: button('btn') });
    const edited = apply(p, { type: 'button/patch', ids: ['a', 'b'], index: 0, patch: { text: 'X' } });
    expect(edited.photos[0]!.buttons[0]!.text).toBe('X');
    expect(edited.photos[1]!.buttons).toEqual([]);
  });

  it('removes the button at that slot from every targeted photo', () => {
    let p = apply(withPhotos('a', 'b'), { type: 'button/add', ids: ['a', 'b'], button: button('one') });
    p = apply(p, { type: 'button/add', ids: ['a', 'b'], button: button('two') });
    const cut = apply(p, { type: 'button/remove', ids: ['a', 'b'], index: 0 });
    expect(cut.photos.map(x => x.buttons.length)).toEqual([1, 1]);
    expect(cut.photos[0]!.buttons[0]!.text).toBe(button('two').text);
  });
});

describe('project commands', () => {
  it('patches project-wide settings', () => {
    expect(apply(createProject(), { type: 'project/patch', patch: { duration: 14 } }).duration).toBe(14);
  });
});

describe('immutability', () => {
  it('never mutates the project it is given', () => {
    const before = withPhotos('a');
    const snapshot = structuredClone(before);
    apply(before, { type: 'photo/patch', ids: ['a'], patch: { accent: '#000000' } });
    expect(before).toEqual(snapshot);
  });
});

describe('defaultButton', () => {
  it('lands the first button in the lower third, where a CTA belongs', () => {
    const b = defaultButton('id', 'glow', 0, '#1fa94b');
    expect(b.rect.y).toBeGreaterThan(60);
    expect(b.rect.y + b.rect.h).toBeLessThan(100);
  });

  it('staggers each further button so they do not land on top of each other', () => {
    const first = defaultButton('a', 'glow', 0, '#1fa94b');
    const second = defaultButton('b', 'glow', 1, '#1fa94b');
    expect(second.rect.y).not.toBe(first.rect.y);
  });

  it('keeps every staggered button inside the canvas', () => {
    for (let i = 0; i < 12; i++) {
      const b = defaultButton('id' + i, 'glow', i, '#1fa94b');
      expect(b.rect.y).toBeGreaterThanOrEqual(0);
      expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(100);
    }
  });

  it('starts visible from the first frame', () => {
    expect(defaultButton('id', 'glow', 0, '#1fa94b').timing.appearAt).toBe(0);
    expect(defaultButton('id', 'glow', 0, '#1fa94b').timing.hideAt).toBeNull();
  });
});
