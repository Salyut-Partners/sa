// A dialog over the photo: the frame dims a little, and a white card pops in
// with a warning mark and a title, a line of text, and two buttons — the
// second in the accent, and lit up in turn once the card has settled, so the
// eye ends on it.
//
// What it says out of the box is a "did you know", not a warning. A dialog
// that tells the reader their phone or their data is at risk is a creative
// posing as the phone (CMP-016) and making a claim the article cannot back
// (CMP-003); the shape is the hook, the words have to stay honest.
//
// It is placed against the frame's middle, so it is not offered for moving.
import { accent } from '../color.ts';
import { easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { icon, line, say, seg } from './kit.ts';

const GLOW_AT = 1.2;
const BEAT = 1.4;

export function noticeAlert({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);

  frame.innerHTML =
    '<div class="cf-na-dim"></div>' +
    '<div class="cf-na">' +
      `<div class="ti">${icon('warn', 64, a.base)}<span>${say(line(spec, 'naTitle'))}</span></div>` +
      `<div class="bd">${say(line(spec, 'naText'))}</div>` +
      '<div class="btns">' +
        `<div class="no">${say(line(spec, 'naNo'))}</div>` +
        `<div class="yes">${say(line(spec, 'naYes'))}</div>` +
      '</div>' +
    '</div>';

  const dim = frame.querySelector<HTMLElement>('.cf-na-dim')!;
  const card = frame.querySelector<HTMLElement>('.cf-na')!;
  const yes = frame.querySelector<HTMLElement>('.yes')!;
  yes.style.color = a.base;

  return {
    fit: () => {},
    render(t: number): void {
      dim.style.opacity = String(easeOutCubic(seg(t, 0, 0.3)));
      // The phone's own pop: a touch too big, settling to size as it fades in.
      const pop = easeOutCubic(seg(t, 0.1, 0.35));
      card.style.opacity = String(pop);
      card.style.transform = `scale(${1.15 - 0.15 * pop})`;

      const beat = t > GLOW_AT ? 0.5 - 0.5 * Math.cos(2 * Math.PI * ((t - GLOW_AT) / BEAT)) : 0;
      yes.style.background = `rgba(${a.rgb},${0.16 * beat})`;
    },
  };
}
