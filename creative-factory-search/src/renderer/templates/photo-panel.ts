// The photo and the page: the picture keeps the top of the frame, and a white
// sheet rises over the bottom of it carrying the headline in tall capitals —
// its last words in the accent — and one underlined line under it, the way an
// article's teaser sits under its lead picture.
//
// The sheet is the frame's ground from its edge down, so it is not offered for
// moving: lifted, it would bare a strip of photo under its own bottom edge.
import { accent } from '../color.ts';
import { easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { fitAcross, fitScale, line, say, seg } from './kit.ts';

const HEAD_SIZE = 96;
/**
 * The most of the frame the copy may take before it is scaled down: past this,
 * the sheet would climb over the half of the frame the photo is there to fill.
 */
const ROOM = 860;

export function photoPanel({ spec, frame, rtl }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const link = line(spec, 'phLink');

  frame.innerHTML =
    '<div class="cf-pp">' +
      '<div class="rule"></div>' +
      '<div class="in">' +
        `<div class="hd">${say(line(spec, 'phHead'))} <span class="a">${say(line(spec, 'phAccent'))}</span></div>` +
        (link === '' ? '' : `<div class="lk"><span>${say(link)}</span></div>`) +
      '</div>' +
    '</div>';

  const sheet = frame.querySelector<HTMLElement>('.cf-pp')!;
  const inner = frame.querySelector<HTMLElement>('.in')!;
  const head = frame.querySelector<HTMLElement>('.hd')!;
  const linkEl = frame.querySelector<HTMLElement>('.lk span');

  frame.querySelector<HTMLElement>('.rule')!.style.background = a.base;
  head.querySelector<HTMLElement>('.a')!.style.color = a.base;
  if (linkEl !== null) {
    linkEl.style.color = a.dark(0.2);
    linkEl.style.backgroundImage = `linear-gradient(${a.base},${a.base})`;
    linkEl.style.backgroundPosition = rtl ? 'right bottom' : 'left bottom';
  }

  let scale = 1;

  return {
    fit(): void {
      inner.style.transform = 'none';
      fitAcross(head, head.getBoundingClientRect().width, HEAD_SIZE);
      scale = fitScale(inner, ROOM, scale);
      inner.style.transform = `scale(${scale})`;
    },
    render(t: number): void {
      // Rises its own height, so it comes from below the frame whatever the
      // language made that height.
      const rise = easeOutCubic(seg(t, 0, 0.6));
      sheet.style.transform = `translateY(${sheet.offsetHeight * (1 - rise)}px)`;

      const copy = easeOutCubic(seg(t, 0.4, 0.5));
      head.style.opacity = String(copy);
      head.style.transform = `translateY(${40 * (1 - copy)}px)`;

      if (linkEl !== null) {
        linkEl.style.opacity = String(easeOutCubic(seg(t, 0.8, 0.3)));
        linkEl.style.backgroundSize = `${100 * easeOutCubic(seg(t, 1, 0.5))}% 5px`;
      }
    },
  };
}
