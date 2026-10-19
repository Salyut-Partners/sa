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

/**
 * A figure: digits, and the separators that join two of them into one number,
 * one range or one clock time. A trailing plus or per-cent belongs to it too.
 *
 * The separators only count between digits, which is what keeps "10 men and 20
 * women" three words rather than one figure.
 */
const FIGURE = /\d+(?:[\s.,:'\u2013\u2014/-]+\d+)*[+%]?/gu;

/**
 * One phrase, as markup a frame can hold: escaped, and with its figures pinned
 * to read left to right.
 *
 * The second half is for Hebrew and for whatever right-to-left language comes
 * after it. A number does not turn round — "18–25" is eighteen to twenty-five
 * in every language on the list — but the dash between the two digits is a
 * neutral, so a right-to-left frame resolves it to its own direction and paints
 * the band as "25–18". The same goes for "07:00–15:00" and for a price range.
 *
 * Done here, in the one function every template's copy already passes through,
 * for three reasons. Two of the fields it saves are in the shared half of the
 * phrase book and appear in all twelve languages, so there is no Hebrew string
 * to fix. A layout cannot forget it. And the text a user types over the
 * dictionary comes through here as well, which no rule written against a
 * stylesheet selector could reach — an age band typed into the box in Hebrew is
 * right without the user knowing any of this.
 *
 * In a left-to-right frame the wrapper changes nothing: `bdi` is inline, and an
 * isolated left-to-right run inside a left-to-right paragraph reads as it did.
 */
export const say = (value: string): string =>
  value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(FIGURE, figure => `<bdi dir="ltr">${figure}</bdi>`);

/** One field as a line. A list asked for as a line reads as a sentence. */
export const line = (spec: TemplateSpec, key: string): string => {
  const value: FieldValue | undefined = spec.fields[key];
  if (value === undefined) return '';
  return typeof value === 'string' ? value : value.join(' · ');
};

/**
 * Currencies that are written before the figure rather than after it.
 *
 * Most of the book's money follows the number — 18–24 €, 35–50 zł, 200–270 kr,
 * 250–400 ₺ — and the pound does not. "15–20 £" is exactly the sort of detail
 * that tells a British reader the advert was written for somewhere else, which
 * is the whole thing the language list exists to avoid. The rule belongs to the
 * symbol rather than to the language: two locales quoting pounds would both
 * want it, and a locale that switched currency would carry it across.
 */
const LEADING = new Set(['£', '$']);

/**
 * The pay figure with its currency, in the order that currency is written in.
 *
 * Here rather than in each layout: three templates draw this same pair, and a
 * rule kept in three places is a rule that will hold in two of them.
 */
export const money = (spec: TemplateSpec): string => {
  const figure = line(spec, 'rate');
  const symbol = line(spec, 'cur');
  if (symbol === '') return figure;
  return LEADING.has(symbol) ? symbol + figure : figure + ' ' + symbol;
};

/**
 * Which side a layer slides in from, as a sign on a distance.
 *
 * Everything in this library enters from the side the reader's eye starts on,
 * which is the left in eleven of the twelve languages and the right in Hebrew.
 * A sign rather than two branches: how far a row travels is a decision each
 * layout made once and should keep stating once, and only which way it goes is
 * the frame's business.
 */
export const inFrom = (rtl: boolean): number => rtl ? 1 : -1;

/**
 * A clip that uncovers a block from the side the reader's eye starts on, `p`
 * of the way across. The news strips draw themselves this way — a lower third
 * is laid on the picture by being pulled across it — and in Hebrew it is pulled
 * the other way.
 */
export const wipe = (p: number, rtl: boolean): string => {
  if (p >= 1) return 'none';
  const hidden = 100 * (1 - clamp01(p));
  return rtl ? `inset(0 0 0 ${hidden}%)` : `inset(0 ${hidden}% 0 0)`;
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
  shield: '<path d="M12 2.7 4.7 5.8v5.5c0 4.6 3.1 8.8 7.3 10 4.2-1.2 7.3-5.4 7.3-10V5.8Z"/><path d="m8.8 11.9 2.3 2.3 4.2-4.6"/>',
  lock: '<rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2.6"/><path d="M8.3 10.4V7.7a3.7 3.7 0 0 1 7.4 0v2.7"/>',
  heart: '<path d="M12 20.8 4.8 13.9a4.5 4.5 0 0 1 6.4-6.3l.8.8.8-.8a4.5 4.5 0 0 1 6.4 6.3Z"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  spark: '<path d="M12 3.2l1.9 5.6 5.6 1.9-5.6 1.9L12 18.2l-1.9-5.6-5.6-1.9 5.6-1.9Z"/><path d="M19 15.5v4M17 17.5h4"/>',
  warn: '<path d="M12 3.2 2.4 20h19.2Z"/><path d="M12 9.6v4.8M12 17.2v.2"/>',
};

/**
 * The badge icons, in the order the claims are made: who is asking, then what
 * they promise. Positional like the shift icons — a list the user lengthens
 * cycles back to the start rather than running out of pictures.
 */
export const BADGE_ICONS = ['shield', 'lock', 'check'] as const;

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
 * Set a title's size, shrinking it until its longest line fits `room` across.
 *
 * Only titles need this, and only on the layouts with no card under them. A card
 * wraps its title inside a white sheet, so a word too long for the column simply
 * takes more of the sheet; a title on the bare photo has nothing past its edge,
 * so the word runs out into the picture and stops being readable. German and
 * Dutch compounds do this routinely — "Flughafenpersonal" is one unbreakable
 * word a third wider than a 600px column.
 *
 * One pass is exact: a word's width is linear in its font size.
 */
export function fitAcross(el: HTMLElement, room: number, size: number): void {
  el.style.fontSize = size + 'px';
  const over = overrun(el, room);
  if (over > 1) el.style.fontSize = Math.floor(size / over) + 'px';
}

/**
 * How far the longest line an element painted runs past `room`, as a ratio — 1
 * or less when it fits.
 *
 * The element's own width is no use as the yardstick: a word too long to break
 * widens the block it is in rather than spilling out of it, so the box and the
 * ink agree with each other and both are wrong. `room` has to come from the
 * column instead.
 *
 * And the lines are measured rather than the block, because which of those two
 * an overlong word widens is up to the engine. A range over the contents asks
 * for what was actually painted, which every engine answers the same way. Both
 * figures are read as rendered rects, so the ratio survives the frame being
 * scaled down to a grid cell or a library thumbnail.
 *
 * The rects are gathered into lines rather than taken one at a time, because a
 * line does not always come back as one rect: text broken by anything with its
 * own direction — an isolated figure, chiefly — is returned a run at a time.
 * Reading the widest rect would then measure a fragment and pronounce the whole
 * line a comfortable fit. That is not hypothetical; it let a Hebrew payment run
 * 37px off its card, and it would have been quietly wrong in the other eleven
 * languages too, since every one of them has a price in it somewhere.
 */
function overrun(el: HTMLElement, room: number): number {
  if (room <= 0) return 1;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);

  // Same line, in the only sense that matters here: the two rects overlap
  // vertically. Grouping by the top edge instead would split a line whose runs
  // are set at different sizes, which is the case this exists to catch.
  const lines: { top: number; bottom: number; left: number; right: number }[] = [];
  for (const rect of range.getClientRects()) {
    if (rect.width < 0.5) continue;
    const line = lines.find(l => rect.top < l.bottom && rect.bottom > l.top);
    if (line === undefined) {
      lines.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
    } else {
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
    }
  }

  let widest = 0;
  for (const line of lines) widest = Math.max(widest, line.right - line.left);
  return widest > 0 ? widest / room : 1;
}

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
