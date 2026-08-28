// The vacancy card, version three: the same offer as a sheet at the top of the
// frame that unrolls downwards, in the largest type of the three. For a photo
// whose subject is at the bottom, where a panel rising from below covers it.
import { accent } from '../color.ts';
import { easeInOutCubic, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import {
  DESIGN, esc, fitScale, icon, items, line, panelInk, seg, sheenAt, SHIFT_ICONS, stripePaint,
} from './kit.ts';

const OFFSET = 140;
const ROOM = DESIGN.height - OFFSET - 80;

export function cardSheet({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const ink = panelInk(a);

  const shifts = items(spec, 'shifts').map((time, i) =>
    `<div class="shift">${icon(SHIFT_ICONS[i % 3]!, 38, a.base)}` +
    `<span class="tm">${esc(time)}</span></div>`).join('');
  const perks = items(spec, 'perks').map(perk =>
    `<div class="perk">${icon('check', 33, a.base)}${esc(perk)}</div>`).join('');

  frame.innerHTML =
    '<div class="cf-t-tint"></div>' +
    '<div class="cf-card cf-sheet-card">' +
      '<div class="stripe"></div>' +
      `<span class="eyebrow">${esc(line(spec, 'eyebrow'))}</span>` +
      `<div class="h1">${esc(line(spec, 'headline'))}` +
        `<span class="flag">${esc(line(spec, 'flag'))}</span></div>` +
      `<div class="meta"><span class="chip">${esc(line(spec, 'age'))}</span>` +
        `<span class="chip soft">${esc(line(spec, 'audience'))}</span></div>` +
      '<div class="cf-rate">' +
        `<span class="big">${esc(line(spec, 'rate'))} ${esc(line(spec, 'cur'))}</span>` +
        `<span class="unit">${esc(line(spec, 'unitTop'))}<br>${esc(line(spec, 'unitBot'))}</span>` +
      '</div>' +
      `<div class="sec"><div class="sec-h">${esc(line(spec, 'jobsLabel'))}</div>` +
        `<div class="sec-b">${esc(line(spec, 'jobs'))}</div></div>` +
      `<div class="sec"><div class="sec-h">${esc(line(spec, 'shiftsLabel'))}</div>` +
        `<div class="shifts">${shifts}</div></div>` +
      `<div class="perks">${perks}</div>` +
      `<div class="cf-cta">${esc(line(spec, 'cta'))}<div class="cf-sheen"></div></div>` +
      `<div class="cf-disc">${esc(line(spec, 'disclaimer'))}</div>` +
    '</div>';

  const tint = frame.querySelector<HTMLElement>('.cf-t-tint')!;
  const card = frame.querySelector<HTMLElement>('.cf-card')!;
  const rate = frame.querySelector<HTMLElement>('.cf-rate')!;
  const cta = frame.querySelector<HTMLElement>('.cf-cta')!;
  const sheen = frame.querySelector<HTMLElement>('.cf-sheen')!;
  const disc = frame.querySelector<HTMLElement>('.cf-disc')!;
  const shiftEls = [...frame.querySelectorAll<HTMLElement>('.shift')];

  // The sheet hangs from the top, so the frame is darkened from the top down.
  tint.style.background =
    'linear-gradient(0deg,rgba(8,14,24,.42) 0%,rgba(8,14,24,.26) 40%,rgba(8,14,24,.60) 100%)';
  frame.querySelector<HTMLElement>('.stripe')!.style.background = stripePaint(a);
  const eyebrow = frame.querySelector<HTMLElement>('.eyebrow')!;
  eyebrow.style.color = a.dark(0.15);
  eyebrow.style.background = ink.soft;
  rate.style.border = `6px solid ${a.base}`;
  for (const el of frame.querySelectorAll<HTMLElement>('.sec-h')) el.style.color = ink.solid;
  cta.style.background = `linear-gradient(180deg,${a.base} 0%,${a.dark(0.28)} 100%)`;

  const width = 988 - 92;
  const sheenWidth = Math.round(width * 0.7);
  sheen.style.width = sheenWidth + 'px';

  let scale = 1;
  function fit(): void {
    scale = fitScale(card, ROOM, scale);
    card.style.transformOrigin = '50% 0%';
    card.style.transform = `scale(${scale})`;
  }

  function render(t: number, enter: number): void {
    // The signature entrance: the sheet is drawn on rather than moved in. The
    // rounding has to be repeated in the clip or the corners square off mid-roll.
    const roll = easeOutCubic(enter);
    card.style.clipPath = `inset(0 0 ${(100 - 100 * roll).toFixed(2)}% 0 round 38px)`;
    // Not from the entrance: the sheet is opaque, and fading it in as well would
    // show the photo through the copy for the first half-second.
    card.style.opacity = enter > 0 ? '1' : '0';
    tint.style.opacity = String(0.4 + 0.42 * easeOutCubic(seg(t, 0, 1.7)));

    const breath = t > 1.8 ? (Math.sin((t - 1.8) * 2) + 1) / 2 : 0;
    rate.style.transform = `scale(${1 + 0.018 * breath})`;
    rate.style.boxShadow =
      `0 0 ${(12 + 34 * breath).toFixed(1)}px rgba(${a.rgb},${(0.2 + 0.42 * breath).toFixed(3)})`;

    shiftEls.forEach((el, i) => {
      const s = t > 2.1 ? (Math.sin((t - 2.1) * 1.7 - i * 0.9) + 1) / 2 : 0;
      el.style.boxShadow = `0 0 0 ${(2.5 * s).toFixed(2)}px rgba(${a.rgb},${(0.3 * s).toFixed(3)})`;
    });

    const on = seg(t, 1.45, 0.3);
    const beat = t > 1.45 ? Math.sin((t - 1.45) * 3.6) : 0;
    cta.style.transform = `scale(${1 + 0.026 * beat * on})`;
    cta.style.boxShadow =
      `0 14px 34px rgba(${a.rgb},${(0.3 + 0.3 * ((beat + 1) / 2) * on).toFixed(3)})`;
    sheen.style.transform = sheenAt(t - 1.45, width, sheenWidth, easeInOutCubic);

    disc.style.opacity = String(seg(t, 2.5, 0.9));
  }

  return { fit, render };
}
