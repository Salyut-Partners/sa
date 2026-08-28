// What every template needs and none of them should own a copy of: reading a
// field out of a Spec, escaping it, the icons, and fitting a panel to the frame.
import type { FieldValue, TemplateSpec } from '../../core/types.ts';
import type { Accent } from '../color.ts';
import { clamp01 } from '../easing.ts';

/**
 * The size every template is laid out at, whatever the canvas turns out to be.
 * The ports were measured against this frame; scaling the whole layout is what
 * keeps a second output size a number rather than four re-measured layouts.
 */
export const DESIGN = { width: 1080, height: 1920 } as const;

/**
 * How far into a stretch of time `t` is, 0 before it and 1 after. Every template
 * animates by stacking these, which is what keeps a frame a pure function of `t`.
 */
export const seg = (t: number, start: number, span: number): number =>
  clamp01((t - start) / span);

export const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One field as a line. A list asked for as a line reads as a sentence. */
export const line = (spec: TemplateSpec, key: string): string => {
  const value: FieldValue | undefined = spec.fields[key];
  if (value === undefined) return '';
  return typeof value === 'string' ? value : value.join(' · ');
};

/** One field as items. A line asked for as items is one item. */
export const items = (spec: TemplateSpec, key: string): readonly string[] => {
  const value: FieldValue | undefined = spec.fields[key];
  if (value === undefined) return [];
  return typeof value === 'string' ? (value === '' ? [] : [value]) : value;
};

const ICONS: Record<string, string> = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7"/>',
  cloud: '<circle cx="8.6" cy="8.4" r="3.1"/><path d="M8.6 2.9v1.6M3.1 8.4h1.6M4.7 4.5l1.1 1.1M12.5 4.5l-1.1 1.1"/><path d="M17.4 20.6H9.9a3.9 3.9 0 0 1-.4-7.8 5.1 5.1 0 0 1 9.7 1.2 3.4 3.4 0 0 1-1.8 6.6Z"/>',
  moon: '<path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.7 6.7 0 0 0 11.1 11.1Z"/>',
  person: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  speech: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
};

/** Line art in the accent, at whatever size the layout asks for. */
export const icon = (name: keyof typeof ICONS | string, size: number, color: string): string =>
  `<svg class="cf-t-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
  `stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
  `${ICONS[name] ?? ''}</svg>`;

/** The shift icons, in the order a working day runs. */
export const SHIFT_ICONS = ['sun', 'cloud', 'moon'] as const;

/**
 * A white panel's accents: the same accent the buttons use, in the shades a
 * light card needs rather than the ones a button on a photo needs.
 */
export interface PanelInk {
  solid: string;
  soft: string;
  grad: string;
}

export const panelInk = (a: Accent): PanelInk => ({
  solid: a.base,
  soft: a.lift(0.82),
  grad: `linear-gradient(180deg,${a.lift(0.18)} 0%,${a.base} 55%,${a.dark(0.36)} 100%)`,
});

/**
 * Scale a panel down until it fits the frame, keeping `previous` when there is
 * nothing to measure against — a detached stage, or a panel inside a hidden box.
 * Answering 1 there would throw away a fit an earlier pass got right.
 *
 * Translations change how long the copy is, so the height is measured rather
 * than assumed: German runs a third longer than English, and a card laid out to
 * one hand-tuned size loses its last line in the other six locales.
 */
export function fitScale(panel: HTMLElement, room: number, previous: number): number {
  const height = panel.offsetHeight;
  if (height <= 0) return previous;
  return height > room ? room / height : 1;
}

/**
 * The two-tone bar along the top of a card: the accent, then a paler cut of it.
 * Both sheets wear one, and a stripe that drifted between them would read as a
 * different brand rather than a different layout.
 */
export const stripePaint = (a: Accent): string =>
  `linear-gradient(90deg,${a.base} 0%,${a.base} 34%,${a.lift(0.45)} 34%,${a.lift(0.45)} 100%)`;

/** The sheen sweep every CTA in the library runs, as a transform. */
export function sheenAt(t: number, width: number, sheenWidth: number, ease: (x: number) => number): string {
  const PERIOD = 2.4;
  const SPAN = 0.42;
  const cycle = (Math.max(0, t) % PERIOD) / PERIOD;
  if (t < 0 || cycle >= SPAN) return 'translateX(-3000px)';
  const q = ease(cycle / SPAN);
  return `translateX(${-sheenWidth - 40 + (width + sheenWidth + 200) * q}px) skewX(-18deg)`;
}
