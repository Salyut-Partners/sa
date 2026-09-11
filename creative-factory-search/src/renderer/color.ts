// One accent colour expands into the family of shades a button needs. Kept
// here rather than in the style records so every style derives its shades the
// same way and a hand-picked colour never fights the preset.

import { clamp } from '../core/canvas.ts';

export interface Accent {
  base: string;
  /** "r,g,b" — for rgba() in shadows. */
  rgb: string;
  /** Toward white. */
  lift: (k: number) => string;
  /** Toward black. */
  dark: (k: number) => string;
  /** A pale rim shade. */
  tint: (k: number) => string;
}

export function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  const full = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number];
}

export const rgbToHex = (c: readonly number[]): string =>
  '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

export function accent(hex: string): Accent {
  const base = hexToRgb(hex);
  return {
    base: hex,
    rgb: base.join(','),
    lift: k => rgbToHex(base.map(v => v + (255 - v) * k)),
    dark: k => rgbToHex(base.map(v => v * (1 - k))),
    tint: k => rgbToHex(base.map(v => v + (255 - v) * (0.55 + 0.45 * k))),
  };
}
