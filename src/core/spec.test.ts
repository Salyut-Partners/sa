import { describe, expect, it } from 'vitest';
import { apply, createProject, defaultButton } from './project.ts';
import { buildSpec } from './spec.ts';
import type { Project } from './types.ts';

function projectWithButton(): Project {
  let p = apply(createProject(), {
    type: 'photo/add', photo: { id: 'a', name: 'a.jpg', image: 'data:image/jpeg;base64,zz' },
  });
  p = apply(p, { type: 'photo/patch', ids: ['a'], patch: { accent: '#123456', pushIn: false } });
  return apply(p, {
    type: 'button/add',
    ids: ['a'],
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

  it('follows the canvas when it changes instead of assuming 1080x1920', () => {
    const p = apply(projectWithButton(), {
      type: 'project/patch', patch: { canvas: { width: 540, height: 960 } },
    });
    expect(buildSpec(p, 'a')!.buttons[0]!.rect).toEqual({ x: 54, y: 480, w: 270, h: 96 });
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
      type: 'button/add', ids: ['a'],
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
