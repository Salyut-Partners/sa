// The button library. Every entry is a recipe for how a button looks; none of
// them carries text, colour or position — those belong to the instance on the
// photo. Adding a style to the library is adding a record here.
import type { Accent } from './color.ts';

export interface ButtonStyle {
  id: string;
  label: string;
  /** Corner radius as a share of the button height. */
  radiusRatio: number;
  /** Outer rim thickness as a share of the button height. */
  padRatio: number;
  /** Letter spacing as a share of the font size. */
  letterRatio: number;
  arrow: boolean;
  rim: (a: Accent) => string;
  fill: (a: Accent) => string;
  gloss: string;
  textShadow: string;
  /** How hard the button pulses, 0 for a still button. */
  pulse: number;
}

export const BUTTON_STYLES: ButtonStyle[] = [
  {
    id: 'glow',
    label: 'Glow',
    radiusRatio: 0.234,
    padRatio: 0.051,
    letterRatio: 0.021,
    arrow: false,
    rim: a => `linear-gradient(160deg,${a.tint(0.92)} 0%,${a.tint(0.62)} 42%,${a.tint(0.3)} 100%)`,
    fill: a => `linear-gradient(180deg,${a.lift(0.22)} 0%,${a.base} 46%,${a.dark(0.42)} 100%)`,
    gloss:
      'linear-gradient(180deg,rgba(255,255,255,.30) 0%,rgba(255,255,255,.08) 46%,' +
      'rgba(255,255,255,0) 52%,rgba(0,0,0,.16) 100%)',
    textShadow: '0 5px 0 rgba(0,0,0,.30),0 0 22px rgba(0,0,0,.45)',
    pulse: 0.03,
  },
];

export const styleById = (id: string): ButtonStyle =>
  BUTTON_STYLES.find(s => s.id === id) ?? BUTTON_STYLES[0]!;
