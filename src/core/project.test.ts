import { describe, expect, it } from 'vitest';
import { apply, createProject, defaultButton, MAX_PHOTOS, nextSlot } from './project.ts';
import type { Project } from './types.ts';

const photo = (id: string) => ({ id, name: id + '.jpg', image: 'data:image/jpeg;base64,' + id });

const withPhotos = (...ids: string[]): Project =>
  ids.reduce((p, id) => apply(p, { type: 'photo/add', photos: [photo(id)] }), createProject());

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

  /** Two photos out of step: 'a' holds one button, 'b' holds two. */
  const unevenPair = (): Project => {
    const both = apply(withPhotos('a', 'b'), {
      type: 'button/add', ids: ['a', 'b'], index: 0, button: { ...button('one'), text: 'ПЕРША' },
    });
    return apply(both, {
      type: 'button/add', ids: ['b'], index: 1, button: { ...button('extra'), text: 'ЗАЙВА' },
    });
  };

  it('adds the same button to every targeted photo', () => {
    const p = apply(withPhotos('a', 'b'), {
      type: 'button/add', ids: ['a', 'b'], index: 0, button: button('btn'),
    });
    expect(p.photos.map(x => x.buttons.length)).toEqual([1, 1]);
  });

  it('gives each photo its own copy, so editing one does not move the other', () => {
    const p = apply(withPhotos('a', 'b'), {
      type: 'button/add', ids: ['a', 'b'], index: 0, button: button('btn'),
    });
    const moved = apply(p, {
      type: 'button/patch', ids: ['a'], index: 0, patch: { rect: { x: 1, y: 2, w: 3, h: 4 } },
    });
    expect(moved.photos[0]!.buttons[0]!.rect).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(moved.photos[1]!.buttons[0]!.rect).not.toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it('patches the button at the same slot in every targeted photo', () => {
    const p = apply(withPhotos('a', 'b'), {
      type: 'button/add', ids: ['a', 'b'], index: 0, button: button('btn'),
    });
    const edited = apply(p, {
      type: 'button/patch', ids: ['a', 'b'], index: 0, patch: { text: 'ЗАМОВИТИ' },
    });
    expect(edited.photos.map(x => x.buttons[0]!.text)).toEqual(['ЗАМОВИТИ', 'ЗАМОВИТИ']);
  });

  it('skips photos that have no button in that slot', () => {
    const p = apply(withPhotos('a', 'b'), { type: 'button/add', ids: ['a'], index: 0, button: button('btn') });
    const edited = apply(p, { type: 'button/patch', ids: ['a', 'b'], index: 0, patch: { text: 'X' } });
    expect(edited.photos[0]!.buttons[0]!.text).toBe('X');
    expect(edited.photos[1]!.buttons).toEqual([]);
  });

  it('puts a new button at the same slot in every photo, however many each had', () => {
    // A batch where one photo already carries an extra button. Appending would
    // land the new one at slot 1 in one photo and slot 2 in the other, and every
    // later broadcast would then edit a different button in each.
    const uneven = unevenPair();
    const p = apply(uneven, {
      type: 'button/add', ids: ['a', 'b'], index: 9, button: { ...button('new'), text: 'НОВА' },
    });
    expect(p.photos.map(x => x.buttons.map(b => b.text))).toEqual([
      ['ПЕРША', 'НОВА'],
      ['ПЕРША', 'НОВА', 'ЗАЙВА'],
    ]);
  });

  it('offers the deepest slot every selected photo has', () => {
    expect(nextSlot(unevenPair(), ['a', 'b'])).toBe(1);
    expect(nextSlot(unevenPair(), ['b'])).toBe(2);
    expect(nextSlot(withPhotos('a'), ['a'])).toBe(0);
  });

  it('appends when the slot is past the end of a shorter photo', () => {
    const p = apply(withPhotos('a'), { type: 'button/add', ids: ['a'], index: 9, button: button('btn') });
    expect(p.photos[0]!.buttons).toHaveLength(1);
  });

  it('removes the button at that slot from every targeted photo', () => {
    let p = apply(withPhotos('a', 'b'), { type: 'button/add', ids: ['a', 'b'], index: 0, button: button('one') });
    p = apply(p, { type: 'button/add', ids: ['a', 'b'], index: 1, button: { ...button('two'), text: 'ДРУГА' } });
    const cut = apply(p, { type: 'button/remove', ids: ['a', 'b'], index: 0 });
    expect(cut.photos.map(x => x.buttons.length)).toEqual([1, 1]);
    expect(cut.photos.map(x => x.buttons[0]!.text)).toEqual(['ДРУГА', 'ДРУГА']);
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

describe('importing a batch', () => {
  it('adds every photo of a batch in one command', () => {
    const p = apply(createProject(), {
      type: 'photo/add', photos: [photo('a'), photo('b'), photo('c')],
    });
    expect(p.photos.map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('opens the first of the newly imported photos for editing', () => {
    const p = apply(withPhotos('old'), { type: 'photo/add', photos: [photo('a'), photo('b')] });
    expect(p.activeId).toBe('a');
    expect(p.selection).toEqual(['a']);
  });

  it('appends after what is already there', () => {
    const p = apply(withPhotos('old'), { type: 'photo/add', photos: [photo('a')] });
    expect(p.photos.map(x => x.id)).toEqual(['old', 'a']);
  });

  it('will not take more photos than the project can hold', () => {
    const many = Array.from({ length: MAX_PHOTOS + 3 }, (_, i) => photo('p' + i));
    const p = apply(createProject(), { type: 'photo/add', photos: many });
    expect(p.photos).toHaveLength(MAX_PHOTOS);
  });

  it('holds the ceiling across several imports, not just one', () => {
    let p = apply(createProject(), {
      type: 'photo/add', photos: Array.from({ length: MAX_PHOTOS }, (_, i) => photo('p' + i)),
    });
    p = apply(p, { type: 'photo/add', photos: [photo('one-too-many')] });
    expect(p.photos).toHaveLength(MAX_PHOTOS);
    expect(p.photos.map(x => x.id)).not.toContain('one-too-many');
  });

  it('ignores an empty batch', () => {
    const before = withPhotos('a');
    expect(apply(before, { type: 'photo/add', photos: [] })).toEqual(before);
  });

  it('swaps the image of a photo without losing what was built on it', () => {
    const built = apply(withPhotos('a'), {
      type: 'button/add', ids: ['a'], index: 0, button: defaultButton('btn', 'glow', 0, '#1fa94b'),
    });
    const p = apply(built, {
      type: 'photo/replace', id: 'a', name: 'new.jpg', image: 'data:image/jpeg;base64,new',
    });
    expect(p.photos[0]!.name).toBe('new.jpg');
    expect(p.photos[0]!.image).toBe('data:image/jpeg;base64,new');
    expect(p.photos[0]!.buttons).toHaveLength(1);
  });
});

describe('selection', () => {
  it('adds a photo to the selection without losing the one being edited', () => {
    const p = apply(withPhotos('a', 'b'), { type: 'photo/toggle', id: 'a' });
    expect(p.selection.sort()).toEqual(['a', 'b']);
    expect(p.activeId).toBe('b');
  });

  it('takes a photo back out of the selection', () => {
    let p = apply(withPhotos('a', 'b'), { type: 'photo/toggle', id: 'a' });
    p = apply(p, { type: 'photo/toggle', id: 'a' });
    expect(p.selection).toEqual(['b']);
  });

  it('hands the active role to another selected photo when the active one drops out', () => {
    let p = apply(withPhotos('a', 'b'), { type: 'photo/toggle', id: 'a' });
    p = apply(p, { type: 'photo/toggle', id: 'b' });
    expect(p.selection).toEqual(['a']);
    expect(p.activeId).toBe('a');
  });

  it('refuses to empty the selection, since the panel would have nothing to edit', () => {
    const before = withPhotos('a', 'b');
    expect(apply(before, { type: 'photo/toggle', id: 'b' })).toEqual(before);
  });

  it('selects the whole batch, leaving the active photo where it was', () => {
    const p = apply(withPhotos('a', 'b', 'c'), { type: 'selection/all' });
    expect(p.selection).toEqual(['a', 'b', 'c']);
    expect(p.activeId).toBe('c');
  });

  it('narrows a wide selection back to the photo being edited', () => {
    const p = apply(apply(withPhotos('a', 'b', 'c'), { type: 'selection/all' }), {
      type: 'selection/one',
    });
    expect(p.selection).toEqual(['c']);
  });

  it('keeps the selection in grid order however it was built up', () => {
    let p = apply(withPhotos('a', 'b', 'c'), { type: 'photo/activate', id: 'c' });
    p = apply(p, { type: 'photo/toggle', id: 'a' });
    expect(p.selection).toEqual(['a', 'c']);
  });

  it('drops a removed photo out of a wide selection', () => {
    const p = apply(apply(withPhotos('a', 'b'), { type: 'selection/all' }), {
      type: 'photo/remove', id: 'a',
    });
    expect(p.selection).toEqual(['b']);
  });
});
