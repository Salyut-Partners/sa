// Before and after: two round gauges side by side, the first filling red to
// its figure, then chevrons running across to the second, which fills green
// to its own — a headline on a dark plate above them and a button below.
//
// The level in each gauge is read off its figure, so "90%" stands nine-tenths
// full and a figure with no number in it stands half full rather than empty.
// Red and green are fixed for the reason the verdict pills' are: they say
// "before" and "after", and the button below carries the accent.
//
// Everything on it is its own ground, so the group can be slid to wherever
// the photo leaves room.
import { accent } from '../color.ts';
import { easeInOutCubic, easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { fitAcross, line, say, seg } from './kit.ts';

const HEAD_SIZE = 56;
/** A gauge's inside diameter, which the liquid's level is a share of. */
const DIAL = 280;
const FROM_AT = 0.4;
const TO_AT = 1.3;
const FILL = 0.9;
const GO_AT = 1.8;
/** One pass of the chevrons, and one beat of the button. */
const RUN = 0.9;
const BEAT = 1.2;

/** A figure's level as a share of full, or half for one with no number in it. */
function levelOf(text: string): number {
  const n = parseFloat(text.replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : 0.5;
}

const dial = (kind: 'from' | 'to', text: string): string =>
  `<div class="dial ${kind}"><div class="liq"></div><span>${say(text)}</span></div>`;

export function gaugeSwap({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const fromText = line(spec, 'gsFrom');
  const toText = line(spec, 'gsTo');

  frame.innerHTML =
    '<div class="cf-gs">' +
      `<div class="hd">${say(line(spec, 'gsHead'))}</div>` +
      '<div class="dials">' +
        dial('from', fromText) +
        '<div class="arw"><i></i><i></i><i></i></div>' +
        dial('to', toText) +
      '</div>' +
      `<div class="go">${say(line(spec, 'cta'))}</div>` +
    '</div>';

  const head = frame.querySelector<HTMLElement>('.hd')!;
  const [fromDial, toDial] = [...frame.querySelectorAll<HTMLElement>('.dial')] as [HTMLElement, HTMLElement];
  const fromLiq = fromDial.querySelector<HTMLElement>('.liq')!;
  const toLiq = toDial.querySelector<HTMLElement>('.liq')!;
  const chevrons = [...frame.querySelectorAll<HTMLElement>('.arw i')];
  const go = frame.querySelector<HTMLElement>('.go')!;
  const levels = { from: levelOf(fromText), to: levelOf(toText) };

  go.style.background = `linear-gradient(180deg,${a.lift(0.3)} 0%,${a.base} 55%,${a.dark(0.3)} 100%)`;
  go.style.boxShadow = `0 0 40px rgba(${a.rgb},.6),0 14px 30px rgba(0,0,0,.4)`;
  for (const c of chevrons) c.style.borderColor = a.lift(0.4);

  // The liquid is a large rounded square turning slowly behind the circle's
  // mask, so its top edge reads as a surface moving rather than a ruled line.
  const pour = (liq: HTMLElement, level: number, p: number, t: number): void => {
    const top = DIAL * (1 - level * p);
    liq.style.transform = `translateY(${top}px) rotate(${t * 80}deg)`;
  };

  return {
    fit: () => fitAcross(head, head.getBoundingClientRect().width * 0.92, HEAD_SIZE),
    render(t: number): void {
      const show = easeOutCubic(seg(t, 0, 0.4));
      head.style.opacity = String(show);
      head.style.transform = `translateY(${-30 * (1 - show)}px)`;

      [[fromDial, FROM_AT - 0.3], [toDial, TO_AT - 0.3]].forEach(([el, at]) => {
        const pop = easeOutBack(seg(t, at as number, 0.45));
        (el as HTMLElement).style.opacity = String(easeOutCubic(seg(t, at as number, 0.2)));
        (el as HTMLElement).style.transform = `scale(${0.5 + 0.5 * pop})`;
      });
      pour(fromLiq, levels.from, easeInOutCubic(seg(t, FROM_AT, FILL)), t);
      pour(toLiq, levels.to, easeInOutCubic(seg(t, TO_AT, FILL)), t);

      // The chevrons light one after another, pointing the eye from the first
      // gauge to the second, from when the first is full.
      const running = t >= FROM_AT + FILL * 0.6;
      const phase = (Math.max(0, t) % RUN) / RUN;
      chevrons.forEach((c, i) => {
        const lit = running ? Math.max(0, 1 - Math.abs(phase * 3 - i - 0.5)) : 0;
        c.style.opacity = String(running ? 0.3 + 0.7 * lit : 0);
      });

      const pop = easeOutBack(seg(t, GO_AT, 0.5));
      const beat = t > GO_AT + 0.5 ? 0.03 * Math.sin(2 * Math.PI * ((t - GO_AT) / BEAT)) : 0;
      go.style.opacity = String(easeOutCubic(seg(t, GO_AT, 0.2)));
      go.style.transform = `scale(${(0.6 + 0.4 * pop) * (1 + beat)})`;
    },
  };
}
