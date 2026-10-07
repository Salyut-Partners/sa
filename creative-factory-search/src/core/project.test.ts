import { describe, expect, it } from 'vitest';
import {
  apply, createProject, defaultButton, MAX_PHOTOS, nextSlot, TEMPLATE_LIFT,
} from './project.ts';
import { templateById } from './templates.ts';
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

  it('writes one coordinate without disturbing the rest of the rect', () => {
    // Typing into the X box is not a drag: it says where the button starts, not
    // where it starts and how big it is. Under a selection, sending the whole
    // rect would push the active photo geometry onto photos that were only
    // meant to line up on one axis.
    const p = apply(withPhotos('a'), { type: 'button/add', ids: ['a'], index: 0, button: button('btn') });
    const before = p.photos[0]!.buttons[0]!.rect;
    const moved = apply(p, { type: 'button/patch', ids: ['a'], index: 0, patch: { rect: { x: 4 } } });
    expect(moved.photos[0]!.buttons[0]!.rect).toEqual({ ...before, x: 4 });
  });

  it('writes one part of the window without disturbing the rest of it', () => {
    const p = apply(withPhotos('a'), { type: 'button/add', ids: ['a'], index: 0, button: button('btn') });
    const retimed = apply(p, {
      type: 'button/patch', ids: ['a'], index: 0, patch: { timing: { appearAt: 3 } },
    });
    expect(retimed.photos[0]!.buttons[0]!.timing).toEqual({
      appearAt: 3, hideAt: null, enter: 'fade', enterDuration: 0.4,
    });
  });

  it('leaves each photo the window parts the broadcast did not name', () => {
    let p = apply(withPhotos('a', 'b'), {
      type: 'button/add', ids: ['a', 'b'], index: 0, button: button('btn'),
    });
    p = apply(p, { type: 'button/patch', ids: ['b'], index: 0, patch: { timing: { enter: 'pop' } } });
    const retimed = apply(p, {
      type: 'button/patch', ids: ['a', 'b'], index: 0, patch: { timing: { appearAt: 2 } },
    });
    expect(retimed.photos.map(x => x.buttons[0]!.timing.appearAt)).toEqual([2, 2]);
    expect(retimed.photos.map(x => x.buttons[0]!.timing.enter)).toEqual(['fade', 'pop']);
  });

  it('nudges the button at that slot by whole canvas pixels', () => {
    const p = apply(withPhotos('a'), { type: 'button/add', ids: ['a'], index: 0, button: button('btn') });
    const before = p.photos[0]!.buttons[0]!.rect;
    const moved = apply(p, { type: 'button/nudge', ids: ['a'], index: 0, by: { x: 5, y: 0 } });
    expect(moved.photos[0]!.buttons[0]!.rect.x).toBeCloseTo(before.x + 500 / 1080, 10);
    expect(moved.photos[0]!.buttons[0]!.rect.y).toBe(before.y);
  });

  it('moves each photo its own button, rather than lining them all up on one', () => {
    // A nudge is "a pixel left", not "put them where this one is". Writing the
    // active photo's coordinate to the selection would snap buttons that were
    // deliberately placed differently onto a single column.
    let p = apply(withPhotos('a', 'b'), {
      type: 'button/add', ids: ['a', 'b'], index: 0, button: button('btn'),
    });
    const start = p.photos[0]!.buttons[0]!.rect;
    p = apply(p, { type: 'button/patch', ids: ['b'], index: 0, patch: { rect: { x: 20 } } });
    const moved = apply(p, { type: 'button/nudge', ids: ['a', 'b'], index: 0, by: { x: 10, y: 0 } });
    const step = 1000 / 1080;
    expect(moved.photos[0]!.buttons[0]!.rect.x).toBeCloseTo(start.x + step, 10);
    expect(moved.photos[1]!.buttons[0]!.rect.x).toBeCloseTo(20 + step, 10);
  });

  it('stops a nudge at the edge of the canvas', () => {
    let p = apply(withPhotos('a'), { type: 'button/add', ids: ['a'], index: 0, button: button('btn') });
    p = apply(p, { type: 'button/patch', ids: ['a'], index: 0, patch: { rect: { x: 0 } } });
    const moved = apply(p, { type: 'button/nudge', ids: ['a'], index: 0, by: { x: -50, y: 0 } });
    expect(moved.photos[0]!.buttons[0]!.rect.x).toBe(0);
  });

  it('leaves a photo without that slot alone', () => {
    const before = unevenPair();
    const moved = apply(before, { type: 'button/nudge', ids: ['a', 'b'], index: 1, by: { x: 5, y: 0 } });
    expect(moved.photos[0]!.buttons).toEqual(before.photos[0]!.buttons);
    expect(moved.photos[1]!.buttons[1]!.rect.x).not.toBe(before.photos[1]!.buttons[1]!.rect.x);
  });

  it('removes the button at that slot from every targeted photo', () => {
    let p = apply(withPhotos('a', 'b'), { type: 'button/add', ids: ['a', 'b'], index: 0, button: button('one') });
    p = apply(p, { type: 'button/add', ids: ['a', 'b'], index: 1, button: { ...button('two'), text: 'ДРУГА' } });
    const cut = apply(p, { type: 'button/remove', ids: ['a', 'b'], index: 0 });
    expect(cut.photos.map(x => x.buttons.length)).toEqual([1, 1]);
    expect(cut.photos.map(x => x.buttons[0]!.text)).toEqual(['ДРУГА', 'ДРУГА']);
  });

  /** Three buttons, top to bottom of the list, on every named photo. */
  const stacked = (...ids: string[]): Project =>
    ['ПЕРША', 'ДРУГА', 'ТРЕТЯ'].reduce(
      (p, text, i) => apply(p, {
        type: 'button/add', ids, index: i, button: { ...button('b' + i), text },
      }),
      withPhotos(...ids),
    );

  it('moves a button down the list in every targeted photo', () => {
    const p = apply(stacked('a', 'b'), { type: 'button/move', ids: ['a', 'b'], from: 0, to: 2 });
    expect(p.photos.map(x => x.buttons.map(b => b.text))).toEqual([
      ['ДРУГА', 'ТРЕТЯ', 'ПЕРША'],
      ['ДРУГА', 'ТРЕТЯ', 'ПЕРША'],
    ]);
  });

  it('moves a button up the list', () => {
    const p = apply(stacked('a'), { type: 'button/move', ids: ['a'], from: 2, to: 0 });
    expect(p.photos[0]!.buttons.map(b => b.text)).toEqual(['ТРЕТЯ', 'ПЕРША', 'ДРУГА']);
  });

  it('leaves a photo that has no such slot alone rather than moving something else', () => {
    const p = apply(unevenPair(), { type: 'button/move', ids: ['a', 'b'], from: 1, to: 0 });
    expect(p.photos.map(x => x.buttons.map(b => b.text))).toEqual([
      ['ПЕРША'],
      ['ЗАЙВА', 'ПЕРША'],
    ]);
  });

  it('ignores a move that goes nowhere', () => {
    const before = stacked('a');
    expect(apply(before, { type: 'button/move', ids: ['a'], from: 1, to: 1 })).toBe(before);
  });

  it('ignores a move off the end of the list', () => {
    const before = stacked('a');
    expect(apply(before, { type: 'button/move', ids: ['a'], from: 0, to: 7 })).toBe(before);
    expect(apply(before, { type: 'button/move', ids: ['a'], from: -1, to: 0 })).toBe(before);
  });

  it('duplicates a button into the slot just after it, in every targeted photo', () => {
    const p = apply(stacked('a', 'b'), {
      type: 'button/duplicate', ids: ['a', 'b'], index: 0, id: 'copy',
    });
    expect(p.photos.map(x => x.buttons.map(b => b.text))).toEqual([
      ['ПЕРША', 'ПЕРША', 'ДРУГА', 'ТРЕТЯ'],
      ['ПЕРША', 'ПЕРША', 'ДРУГА', 'ТРЕТЯ'],
    ]);
  });

  it('copies each photo its own button rather than one photo button to all of them', () => {
    const apart = apply(stacked('a', 'b'), {
      type: 'button/patch', ids: ['b'], index: 0, patch: { text: 'ІНША' },
    });
    const p = apply(apart, { type: 'button/duplicate', ids: ['a', 'b'], index: 0, id: 'copy' });
    expect(p.photos.map(x => x.buttons[1]!.text)).toEqual(['ПЕРША', 'ІНША']);
  });

  it('gives the copy its own identity, so the list can tell the two apart', () => {
    const p = apply(stacked('a'), { type: 'button/duplicate', ids: ['a'], index: 0, id: 'copy' });
    expect(p.photos[0]!.buttons[1]!.id).toBe('copy');
    expect(p.photos[0]!.buttons[0]!.id).not.toBe('copy');
  });

  it('gives the copy its own geometry, so moving it leaves the original where it was', () => {
    const p = apply(stacked('a'), { type: 'button/duplicate', ids: ['a'], index: 0, id: 'copy' });
    const moved = apply(p, {
      type: 'button/patch', ids: ['a'], index: 1, patch: { rect: { x: 1, y: 2, w: 3, h: 4 } },
    });
    expect(moved.photos[0]!.buttons[0]!.rect).not.toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it('leaves a photo without that slot alone rather than inventing a button for it', () => {
    const p = apply(unevenPair(), { type: 'button/duplicate', ids: ['a', 'b'], index: 1, id: 'copy' });
    expect(p.photos.map(x => x.buttons.map(b => b.text))).toEqual([
      ['ПЕРША'],
      ['ПЕРША', 'ЗАЙВА', 'ЗАЙВА'],
    ]);
  });
});

describe('no-op commands', () => {
  // Identity is the signal the editor reads to tell an edit from a miss: a
  // command that changed nothing must not take a step on the undo stack, and
  // must not make the grid rebuild a preview.
  it('gives the same project back when a patch lands on no button', () => {
    const before = withPhotos('a');
    expect(apply(before, { type: 'button/patch', ids: ['a'], index: 0, patch: { text: 'X' } }))
      .toBe(before);
  });

  it('gives the same project back when a removal lands on no button', () => {
    const before = withPhotos('a');
    expect(apply(before, { type: 'button/remove', ids: ['a'], index: 0 })).toBe(before);
  });

  it('gives the same project back when the ids name nobody', () => {
    const before = withPhotos('a');
    expect(apply(before, { type: 'photo/patch', ids: ['ghost'], patch: { glare: false } }))
      .toBe(before);
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

describe('template commands', () => {
  it('starts a photo with no template — a creative may be buttons alone', () => {
    expect(withPhotos('a').photos[0]!.template).toBeNull();
  });

  it('puts a template on the photo with the library default timing', () => {
    const p = apply(withPhotos('a'), {
      type: 'template/set', ids: ['a'], definitionId: 'jobs-card-pills',
    });
    const layer = p.photos[0]!.template!;
    expect(layer.definitionId).toBe('jobs-card-pills');
    expect(layer.timing).toEqual(templateById('jobs-card-pills')!.defaultTiming);
  });

  it('puts one template on the whole selection', () => {
    const p = apply(withPhotos('a', 'b'), {
      type: 'template/set', ids: ['a', 'b'], definitionId: 'rates',
    });
    expect(p.photos.map(x => x.template?.definitionId)).toEqual(['rates', 'rates']);
  });

  it('refuses a template the library does not carry', () => {
    const before = withPhotos('a');
    expect(apply(before, { type: 'template/set', ids: ['a'], definitionId: 'nope' })).toBe(before);
  });

  it('takes the template off again', () => {
    let p = apply(withPhotos('a'), {
      type: 'template/set', ids: ['a'], definitionId: 'rates',
    });
    p = apply(p, { type: 'template/set', ids: ['a'], definitionId: null });
    expect(p.photos[0]!.template).toBeNull();
  });

  it('keeps the timing when the layout is swapped', () => {
    // The three card versions are one offer in three layouts: changing which one
    // is on the frame is not a reason to retype the offer or re-time the panel.
    let p = apply(withPhotos('a'), {
      type: 'template/set', ids: ['a'], definitionId: 'jobs-card-pills',
    });
    p = apply(p, { type: 'template/patch', ids: ['a'], patch: { timing: { appearAt: 2 } } });
    p = apply(p, { type: 'template/set', ids: ['a'], definitionId: 'jobs-card-sheet' });
    expect(p.photos[0]!.template!.timing.appearAt).toBe(2);
  });

  it('patches the timing of the selection, merging rather than replacing', () => {
    let p = apply(withPhotos('a'), {
      type: 'template/set', ids: ['a'], definitionId: 'rates',
    });
    p = apply(p, { type: 'template/patch', ids: ['a'], patch: { timing: { hideAt: 6 } } });
    const timing = p.photos[0]!.template!.timing;
    expect(timing.hideAt).toBe(6);
    expect(timing.appearAt).toBe(templateById('rates')!.defaultTiming.appearAt);
  });

  it('gives the same project back when nothing was there to change', () => {
    const before = withPhotos('a');
    expect(apply(before, { type: 'template/patch', ids: ['a'], patch: { timing: { appearAt: 1 } } }))
      .toBe(before);
  });

  it('slides a movable layout up and down the frame', () => {
    let p = apply(withPhotos('a'), {
      type: 'template/set', ids: ['a'], definitionId: 'tier-rows',
    });
    expect(p.photos[0]!.template!.offsetY).toBe(0);
    p = apply(p, { type: 'template/patch', ids: ['a'], patch: { offsetY: -32 } });
    expect(p.photos[0]!.template!.offsetY).toBe(-32);
  });

  it('holds the nudge inside the room the frame has', () => {
    // Past the ends the stack leaves the picture, and a control whose far end
    // hides the thing it moves is one the user has to be rescued from.
    let p = apply(withPhotos('a'), {
      type: 'template/set', ids: ['a'], definitionId: 'tier-rows',
    });
    p = apply(p, { type: 'template/patch', ids: ['a'], patch: { offsetY: -900 } });
    expect(p.photos[0]!.template!.offsetY).toBe(TEMPLATE_LIFT.min);
    p = apply(p, { type: 'template/patch', ids: ['a'], patch: { offsetY: 900 } });
    expect(p.photos[0]!.template!.offsetY).toBe(TEMPLATE_LIFT.max);
  });

  it('refuses to nudge a layout that darkens the whole frame', () => {
    // Not clamped to zero but ignored: a figure stored on one of these is a
    // nudge the panel never shows and the frame never explains.
    let p = apply(withPhotos('a'), {
      type: 'template/set', ids: ['a'], definitionId: 'donor-tiers',
    });
    p = apply(p, { type: 'template/patch', ids: ['a'], patch: { offsetY: -30 } });
    expect(p.photos[0]!.template!.offsetY).toBe(0);
  });

  it('puts a swapped layout back where it draws itself', () => {
    // The window and the text survive a swap; the place does not. Where one
    // layout was nudged to is a place the next one may have no use for.
    let p = apply(withPhotos('a'), {
      type: 'template/set', ids: ['a'], definitionId: 'tier-rows',
    });
    p = apply(p, { type: 'template/patch', ids: ['a'], patch: { offsetY: -40 } });
    p = apply(p, { type: 'template/set', ids: ['a'], definitionId: 'donor-tiers' });
    expect(p.photos[0]!.template!.offsetY).toBe(0);
  });
});

describe('locale commands', () => {
  it('starts in one language, which is the one on screen', () => {
    const p = createProject();
    expect(p.locales.map(l => l.id)).toEqual(['en']);
    expect(p.activeLocale).toBe('en');
    expect(p.locales[0]).toEqual({
      id: 'en', script: '', include: true, subtitles: true, overrides: {},
    });
  });

  it('adds a language and shows it, because adding one is asking to see it', () => {
    const p = apply(createProject(), { type: 'locale/add', id: 'de' });
    expect(p.locales.map(l => l.id)).toEqual(['en', 'de']);
    expect(p.activeLocale).toBe('de');
  });

  it('ignores a language the project already carries', () => {
    const before = apply(createProject(), { type: 'locale/add', id: 'de' });
    expect(apply(before, { type: 'locale/add', id: 'de' })).toBe(before);
  });

  it('removes a language', () => {
    let p = apply(createProject(), { type: 'locale/add', id: 'de' });
    p = apply(p, { type: 'locale/remove', id: 'de' });
    expect(p.locales.map(l => l.id)).toEqual(['en']);
  });

  it('falls back to another language when the one on screen is removed', () => {
    let p = apply(createProject(), { type: 'locale/add', id: 'de' });
    expect(p.activeLocale).toBe('de');
    p = apply(p, { type: 'locale/remove', id: 'de' });
    expect(p.activeLocale).toBe('en');
  });

  it('will not remove the last one — every text on the frame is read out of it', () => {
    const before = createProject();
    expect(apply(before, { type: 'locale/remove', id: 'en' })).toBe(before);
  });

  it('activates only a language the project carries', () => {
    const before = createProject();
    expect(apply(before, { type: 'locale/activate', id: 'pl' })).toBe(before);
    expect(apply(apply(before, { type: 'locale/add', id: 'pl' }), {
      type: 'locale/activate', id: 'en',
    }).activeLocale).toBe('en');
  });

  it('writes the script and whether it goes out', () => {
    let p = apply(createProject(), { type: 'locale/patch', id: 'en', patch: { script: 'Привіт' } });
    p = apply(p, { type: 'locale/patch', id: 'en', patch: { include: false } });
    expect(p.locales[0]).toMatchObject({ script: 'Привіт', include: false });
  });

  it('keeps where a translated script came from, until the buyer types over it', () => {
    let p = apply(createProject(), { type: 'locale/add', id: 'de' });
    p = apply(p, { type: 'locale/write', writes: [{ id: 'de', script: 'Hallo', translatedFrom: { id: 'en', script: 'Hi' } }] });
    expect(p.locales[1]!.translatedFrom).toEqual({ id: 'en', script: 'Hi' });
    p = apply(p, { type: 'locale/patch', id: 'de', patch: { include: false } });
    expect(p.locales[1]!.translatedFrom).toEqual({ id: 'en', script: 'Hi' });
    p = apply(p, { type: 'locale/patch', id: 'de', patch: { script: 'Hallo!' } });
    expect(p.locales[1]!.translatedFrom).toBeNull();
  });

  it('gives the same project back when a patch changes nothing', () => {
    const before = apply(createProject(), { type: 'locale/patch', id: 'en', patch: { script: 'x' } });
    expect(apply(before, { type: 'locale/patch', id: 'en', patch: { script: 'x' } })).toBe(before);
    expect(apply(before, { type: 'locale/patch', id: 'pl', patch: { script: 'y' } })).toBe(before);
  });
});

describe('the words of the offer', () => {
  const twoLanguages = (): Project => apply(createProject(), { type: 'locale/add', id: 'de' });

  it('writes a field on the language it was typed in and nowhere else', () => {
    const p = apply(twoLanguages(), { type: 'locale/field', id: 'de', key: 'cta', value: 'JETZT' });
    expect(p.locales.map(l => l.overrides['cta'])).toEqual([undefined, 'JETZT']);
  });

  it('writes a list field as a list', () => {
    const p = apply(createProject(), {
      type: 'locale/field', id: 'en', key: 'jobs', value: ['Security', 'Cleaning'],
    });
    expect(p.locales[0]!.overrides['jobs']).toEqual(['Security', 'Cleaning']);
  });

  it('resets a field by forgetting it, so the dictionary answers for it again', () => {
    let p = apply(createProject(), { type: 'locale/field', id: 'en', key: 'cta', value: 'МОЄ' });
    p = apply(p, { type: 'locale/field', id: 'en', key: 'cta', value: null });
    expect('cta' in p.locales[0]!.overrides).toBe(false);
  });

  it('is untouched by which photo or which template is on screen', () => {
    // The offer is the batch's. Swapping a photo's layout must not lose the words.
    let p = apply(withPhotos('a'), { type: 'locale/field', id: 'en', key: 'cta', value: 'МОЄ' });
    p = apply(p, { type: 'template/set', ids: ['a'], definitionId: 'jobs-card-pills' });
    p = apply(p, { type: 'template/set', ids: ['a'], definitionId: null });
    expect(p.locales[0]!.overrides['cta']).toBe('МОЄ');
  });

  it('gives the same project back when a reset had nothing to forget', () => {
    const before = createProject();
    expect(apply(before, { type: 'locale/field', id: 'en', key: 'cta', value: null })).toBe(before);
    expect(apply(before, { type: 'locale/field', id: 'pl', key: 'cta', value: 'x' })).toBe(before);
  });
});

describe('a translation arriving', () => {
  const threeLanguages = (): Project =>
    ['de', 'pl'].reduce(
      (p, id) => apply(p, { type: 'locale/add', id: id as 'de' }),
      apply(createProject(), { type: 'locale/field', id: 'en', key: 'cta', value: 'LEARN MORE' }),
    );

  it('lands on every language in one step, so one undo walks it back', () => {
    const p = apply(threeLanguages(), {
      type: 'locale/write',
      writes: [
        { id: 'de', overrides: { cta: 'MEHR ERFAHREN' } },
        { id: 'pl', overrides: { cta: 'DOWIEDZ SIĘ' } },
      ],
    });
    expect(p.locales.map(l => l.overrides['cta']))
      .toEqual(['LEARN MORE', 'MEHR ERFAHREN', 'DOWIEDZ SIĘ']);
  });

  it('merges rather than replacing, so a field it had nothing to say about survives', () => {
    let p = apply(threeLanguages(), {
      type: 'locale/field', id: 'de', key: 'headline', value: 'Von Hand',
    });
    p = apply(p, { type: 'locale/write', writes: [{ id: 'de', overrides: { cta: 'MEHR' } }] });
    expect(p.locales[1]!.overrides).toEqual({ headline: 'Von Hand', cta: 'MEHR' });
  });

  it('carries scripts the same way', () => {
    const p = apply(threeLanguages(), {
      type: 'locale/write',
      writes: [{ id: 'de', script: 'Flughafenpersonal gesucht.' }, { id: 'pl', script: 'Praca.' }],
    });
    expect(p.locales.map(l => l.script)).toEqual(['', 'Flughafenpersonal gesucht.', 'Praca.']);
  });

  it('leaves the overrides alone when only a script came back', () => {
    const p = apply(threeLanguages(), {
      type: 'locale/write', writes: [{ id: 'en', script: 'Hello.' }],
    });
    expect(p.locales[0]!.overrides['cta']).toBe('LEARN MORE');
  });

  it('ignores a language the project does not carry', () => {
    const before = threeLanguages();
    expect(apply(before, { type: 'locale/write', writes: [{ id: 'fr', script: 'Bonjour' }] }))
      .toBe(before);
  });
});
