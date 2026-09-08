// The vacancy offer with no card under it: the copy runs straight down the photo
// and a scrim darkening that side is the only thing making it readable.
//
// The scrim is the layout. The three cards drop a white sheet between the words
// and the picture — safe on any photo, and it hides most of one. This one darkens
// only the column the copy runs down and leaves the rest of the frame alone, so
// whoever is in the photo stays in the creative. That is why the scrim is drawn
// across rather than down: a bottom-up gradient would swallow the subject, who
// in a stock photo of somebody at work is almost always standing to one side.
//
// It also has to arrive rather than be stamped on. A frame that starts dark
// reads as a badly exposed photo; a frame that darkens under arriving text reads
// as the effect it is.
import { accent } from '../color.ts';
import { easeInOutCubic, easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import {
  DESIGN, fitAcross, fitScale, icon, inFrom, items, line, money, say, seg, sheenAt,
} from './kit.ts';

/**
 * The copy column, as the stylesheet places it: 132px down, 600 wide. Repeated
 * here because the fit needs the room left under it and the sheen needs the
 * width to sweep, and neither can ask the layout for a number it has not been
 * laid out to yet.
 */
const TOP = 132;
const COLUMN = 600;
const ROOM = DESIGN.height - TOP - 130;

/** When each band of the copy starts arriving. */
const HEAD_AT = 0.1;
const RATE_AT = 0.62;
const PERKS_AT = 0.95;
const CTA_AT = 1.5;

/** How long the darkening takes to reach full strength. */
const SCRIM_SPAN = 1.6;

/**
 * The title's size before any locale has had a say in it. Here rather than in
 * the stylesheet with the other sizes because the fit writes over it, and a
 * number declared in two places is a number that stops agreeing with itself.
 */
const HEAD_SIZE = 92;

export function scrimColumn({ spec, frame, rtl }: BuildContext): TemplateParts {
  const a = accent(spec.color);

  // The pill states who is wanted and at what age, which are two fields and one
  // sentence. Joined only where both are there: an empty one must not leave the
  // separator behind as a dot floating in a pill on its own.
  const badge = [line(spec, 'eyebrow'), line(spec, 'age')]
    .filter(part => part.trim() !== '').join(' · ');

  const perks = items(spec, 'perks').map(perk =>
    `<div class="perk">${icon('check', 38, a.lift(0.3))}<span>${say(perk)}</span></div>`).join('');

  frame.innerHTML =
    '<div class="cf-t-tint cf-sc-scrim"></div>' +
    `<div class="cf-sc-flag">${say(line(spec, 'flag'))}</div>` +
    '<div class="cf-sc-col">' +
      `<span class="eyebrow">${say(badge)}</span>` +
      `<div class="h1">${say(line(spec, 'headline'))}</div>` +
      `<div class="aud">${say(line(spec, 'audience'))}</div>` +
      '<div class="cf-sc-rate">' +
        `<span class="top"><span class="big">${say(money(spec))}</span>` +
          `<span class="u">${say(line(spec, 'unitTop'))}</span></span>` +
        `<span class="bot">${say(line(spec, 'unitBot'))}</span>` +
      '</div>' +
      `<div class="perks">${perks}</div>` +
      `<div class="cf-sc-cta">${say(line(spec, 'cta'))}${icon('arrow', 46, '#fff')}` +
        '<span class="cf-sc-sheen"></span></div>' +
    '</div>';

  const scrim = frame.querySelector<HTMLElement>('.cf-sc-scrim')!;
  const col = frame.querySelector<HTMLElement>('.cf-sc-col')!;
  const flag = frame.querySelector<HTMLElement>('.cf-sc-flag')!;
  const eyebrow = frame.querySelector<HTMLElement>('.eyebrow')!;
  const head = frame.querySelector<HTMLElement>('.h1')!;
  const aud = frame.querySelector<HTMLElement>('.aud')!;
  const rate = frame.querySelector<HTMLElement>('.cf-sc-rate')!;
  const cta = frame.querySelector<HTMLElement>('.cf-sc-cta')!;
  const sheen = frame.querySelector<HTMLElement>('.cf-sc-sheen')!;
  const perkEls = [...frame.querySelectorAll<HTMLElement>('.perk')];

  // Solid across the copy, gone by two thirds. The second stop sits close to the
  // first so the wall of dark has an edge to it rather than dissolving into a
  // haze across the whole frame, and the last one lifts the far corner just
  // enough to seat the flag.
  scrim.style.background =
    'linear-gradient(90deg,rgba(6,10,18,.94) 0%,rgba(6,10,18,.9) 42%,' +
    'rgba(6,10,18,.72) 58%,rgba(6,10,18,.2) 74%,rgba(6,10,18,.03) 88%,' +
    'rgba(6,10,18,.14) 100%)';

  eyebrow.style.background = `linear-gradient(180deg,${a.lift(0.16)},${a.dark(0.2)})`;
  rate.querySelector<HTMLElement>('.big')!.style.color = a.dark(0.12);
  cta.style.background = `linear-gradient(180deg,${a.lift(0.14)} 0%,${a.dark(0.26)} 100%)`;

  const sheenWidth = Math.round(COLUMN * 0.7);
  sheen.style.width = sheenWidth + 'px';

  let scale = 1;
  /**
   * Shrink the copy until it clears the frame — across first, then down.
   *
   * Across matters here in a way it does not on a card: the title has a scrim
   * under it and nothing past the edge of it, so a word wider than the column
   * runs out into the bright half of the photo. See `fitAcross`.
   *
   * Down is the ordinary reason every panel in this library measures itself:
   * "Znajomość języka niewymagana" is half again the length of "No language
   * skills required", and five perks laid out to one hand-tuned height lose
   * their last line in the other six locales.
   */
  function fit(): void {
    col.style.transform = 'none';
    fitAcross(head, col.getBoundingClientRect().width, HEAD_SIZE);
    scale = fitScale(col, ROOM, scale);
    col.style.transform = `scale(${scale})`;
  }

  function render(t: number): void {
    scrim.style.opacity = String(0.3 + 0.7 * easeOutCubic(seg(t, 0, SCRIM_SPAN)));

    // The head block reads top to bottom, so it arrives that way: pill, title,
    // audience, each a beat behind the one above it.
    [eyebrow, head, aud].forEach((el, i) => {
      const p = easeOutCubic(seg(t, HEAD_AT + i * 0.18, 0.5));
      el.style.opacity = String(p);
      el.style.transform = `translateX(${60 * inFrom(rtl) * (1 - p)}px)`;
    });
    flag.style.opacity = String(easeOutCubic(seg(t, HEAD_AT, 0.7)));

    const r = easeOutBack(seg(t, RATE_AT, 0.6));
    rate.style.opacity = String(easeOutCubic(seg(t, RATE_AT, 0.4)));
    // The figure is the offer, so it keeps breathing after it lands.
    const breath = t > RATE_AT + 0.9 ? (Math.sin((t - RATE_AT - 0.9) * 2) + 1) / 2 : 0;
    rate.style.transform = `scale(${(0.9 + 0.1 * r) * (1 + 0.014 * breath)})`;
    rate.style.boxShadow =
      `0 18px 46px rgba(0,0,0,.34),0 0 ${(8 + 26 * breath).toFixed(1)}px ` +
      `rgba(${a.rgb},${(0.16 + 0.36 * breath).toFixed(3)})`;

    perkEls.forEach((perk, i) => {
      const p = easeOutCubic(seg(t, PERKS_AT + i * 0.14, 0.46));
      perk.style.opacity = String(p);
      perk.style.transform = `translateX(${52 * inFrom(rtl) * (1 - p)}px)`;
    });

    const on = seg(t, CTA_AT, 0.3);
    const up = easeOutBack(seg(t, CTA_AT, 0.6));
    const beat = t > CTA_AT ? Math.sin((t - CTA_AT) * 3.6) : 0;
    cta.style.opacity = String(easeOutCubic(seg(t, CTA_AT, 0.4)));
    cta.style.transform =
      `translateY(${44 * (1 - up)}px) scale(${1 + 0.024 * beat * on})`;
    cta.style.boxShadow =
      `0 14px 34px rgba(${a.rgb},${(0.3 + 0.3 * ((beat + 1) / 2) * on).toFixed(3)})`;
    sheen.style.transform = sheenAt(t - CTA_AT, COLUMN, sheenWidth, easeInOutCubic);
  }

  return { fit, render };
}
