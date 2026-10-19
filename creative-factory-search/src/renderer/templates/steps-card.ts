// The how-to: a white card hanging from the top of the frame with the
// headline on it, numbered steps stuck over the photo below it, each a little
// off square and a little further in than the one above, and an optional
// round badge in the accent beside them.
//
// It is laid out from the top edge down, so it is not offered for moving.
import { accent } from '../color.ts';
import { easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { fitAcross, inFrom, items, line, say, seg } from './kit.ts';

const STEP_SIZE = 44;
/** The steps column, and what a step's words get once the number is beside them. */
const COLUMN = 860;
const STEP_ROOM = 640;
const STEPS_AT = 0.5;
const STEP_GAP = 0.2;

export function stepsCard({ spec, frame, rtl }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const steps = items(spec, 'stSteps').filter(s => s.trim() !== '');
  const badge = line(spec, 'stBadge');

  frame.innerHTML =
    '<div class="cf-st">' +
      `<div class="head"><div class="hd">${say(line(spec, 'stHead'))}</div></div>` +
      '<div class="steps">' +
        steps.map((s, i) =>
          `<div class="step" style="margin-inline-start:${i * 44}px">` +
          `<b>${i + 1}</b><span>${say(s)}</span></div>`).join('') +
      '</div>' +
      (badge === '' ? '' : `<div class="badge"><span>${say(badge)}</span></div>`) +
    '</div>';

  const head = frame.querySelector<HTMLElement>('.head')!;
  const column = frame.querySelector<HTMLElement>('.steps')!;
  const stepEls = [...frame.querySelectorAll<HTMLElement>('.step')];
  const badgeEl = frame.querySelector<HTMLElement>('.badge');

  head.style.borderBottom = `10px solid ${a.base}`;
  for (const step of stepEls) {
    step.querySelector<HTMLElement>('b')!.style.background =
      `linear-gradient(180deg,${a.lift(0.2)} 0%,${a.dark(0.2)} 100%)`;
  }
  if (badgeEl !== null) {
    badgeEl.style.background = a.base;
    badgeEl.style.boxShadow = `0 16px 40px rgba(${a.rgb},.5)`;
  }

  const tilt = (i: number): number => (i % 2 === 0 ? -2 : 1.5);

  return {
    fit(): void {
      const room = STEP_ROOM * (column.getBoundingClientRect().width / COLUMN);
      for (const step of stepEls) {
        step.style.transform = 'none';
        fitAcross(step.querySelector<HTMLElement>('span')!, room, STEP_SIZE);
      }
    },
    render(t: number): void {
      const drop = easeOutCubic(seg(t, 0, 0.6));
      head.style.transform = `translateY(${-100 * (1 - drop)}%)`;

      stepEls.forEach((step, i) => {
        const at = STEPS_AT + i * STEP_GAP;
        const slide = easeOutBack(seg(t, at, 0.5));
        step.style.opacity = String(easeOutCubic(seg(t, at, 0.25)));
        step.style.transform =
          `translateX(${200 * inFrom(rtl) * (1 - slide)}px) rotate(${tilt(i)}deg)`;
      });

      if (badgeEl !== null) {
        const at = STEPS_AT + stepEls.length * STEP_GAP;
        const pop = easeOutBack(seg(t, at, 0.5));
        badgeEl.style.opacity = String(easeOutCubic(seg(t, at, 0.2)));
        badgeEl.style.transform = `scale(${pop}) rotate(${-10 + 6 * (1 - pop)}deg)`;
      }
    },
  };
}
