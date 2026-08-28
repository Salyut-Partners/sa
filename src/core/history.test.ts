import { describe, expect, it } from 'vitest';
import {
  canRedo, canUndo, coalesceKey, historyOf, HISTORY_LIMIT, isUndoable, record, redo, undo,
} from './history.ts';

describe('history', () => {
  it('goes back to what was there before the change', () => {
    const h = record(historyOf('a'), 'b');
    expect(undo(h).present).toBe('a');
  });

  it('walks back through several changes one at a time', () => {
    let h = record(record(historyOf('a'), 'b'), 'c');
    h = undo(h);
    expect(h.present).toBe('b');
    expect(undo(h).present).toBe('a');
  });

  it('goes forward again after going back', () => {
    const h = record(historyOf('a'), 'b');
    expect(redo(undo(h)).present).toBe('b');
  });

  it('has nothing to undo before the first change', () => {
    const h = historyOf('a');
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toEqual(h);
  });

  it('has nothing to redo until something has been undone', () => {
    const h = record(historyOf('a'), 'b');
    expect(canRedo(h)).toBe(false);
    expect(redo(h)).toEqual(h);
  });

  it('drops the redo trail once a new change is made', () => {
    const h = record(undo(record(historyOf('a'), 'b')), 'c');
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe('a');
  });

  it('forgets the oldest states rather than growing without end', () => {
    let h = historyOf(0);
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = record(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    // 61 states recorded, the newest 50 kept: everything before 10 is gone.
    expect(h.past[0]).toBe(10);
  });
});

describe('coalescing', () => {
  it('collapses a run of the same kind of change into one step', () => {
    let h = record(historyOf('a'), 'b', 'drag');
    h = record(h, 'c', 'drag');
    h = record(h, 'd', 'drag');
    expect(h.present).toBe('d');
    expect(undo(h).present).toBe('a');
  });

  it('starts a new step when the change is of another kind', () => {
    let h = record(historyOf('a'), 'b', 'drag');
    h = record(h, 'c', 'text');
    expect(undo(h).present).toBe('b');
  });

  it('never collapses changes that carry no key', () => {
    let h = record(historyOf('a'), 'b');
    h = record(h, 'c');
    expect(undo(h).present).toBe('b');
  });

  it('does not fold the next change into the state undo just restored', () => {
    let h = record(historyOf('a'), 'b', 'drag');
    h = undo(h);
    h = record(h, 'c', 'drag');
    expect(undo(h).present).toBe('a');
  });
});

describe('coalesceKey', () => {
  it('treats one continuous drag of one button as one step', () => {
    const rect = { x: 1, y: 2, w: 3, h: 4 };
    const a = coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { rect } });
    const b = coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { rect } });
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it('separates dragging one button from dragging another', () => {
    const rect = { x: 1, y: 2, w: 3, h: 4 };
    expect(coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { rect } }))
      .not.toBe(coalesceKey({ type: 'button/patch', ids: ['p'], index: 1, patch: { rect } }));
  });

  it('separates moving a button from retyping its text', () => {
    expect(coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { text: 'a' } }))
      .not.toBe(coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { rect: { x: 0, y: 0, w: 1, h: 1 } } }));
  });

  it('separates retiming when a button appears from retiming when it goes', () => {
    // Both are `{ timing: ... }`; folding them into one step would make undo
    // walk back past a change the user never asked it to.
    expect(coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { timing: { appearAt: 1 } } }))
      .not.toBe(coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { timing: { hideAt: 4 } } }));
  });

  it('treats nudging one coordinate repeatedly as one step', () => {
    expect(coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { rect: { x: 1 } } }))
      .toBe(coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { rect: { x: 2 } } }));
  });

  it('separates nudging sideways from nudging down', () => {
    expect(coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { rect: { x: 1 } } }))
      .not.toBe(coalesceKey({ type: 'button/patch', ids: ['p'], index: 0, patch: { rect: { y: 1 } } }));
  });

  it('gives reordering and duplicating a step each, since each is one gesture', () => {
    expect(coalesceKey({ type: 'button/move', ids: ['p'], from: 0, to: 1 })).toBeNull();
    expect(coalesceKey({ type: 'button/duplicate', ids: ['p'], index: 0, id: 'c' })).toBeNull();
    expect(isUndoable({ type: 'button/move', ids: ['p'], from: 0, to: 1 })).toBe(true);
    expect(isUndoable({ type: 'button/duplicate', ids: ['p'], index: 0, id: 'c' })).toBe(true);
  });

  it('gives adding a button its own step, since it is one gesture already', () => {
    expect(coalesceKey({ type: 'photo/remove', id: 'p' })).toBeNull();
  });
});

describe('what is worth undoing', () => {
  it('leaves selection out of the undo stack, so undo never means re-clicking', () => {
    expect(isUndoable({ type: 'photo/activate', id: 'a' })).toBe(false);
    expect(isUndoable({ type: 'photo/toggle', id: 'a' })).toBe(false);
    expect(isUndoable({ type: 'selection/all' })).toBe(false);
    expect(isUndoable({ type: 'selection/one' })).toBe(false);
  });

  it('puts everything that changes a creative in it', () => {
    expect(isUndoable({ type: 'photo/patch', ids: ['a'], patch: { glare: false } })).toBe(true);
    expect(isUndoable({ type: 'photo/remove', id: 'a' })).toBe(true);
    expect(isUndoable({ type: 'button/remove', ids: ['a'], index: 0 })).toBe(true);
  });
});

describe('template edits on the stack', () => {
  it('folds a run of typing into one field into one step', () => {
    expect(coalesceKey({ type: 'template/field', ids: ['a'], key: 'headline', value: 'Роб' }))
      .toBe(coalesceKey({ type: 'template/field', ids: ['a'], key: 'headline', value: 'Робота' }));
  });

  it('holds two different fields apart', () => {
    expect(coalesceKey({ type: 'template/field', ids: ['a'], key: 'headline', value: 'x' }))
      .not.toBe(coalesceKey({ type: 'template/field', ids: ['a'], key: 'cta', value: 'x' }));
  });

  it('holds the two ends of a template window apart', () => {
    expect(coalesceKey({ type: 'template/patch', ids: ['a'], patch: { timing: { appearAt: 1 } } }))
      .not.toBe(coalesceKey({ type: 'template/patch', ids: ['a'], patch: { timing: { hideAt: 9 } } }));
  });

  it('gives choosing a template a step of its own', () => {
    expect(coalesceKey({ type: 'template/set', ids: ['a'], definitionId: 'rates' })).toBeNull();
    expect(isUndoable({ type: 'template/set', ids: ['a'], definitionId: null })).toBe(true);
  });
});
