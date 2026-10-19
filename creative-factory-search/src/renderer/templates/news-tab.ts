// The news strip: a rubric on a pale tab, a headline on a dark bar under it,
// and a line on white under that — the lower third of a news broadcast, laid
// over the photo rather than printed onto it.
//
// Like the tier strip, it carries its own ground and darkens nothing around
// it, so it can be slid up and down the frame to wherever the picture leaves
// room. It hangs off the edge the eye enters by, the way a broadcast strip
// hangs off the side of the screen, and is pulled across from there.
import { accent } from '../color.ts';
import { easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { fitAcross, inFrom, line, say, seg, wipe } from './kit.ts';

/** The headline size before a long word in a long language has had a say. */
const HEAD_SIZE = 60;

export function newsTab({ spec, frame, rtl }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const sub = line(spec, 'newsSub');

  frame.innerHTML =
    '<div class="cf-nw-tab">' +
      `<div class="tag"><i></i><span>${say(line(spec, 'newsKicker'))}</span></div>` +
      `<div class="bar"><div class="hd">${say(line(spec, 'newsHead'))}</div></div>` +
      (sub === '' ? '' : `<div class="sub">${say(sub)}</div>`) +
    '</div>';

  const tag = frame.querySelector<HTMLElement>('.tag')!;
  const bar = frame.querySelector<HTMLElement>('.bar')!;
  const head = frame.querySelector<HTMLElement>('.hd')!;
  const subEl = frame.querySelector<HTMLElement>('.sub');

  // The tab is the accent at its palest, so the dark rubric still reads on it;
  // the tick beside the rubric is the accent at full strength.
  tag.style.background = a.lift(0.72);
  tag.querySelector<HTMLElement>('i')!.style.background = a.base;

  return {
    fit: () => fitAcross(head, head.getBoundingClientRect().width, HEAD_SIZE),
    render(t: number): void {
      const tab = easeOutCubic(seg(t, 0, 0.5));
      tag.style.opacity = String(easeOutCubic(seg(t, 0, 0.3)));
      tag.style.transform = `translateX(${120 * inFrom(rtl) * (1 - tab)}px)`;

      bar.style.clipPath = wipe(easeOutCubic(seg(t, 0.15, 0.55)), rtl);

      const rise = easeOutCubic(seg(t, 0.45, 0.5));
      head.style.opacity = String(rise);
      head.style.transform = `translateY(${40 * (1 - rise)}px)`;

      if (subEl !== null) subEl.style.clipPath = wipe(easeOutCubic(seg(t, 0.8, 0.5)), rtl);
    },
  };
}
