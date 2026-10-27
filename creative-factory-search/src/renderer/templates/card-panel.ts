// The vacancy card, version two: a sheet with a two-tone stripe along the top,
// the vacancies as one line and the shifts side by side in boxes. Rises from the
// bottom like the first, but reads as a document rather than as a poster.
import { accent } from '../color.ts';
import { easeInOutCubic, easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import {
  DESIGN, fitScale, icon, items, line, money, panelInk, say, seg, sheenAt, SHIFT_ICONS,
  stripePaint,
} from './kit.ts';

const OFFSET = 150;
const ROOM = DESIGN.height - OFFSET - 60;
/** Perks past this many go full width: a two-column grid with an odd tail limps. */
const WIDE_FROM = 4;

export function cardPanel({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const ink = panelInk(a);

  const shifts = items(spec, 'shifts').map((time, i) =>
    `<div class="shift">${icon(SHIFT_ICONS[i % 3]!, 26, a.base)}` +
    `<span class="tm">${say(time)}</span></div>`).join('');
  const perks = items(spec, 'perks').map((perk, i) =>
    `<div class="perk${i >= WIDE_FROM ? ' wide' : ''}">` +
    `${icon('check', 24, a.base)}${say(perk)}</div>`).join('');

  frame.innerHTML =
    '<div class="cf-t-tint"></div>' +
    '<div class="cf-card cf-panel-card">' +
      '<div class="stripe"></div>' +
      `<div class="top"><span class="eyebrow">${say(line(spec, 'eyebrow'))}</span>` +
        `<span class="flag">${say(line(spec, 'flag'))}</span></div>` +
      `<div class="h1">${say(line(spec, 'headline'))}</div>` +
      `<div class="meta"><span class="chip">${say(line(spec, 'age'))}</span>` +
        `<span class="chip soft">${say(line(spec, 'audience'))}</span></div>` +
      '<div class="cf-rate">' +
        `<span class="big">${say(money(spec))}</span>` +
        `<span class="unit">${say(line(spec, 'unitTop'))}<br>${say(line(spec, 'unitBot'))}</span>` +
      '</div>' +
      `<div class="sec"><div class="sec-h">${say(line(spec, 'jobsLabel'))}</div>` +
        `<div class="sec-b">${say(line(spec, 'jobs'))}</div></div>` +
      `<div class="sec"><div class="sec-h">${say(line(spec, 'shiftsLabel'))}</div>` +
        `<div class="shifts">${shifts}</div></div>` +
      `<div class="perks">${perks}</div>` +
      `<div class="cf-cta">${say(line(spec, 'cta'))}<div class="cf-sheen"></div></div>` +
      `<div class="cf-disc">${say(line(spec, 'disclaimer'))}</div>` +
    '</div>';

  const tint = frame.querySelector<HTMLElement>('.cf-t-tint')!;
  const card = frame.querySelector<HTMLElement>('.cf-card')!;
  const rate = frame.querySelector<HTMLElement>('.cf-rate')!;
  const cta = frame.querySelector<HTMLElement>('.cf-cta')!;
  const sheen = frame.querySelector<HTMLElement>('.cf-sheen')!;
  const disc = frame.querySelector<HTMLElement>('.cf-disc')!;
  const shiftEls = [...frame.querySelectorAll<HTMLElement>('.shift')];

  tint.style.background =
    'linear-gradient(180deg,rgba(8,14,24,.34) 0%,rgba(8,14,24,.10) 34%,' +
    'rgba(8,14,24,.20) 62%,rgba(8,14,24,.62) 100%)';
  frame.querySelector<HTMLElement>('.stripe')!.style.background = stripePaint(a);
  const eyebrow = frame.querySelector<HTMLElement>('.eyebrow')!;
  eyebrow.style.color = a.dark(0.15);
  eyebrow.style.background = ink.soft;
  rate.style.border = `5px solid ${a.base}`;
  for (const el of frame.querySelectorAll<HTMLElement>('.sec-h')) el.style.color = ink.solid;
  cta.style.background = `linear-gradient(180deg,${a.base} 0%,${a.dark(0.28)} 100%)`;

  const width = 988 - 80;
  const sheenWidth = Math.round(width * 0.7);
  sheen.style.width = sheenWidth + 'px';

  let scale = 1;
  let travel = 0;
  function fit(): void {
    scale = fitScale(card, ROOM, scale);
    card.style.transformOrigin = '50% 100%';
    travel = card.offsetHeight * scale + 160;
  }

  function render(t: number, enter: number): void {
    card.style.transform =
      `translateY(${travel * (1 - easeOutBack(enter))}px) scale(${scale})`;
    tint.style.opacity = String(0.55 + 0.45 * easeOutCubic(seg(t, 0, 1.7)));

    const breath = t > 1.4 ? (Math.sin((t - 1.4) * 2) + 1) / 2 : 0;
    rate.style.transform = `scale(${1 + 0.016 * breath})`;
    rate.style.boxShadow =
      `0 0 ${(10 + 30 * breath).toFixed(1)}px rgba(${a.rgb},${(0.2 + 0.4 * breath).toFixed(3)})`;

    shiftEls.forEach((el, i) => {
      const s = t > 1.6 ? (Math.sin((t - 1.6) * 1.7 - i * 0.9) + 1) / 2 : 0;
      el.style.boxShadow = `0 0 0 ${(2.5 * s).toFixed(2)}px rgba(${a.rgb},${(0.3 * s).toFixed(3)})`;
    });

    const on = seg(t, 1.05, 0.3);
    const beat = t > 1.05 ? Math.sin((t - 1.05) * 3.6) : 0;
    cta.style.transform = `scale(${1 + 0.024 * beat * on})`;
    cta.style.boxShadow =
      `0 12px 30px rgba(${a.rgb},${(0.3 + 0.3 * ((beat + 1) / 2) * on).toFixed(3)})`;
    sheen.style.transform = sheenAt(t - 1.05, width, sheenWidth, easeInOutCubic);

    disc.style.opacity = String(seg(t, 1.8, 0.9));
  }

  return { fit, render };
}
