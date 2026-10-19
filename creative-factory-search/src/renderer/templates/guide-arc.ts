// The guide cover: the photo keeps the top of the frame, and a white sheet
// rises over the bottom with an arched top edge drawn in the accent. On it, a
// small tag between two rules, the headline with its closing words in the
// accent on a line of their own, a quiet line under it, and a row of a round
// mark, the button and another round mark — the cover of a how-to booklet.
//
// It states the same headline as the photo panel, in the same keys, so a
// photo can be switched between the two without the words being typed again.
//
// The sheet is the frame's ground from its edge down, so it is not offered
// for moving.
import { accent } from '../color.ts';
import { easeInOutCubic, easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { fitAcross, fitScale, icon, line, say, seg, sheenAt } from './kit.ts';

const HEAD_SIZE = 104;
/** The most of the frame the copy may take before it is scaled down. */
const ROOM = 900;
const SHEEN_AT = 1.6;
const SHEEN_WIDTH = 120;

export function guideArc({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const tag = line(spec, 'hlTag');
  const sub = line(spec, 'gaSub');

  frame.innerHTML =
    '<div class="cf-ga">' +
      '<div class="dots l"></div><div class="dots r"></div>' +
      '<div class="in">' +
        (tag === '' ? '' : `<div class="tag"><i></i><span>${say(tag)}</span><i></i></div>`) +
        `<div class="hd">${say(line(spec, 'phHead'))}<span class="a">${say(line(spec, 'phAccent'))}</span></div>` +
        (sub === '' ? '' : `<div class="sub">${say(sub)}</div>`) +
        '<div class="act">' +
          `<div class="mk">${icon('spark', 60, '#fff')}</div>` +
          `<div class="go"><span>${say(line(spec, 'cta'))}</span><b class="sheen"></b></div>` +
          `<div class="mk">${icon('check', 60, '#fff')}</div>` +
        '</div>' +
      '</div>' +
    '</div>';

  const sheet = frame.querySelector<HTMLElement>('.cf-ga')!;
  const inner = frame.querySelector<HTMLElement>('.in')!;
  const tagEl = frame.querySelector<HTMLElement>('.tag');
  const rules = [...frame.querySelectorAll<HTMLElement>('.tag i')];
  const head = frame.querySelector<HTMLElement>('.hd')!;
  const subEl = frame.querySelector<HTMLElement>('.sub');
  const marks = [...frame.querySelectorAll<HTMLElement>('.mk')];
  const go = frame.querySelector<HTMLElement>('.go')!;
  const sheen = frame.querySelector<HTMLElement>('.sheen')!;

  sheet.style.borderTopColor = a.base;
  head.querySelector<HTMLElement>('.a')!.style.color = a.base;
  for (const dots of frame.querySelectorAll<HTMLElement>('.dots')) {
    dots.style.backgroundImage = `radial-gradient(${a.lift(0.35)} 3px,transparent 3.5px)`;
  }
  if (tagEl !== null) {
    tagEl.querySelector<HTMLElement>('span')!.style.background = a.base;
    for (const rule of rules) rule.style.background = a.lift(0.4);
  }
  go.style.background = `linear-gradient(180deg,${a.lift(0.15)} 0%,${a.dark(0.2)} 100%)`;
  go.style.boxShadow = `0 12px 30px rgba(${a.rgb},.45)`;
  for (const mark of marks) {
    mark.style.background = a.base;
    mark.style.boxShadow = `0 0 0 6px #fff,0 0 0 11px ${a.lift(0.45)}`;
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
      const rise = easeOutCubic(seg(t, 0, 0.6));
      sheet.style.transform = `translateY(${sheet.offsetHeight * (1 - rise)}px)`;

      if (tagEl !== null) {
        tagEl.style.opacity = String(easeOutCubic(seg(t, 0.35, 0.3)));
        const draw = easeOutCubic(seg(t, 0.45, 0.5));
        for (const rule of rules) rule.style.transform = `scaleX(${draw})`;
      }

      const copy = easeOutCubic(seg(t, 0.5, 0.5));
      head.style.opacity = String(copy);
      head.style.transform = `translateY(${40 * (1 - copy)}px)`;
      if (subEl !== null) subEl.style.opacity = String(easeOutCubic(seg(t, 0.8, 0.4)));

      const pop = easeOutBack(seg(t, 1, 0.5));
      go.style.opacity = String(easeOutCubic(seg(t, 1, 0.2)));
      go.style.transform = `scale(${0.6 + 0.4 * pop})`;
      marks.forEach((mark, i) => {
        const turn = easeOutBack(seg(t, 1.15 + i * 0.1, 0.5));
        mark.style.opacity = String(easeOutCubic(seg(t, 1.15 + i * 0.1, 0.2)));
        mark.style.transform = `scale(${turn}) rotate(${(i === 0 ? -90 : 90) * (1 - turn)}deg)`;
      });
      sheen.style.transform = sheenAt(t - SHEEN_AT, go.offsetWidth, SHEEN_WIDTH, easeInOutCubic);
    },
  };
}
