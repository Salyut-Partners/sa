// The broadcast plate: a rubric box and a white headline plate set into one
// bar of the accent, cut on a slant at the end the eye travels to, with a
// ticker line under it and a dot that blinks like a live light.
//
// The loudest of the news strips. It takes the accent across its whole width,
// so it is the one to reach for over a quiet photo — and, like the others, it
// carries its own ground and can be slid to wherever the picture leaves room.
import { accent } from '../color.ts';
import { easeInOutCubic, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { fitAcross, line, say, seg, sheenAt, wipe } from './kit.ts';

const HEAD_SIZE = 48;
/** When the glare first crosses the bar, once the plate has settled. */
const SHEEN_AT = 1.2;
const SHEEN_WIDTH = 140;
/** One blink of the live dot, in seconds. */
const BLINK = 1.2;

export function newsTv({ spec, frame, rtl }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const sub = line(spec, 'newsSub');

  frame.innerHTML =
    '<div class="cf-nw-tv">' +
      '<div class="top"><div class="row">' +
        `<div class="kick">${say(line(spec, 'newsKicker'))}</div>` +
        `<div class="plate"><div class="hd">${say(line(spec, 'newsHead'))}</div></div>` +
        '<div class="sheen"></div>' +
      '</div></div>' +
      (sub === '' ? '' : `<div class="sub"><i></i><span>${say(sub)}</span></div>`) +
    '</div>';

  const top = frame.querySelector<HTMLElement>('.top')!;
  const row = frame.querySelector<HTMLElement>('.row')!;
  const kick = frame.querySelector<HTMLElement>('.kick')!;
  const head = frame.querySelector<HTMLElement>('.hd')!;
  const sheen = frame.querySelector<HTMLElement>('.sheen')!;
  const subEl = frame.querySelector<HTMLElement>('.sub');
  const dot = subEl?.querySelector<HTMLElement>('i') ?? null;

  row.style.background =
    `linear-gradient(180deg,${a.lift(0.24)} 0%,${a.base} 48%,${a.dark(0.32)} 100%)`;
  row.style.boxShadow = `0 16px 40px rgba(${a.rgb},.38)`;
  if (dot !== null) dot.style.background = a.base;

  return {
    fit: () => fitAcross(head, head.getBoundingClientRect().width, HEAD_SIZE),
    render(t: number): void {
      top.style.clipPath = wipe(easeOutCubic(seg(t, 0, 0.6)), rtl);
      kick.style.opacity = String(easeOutCubic(seg(t, 0.3, 0.3)));

      const rise = easeOutCubic(seg(t, 0.45, 0.45));
      head.style.opacity = String(rise);
      head.style.transform = `translateY(${30 * (1 - rise)}px)`;

      // offsetWidth is in the frame's own units, which is what the sweep is in.
      sheen.style.transform = sheenAt(t - SHEEN_AT, row.offsetWidth, SHEEN_WIDTH, easeInOutCubic);

      if (subEl !== null) subEl.style.clipPath = wipe(easeOutCubic(seg(t, 0.85, 0.5)), rtl);
      if (dot !== null) {
        const beat = Math.max(0, t) % BLINK / BLINK;
        dot.style.opacity = String(0.3 + 0.7 * (0.5 + 0.5 * Math.cos(beat * 2 * Math.PI)));
      }
    },
  };
}
