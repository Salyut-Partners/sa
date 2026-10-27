// The vacancy card, version one: a white panel that rises from the bottom of the
// frame, with the vacancies as pills and the shifts as three columns under line
// art. Ported from the predecessor's `banner` layout, the one it shipped with.
import { accent } from '../color.ts';
import { easeInOutCubic, easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import {
  DESIGN, fitScale, icon, items, line, panelInk, say, seg, sheenAt, SHIFT_ICONS,
} from './kit.ts';

/** How far above the bottom of the frame the panel sits, and what that leaves it. */
const OFFSET = 250;
const ROOM = DESIGN.height - OFFSET - 60;

export function cardPills({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const ink = panelInk(a);

  const pills = items(spec, 'jobs')
    .map(job => `<span class="pill">${say(job)}</span>`).join('');
  const shifts = items(spec, 'shifts').map((time, i) =>
    `<div class="shift">${icon(SHIFT_ICONS[i % 3]!, 44, a.base)}` +
    `<span class="tm">${say(time)}</span></div>`).join('');
  const perks = items(spec, 'perks').map((perk, i) =>
    `<div class="perk">${icon(i === 0 ? 'person' : i === 1 ? 'speech' : 'check', 27, a.base)}` +
    `${say(perk)}</div>`).join('');

  frame.innerHTML =
    '<div class="cf-t-tint"></div>' +
    '<div class="cf-card cf-pills-card">' +
      // Not on the layout this was ported from, which had no eyebrow. It is here
      // because the three cards share one schema by design, and a box in the
      // panel that draws nothing on the frame is a box that lies about the card.
      `<div class="eyebrow">${say(line(spec, 'eyebrow'))}</div>` +
      `<div class="head">${say(line(spec, 'headline'))}` +
        `<span class="flag">${say(line(spec, 'flag'))}</span></div>` +
      '<div class="rule"></div>' +
      `<div class="age">${say(line(spec, 'age'))}</div>` +
      `<div class="aud">${say(line(spec, 'audience'))}</div>` +
      '<div class="cf-rate">' +
        `<span class="big">${say(line(spec, 'rate'))}</span>` +
        `<span class="unit"><b>${say(line(spec, 'cur'))}</b> / ${say(line(spec, 'unitTop'))}` +
        `<br>${say(line(spec, 'unitBot'))}</span>` +
      '</div>' +
      `<div class="sec"><div class="sec-h">${say(line(spec, 'jobsLabel'))}` +
        '<span class="ln"></span><span class="dot"></span></div>' +
        `<div class="pills">${pills}</div></div>` +
      `<div class="sec"><div class="sec-h">${say(line(spec, 'shiftsLabel'))}` +
        '<span class="ln"></span><span class="dot"></span></div>' +
        `<div class="shifts">${shifts}</div></div>` +
      `<div class="perks">${perks}</div>` +
      `<div class="cf-cta">${say(line(spec, 'cta'))}` +
        icon('arrow', 46, '#fff') +
        '<div class="cf-sheen"></div></div>' +
      `<div class="cf-disc">${say(line(spec, 'disclaimer'))}</div>` +
    '</div>';

  const tint = frame.querySelector<HTMLElement>('.cf-t-tint')!;
  const card = frame.querySelector<HTMLElement>('.cf-card')!;
  const rate = frame.querySelector<HTMLElement>('.cf-rate')!;
  const cta = frame.querySelector<HTMLElement>('.cf-cta')!;
  const arrow = cta.querySelector<SVGElement>('svg')!;
  const sheen = frame.querySelector<HTMLElement>('.cf-sheen')!;
  const disc = frame.querySelector<HTMLElement>('.cf-disc')!;
  const shiftEls = [...frame.querySelectorAll<HTMLElement>('.shift')];

  tint.style.background =
    'linear-gradient(180deg,rgba(8,14,24,.34) 0%,rgba(8,14,24,.10) 34%,' +
    'rgba(8,14,24,.20) 60%,rgba(8,14,24,.62) 100%)';
  frame.querySelector<HTMLElement>('.age')!.style.color = ink.solid;
  const eyebrow = frame.querySelector<HTMLElement>('.eyebrow')!;
  eyebrow.style.color = a.dark(0.15);
  eyebrow.style.background = ink.soft;
  rate.style.background = ink.grad;
  cta.style.background = ink.grad;
  for (const el of frame.querySelectorAll<HTMLElement>('.sec-h')) el.style.color = ink.solid;
  for (const el of frame.querySelectorAll<HTMLElement>('.dot')) el.style.background = ink.solid;
  for (const el of frame.querySelectorAll<HTMLElement>('.pill')) {
    el.style.background = ink.solid;
    el.style.boxShadow = `0 5px 14px rgba(${a.rgb},.28)`;
  }

  const width = 976 - 68;
  const sheenWidth = Math.round(width * 0.7);
  sheen.style.width = sheenWidth + 'px';

  let scale = 1;
  let travel = 0;
  function fit(): void {
    scale = fitScale(card, ROOM, scale);
    card.style.transformOrigin = '50% 100%';
    // Far enough to clear the bottom of the frame at whatever height the copy
    // ended up, plus the shadow it casts on the way.
    travel = card.offsetHeight * scale + 160;
  }

  function render(t: number, enter: number): void {
    card.style.transform =
      `translateY(${travel * (1 - easeOutBack(enter))}px) scale(${scale})`;
    // The photo settles back as the card lands, so the panel is read against a
    // quieter frame than the one the eye arrived on.
    tint.style.opacity = String(0.55 + 0.45 * easeOutCubic(seg(t, 0, 1.0)));

    const breath = t > 0.85 ? (Math.sin((t - 0.85) * 2) + 1) / 2 : 0;
    rate.style.transform = `scale(${1 + 0.016 * breath})`;
    rate.style.boxShadow =
      `0 10px 26px rgba(${a.rgb},.34),0 0 ${(10 + 34 * breath).toFixed(1)}px ` +
      `rgba(${a.rgb},${(0.2 + 0.42 * breath).toFixed(3)})`;

    shiftEls.forEach((el, i) => {
      const s = t > 1 ? (Math.sin((t - 1) * 1.7 - i * 0.9) + 1) / 2 : 0;
      el.style.transform = `scale(${1 + 0.035 * s})`;
      el.style.opacity = String(0.72 + 0.28 * s);
    });

    const on = seg(t, 0.65, 0.28);
    const beat = t > 0.65 ? Math.sin((t - 0.65) * 3.6) : 0;
    cta.style.transform = `scale(${1 + 0.024 * beat * on})`;
    cta.style.boxShadow =
      `0 12px 30px rgba(${a.rgb},${(0.32 + 0.32 * ((beat + 1) / 2) * on).toFixed(3)})`;
    arrow.style.transform = `translateX(${7 * ((beat + 1) / 2) * on}px)`;
    sheen.style.transform = sheenAt(t - 0.65, width, sheenWidth, easeInOutCubic);

    disc.style.opacity = String(seg(t, 1.2, 0.7));
  }

  return { fit, render };
}
