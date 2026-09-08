import { describe, expect, it } from 'vitest';
import { apply, createProject, defaultProp } from './project.ts';
import { PROPS, propById, propImage, propsIn, tintable } from './props.ts';
import { fromFile, toFile } from './serialize.ts';
import { buildSpec } from './spec.ts';
import type { Project } from './types.ts';
import { visualKey } from './visual-key.ts';

const withPhoto = (): Project => apply(createProject(), {
  type: 'photo/add',
  photos: [{ id: 'a', name: 'a.jpg', image: 'data:image/jpeg;base64,zz' }],
});

const withProp = (propId = 'window-vac', colors?: string[]): Project => {
  const project = withPhoto();
  const prop = defaultProp('p1', propId, 0, '#1fa94b');
  return apply(project, {
    type: 'prop/add',
    ids: ['a'],
    index: 0,
    prop: colors === undefined ? prop : { ...prop, colors },
  });
};

describe('the prop catalogue', () => {
  it('gives every object an id of its own', () => {
    expect(new Set(PROPS.map(p => p.id)).size).toBe(PROPS.length);
  });

  it('finds an object by id and answers nothing for one it does not carry', () => {
    expect(propById(PROPS[0]!.id)?.label).toBe(PROPS[0]!.label);
    expect(propById('no-such-prop')).toBeNull();
  });

  it('points every record at artwork under one path', () => {
    for (const prop of PROPS) expect(propImage(prop.id)).toBe(`/props/${prop.id}.png`);
  });

  it('states a hue on the circle, or none at all', () => {
    // A hue outside the circle would rotate every prop somewhere unintended, and
    // it is a number measured off artwork rather than one anybody can eyeball.
    for (const prop of PROPS) {
      if (prop.hue === null) continue;
      expect(prop.hue, prop.id).toBeGreaterThanOrEqual(0);
      expect(prop.hue, prop.id).toBeLessThan(360);
    }
  });

  it('says which objects have a colour to move', () => {
    // The grey ones are recorded rather than hidden: a prop that silently
    // ignores the colour it was given is worse than one the panel warns about.
    const grey = PROPS.filter(p => !tintable(p)).map(p => p.id);
    expect(grey).toEqual(['vacuum-canister', 'steam-cleaner', 'broom-pan', 'floor-squeegee']);
  });

  it('files them all under the trade they belong to', () => {
    expect(propsIn('jobs')).toHaveLength(PROPS.length);
  });
});

describe('a prop on a photo', () => {
  it('arrives wearing the photo accent, so it belongs to the creative at once', () => {
    expect(defaultProp('p', 'iron', 0, '#ff0000').colors).toEqual(['#ff0000']);
  });

  it('reaches the renderer with its artwork located and the catalogue left behind', () => {
    const spec = buildSpec(withProp(), 'a')!;
    expect(spec.props).toHaveLength(1);
    expect(spec.props[0]!.src).toBe('/props/window-vac.png');
    expect(spec.props[0]!.hue).toBe(propById('window-vac')!.hue);
    // Percent on the model, pixels on the wire — the renderer resolves nothing.
    expect(spec.props[0]!.rect.w).toBeGreaterThan(100);
  });

  it('drops off the frame when the catalogue no longer carries it', () => {
    // The same rule a template follows: a creative short an object beats one
    // that will not build.
    expect(buildSpec(withProp('deleted-prop'), 'a')!.props).toEqual([]);
  });

  it('counts as part of the picture, so two colour runs are two videos', () => {
    const one = visualKey(buildSpec(withProp('iron', ['#ff0000', '#0000ff']), 'a')!);
    const other = visualKey(buildSpec(withProp('iron', ['#0000ff', '#ff0000']), 'a')!);
    // Order is the animation: red-then-blue is not blue-then-red.
    expect(one).not.toBe(other);
    expect(visualKey(buildSpec(withPhoto(), 'a')!)).not.toBe(one);
  });

  it('survives a trip through a file', () => {
    const loaded = fromFile(JSON.parse(JSON.stringify(toFile(withProp()))));
    expect(loaded.ok).toBe(true);
    expect(loaded.ok && loaded.project.photos[0]!.props).toEqual(withProp().photos[0]!.props);
  });

  it('opens a file written before props existed', () => {
    // Absent is what every version 3 file says, and it means none rather than
    // a project that refuses to open.
    const file = toFile(withPhoto()) as unknown as Record<string, unknown>;
    const photos = (file['photos'] as Record<string, unknown>[]).map(p => {
      const { props, ...rest } = p;
      void props;
      return rest;
    });
    const loaded = fromFile({ ...file, version: 3, photos });
    expect(loaded.ok && loaded.project.photos[0]!.props).toEqual([]);
  });

  it('is removed and nudged by slot, like a button', () => {
    const before = withProp();
    const moved = apply(before, { type: 'prop/nudge', ids: ['a'], index: 0, by: { x: 2, y: 0 } });
    // A step is canvas pixels, not percent: the geometry is in percent, and
    // "по пікселю" has to mean a pixel of the frame however small the cell is.
    const step = 2 / before.canvas.width * 100;
    expect(moved.photos[0]!.props[0]!.rect.x)
      .toBeCloseTo(before.photos[0]!.props[0]!.rect.x + step, 6);
    expect(apply(moved, { type: 'prop/remove', ids: ['a'], index: 0 }).photos[0]!.props).toEqual([]);
  });
});
