// Wrong and right: glowing pills over the photo, the claims being set aside
// first — each on red, under a cross, and struck through once it has been
// read — then the ones that replace them on green, under a tick.
//
// The two colours are the one place in the library that does not take the
// accent. Red and green are what the cross and the tick mean, and a "right"
// pill painted in a red accent would be saying the opposite of its icon.
//
// Each pill is its own ground, so the stack darkens nothing and can be slid
// to wherever the photo leaves room.
import { easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { fitAcross, icon, items, say, seg } from './kit.ts';

const TEXT_SIZE = 44;
/** The stack's width, less a pill's icon, gap and padding: what its words get. */
const STACK = 960;
const TEXT_ROOM = 820;
const STEP = 0.18;
/** When the right pills start, once the wrong ones have been read and struck. */
const RIGHT_AT = 1.1;

const pill = (kind: 'no' | 'yes', text: string): string =>
  `<div class="pill ${kind}">${icon(kind === 'no' ? 'cross' : 'check', 46, '#fff')}` +
  `<span>${say(text)}<b class="strike"></b></span></div>`;

export function verdictPills({ spec, frame }: BuildContext): TemplateParts {
  const wrong = items(spec, 'vpWrong').filter(s => s.trim() !== '');
  const right = items(spec, 'vpRight').filter(s => s.trim() !== '');

  frame.innerHTML =
    '<div class="cf-vp">' +
      wrong.map(s => pill('no', s)).join('') +
      right.map(s => pill('yes', s)).join('') +
    '</div>';

  const stack = frame.querySelector<HTMLElement>('.cf-vp')!;
  const noes = [...frame.querySelectorAll<HTMLElement>('.pill.no')];
  const yeses = [...frame.querySelectorAll<HTMLElement>('.pill.yes')];
  const pills = [...noes, ...yeses];

  const arrive = (el: HTMLElement, at: number, t: number): void => {
    const pop = easeOutBack(seg(t, at, 0.45));
    el.style.opacity = String(easeOutCubic(seg(t, at, 0.2)));
    el.style.transform = `scale(${0.6 + 0.4 * pop})`;
  };

  return {
    fit(): void {
      const room = TEXT_ROOM * (stack.getBoundingClientRect().width / STACK);
      for (const p of pills) {
        p.style.transform = 'none';
        fitAcross(p.querySelector<HTMLElement>('span')!, room, TEXT_SIZE);
      }
    },
    render(t: number): void {
      noes.forEach((p, i) => {
        arrive(p, i * STEP, t);
        const strike = p.querySelector<HTMLElement>('.strike')!;
        strike.style.transform = `scaleX(${easeOutCubic(seg(t, 0.55 + i * STEP, 0.35))})`;
      });
      const rightAt = noes.length === 0 ? 0 : RIGHT_AT + (noes.length - 1) * STEP;
      yeses.forEach((p, i) => arrive(p, rightAt + i * STEP, t));
    },
  };
}
