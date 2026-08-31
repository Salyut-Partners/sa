// The payment offer: a question, one figure, and the slider that picked it.
//
// The slider is the layout, and it is the one element in the library that has to
// mean something rather than only be drawn. Its knob rests where the payment
// actually falls between the two ends of the scale, read back out of the three
// fields as numbers — so a user who raises the payment sees the knob move, and
// nobody has to keep a hand-set position agreeing with a typed figure.
//
// It also runs to that position rather than starting there. A slider already at
// rest is a picture of a control; a slider travelling to its answer is the offer
// being made, which is the whole reason this creative wears one.
import { amountOf, counterFor } from '../../core/money.ts';
import { accent } from '../color.ts';
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { DESIGN, esc, fitAcross, fitScale, icon, line, seg, sheenAt } from './kit.ts';

/** Where the copy block starts, and the room it has before the button. */
const TOP = 56;
const FOOT = 300;
const ROOM = DESIGN.height - TOP - FOOT;

/** The button's width, which the sheen has to sweep. */
const CTA_WIDTH = 790;

/** When each band arrives. */
const SUB_AT = 0.3;
const CARD_AT = 0.55;
const SLIDE_AT = 1.05;
const SLIDE_SPAN = 0.95;
const CTA_AT = 1.7;

/** Where the knob sits when the three figures do not read as numbers. */
const FALLBACK_AT = 0.29;

/**
 * The headline's size before any locale has had a say in it. Here rather than in
 * the stylesheet with the other sizes because the fit writes over it, and a
 * number declared in two places is a number that stops agreeing with itself.
 */
const HEAD_SIZE = 104;

export function rateSlider({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);

  frame.innerHTML =
    '<div class="cf-t-tint cf-pay-veil"></div>' +
    '<div class="cf-pay-top">' +
      `<div class="head">${esc(line(spec, 'payHead'))} ` +
        `<span class="ac">${esc(line(spec, 'payHeadAccent'))}</span></div>` +
      `<div class="sub">${esc(line(spec, 'paySub'))}</div>` +
      '<div class="cf-pay-card">' +
        `<div class="lbl">${esc(line(spec, 'payRateLabel'))}</div>` +
        `<div class="amt">${esc(line(spec, 'payRate'))}</div>` +
        '<div class="rule"></div>' +
        `<div class="slbl">${esc(line(spec, 'paySliderLabel'))}</div>` +
        '<div class="track"><span class="fill"></span><span class="knob"></span></div>' +
        `<div class="ends"><span>${esc(line(spec, 'payMin'))}</span>` +
          `<span>${esc(line(spec, 'payMax'))}</span></div>` +
      '</div>' +
    '</div>' +
    '<div class="cf-pay-foot">' +
      `<div class="cf-pay-cta">${esc(line(spec, 'payCta'))}` +
        '<span class="cf-pay-sheen"></span></div>' +
      `<div class="hint">${icon('arrow', 44, '#fff')}` +
        `<span>${esc(line(spec, 'paySwipe'))}</span></div>` +
    '</div>';

  const veil = frame.querySelector<HTMLElement>('.cf-pay-veil')!;
  const top = frame.querySelector<HTMLElement>('.cf-pay-top')!;
  const head = frame.querySelector<HTMLElement>('.head')!;
  const sub = frame.querySelector<HTMLElement>('.sub')!;
  const card = frame.querySelector<HTMLElement>('.cf-pay-card')!;
  const amount = frame.querySelector<HTMLElement>('.amt')!;
  const fill = frame.querySelector<HTMLElement>('.fill')!;
  const knob = frame.querySelector<HTMLElement>('.knob')!;
  const cta = frame.querySelector<HTMLElement>('.cf-pay-cta')!;
  const sheen = frame.querySelector<HTMLElement>('.cf-pay-sheen')!;
  const hint = frame.querySelector<HTMLElement>('.hint')!;

  // The photo is left bright here — the copy is dark ink, not white, so what it
  // needs is the sky lightened rather than the frame darkened. Strongest at the
  // very top and behind the button, which are the two places words sit directly
  // on the picture with no card under them.
  veil.style.background =
    'linear-gradient(180deg,rgba(255,255,255,.82) 0%,rgba(255,255,255,.6) 18%,' +
    'rgba(255,255,255,.2) 34%,rgba(255,255,255,0) 46%,rgba(10,16,24,.12) 74%,' +
    'rgba(10,16,24,.46) 100%)';

  head.querySelector<HTMLElement>('.ac')!.style.color = a.dark(0.12);
  amount.style.color = a.dark(0.12);
  fill.style.background = `linear-gradient(90deg,${a.lift(0.24)},${a.base})`;
  knob.style.background = `linear-gradient(180deg,${a.lift(0.2)},${a.dark(0.16)})`;
  knob.style.boxShadow = `0 8px 22px rgba(${a.rgb},.5)`;
  cta.style.background = `linear-gradient(180deg,${a.lift(0.12)} 0%,${a.dark(0.28)} 100%)`;

  const rest = restingAt(line(spec, 'payMin'), line(spec, 'payRate'), line(spec, 'payMax'));
  // The figure counts up under the knob, in the spelling the field was written
  // in. A field that is not a plain figure holds still and the knob travels
  // alone — see `counterFor`.
  const counter = counterFor(line(spec, 'payRate'));
  const target = counter.value ?? 0;

  const sheenWidth = Math.round(CTA_WIDTH * 0.7);
  sheen.style.width = sheenWidth + 'px';

  let scale = 1;
  /**
   * Shrink the block until it clears the button. The reason every panel here
   * measures itself: "Kies het maandbedrag dat u wilt" is half again the length
   * of "Swipe left", and a card laid out to one hand-tuned height loses the
   * bottom of its scale in the other six locales.
   */
  function fit(): void {
    top.style.transform = 'none';
    // Across as well as down: the question sits on the bare photo with nothing
    // past its edge, so a compound too wide for the block runs off the frame.
    fitAcross(head, top.getBoundingClientRect().width, HEAD_SIZE);
    scale = fitScale(top, ROOM, scale);
    top.style.transform = `scale(${scale})`;
  }

  function render(t: number): void {
    veil.style.opacity = String(0.4 + 0.6 * easeOutCubic(seg(t, 0, 1.2)));

    const h = easeOutCubic(seg(t, 0, 0.6));
    head.style.opacity = String(h);
    head.style.transform = `translateY(${-40 * (1 - h)}px)`;
    const s = easeOutCubic(seg(t, SUB_AT, 0.55));
    sub.style.opacity = String(s);
    sub.style.transform = `translateY(${-28 * (1 - s)}px)`;

    const c = easeOutBack(seg(t, CARD_AT, 0.62));
    card.style.opacity = String(easeOutCubic(seg(t, CARD_AT, 0.4)));
    card.style.transform = `translateY(${46 * (1 - c)}px) scale(${0.94 + 0.06 * c})`;

    // The knob runs out to the payment and the figure counts up with it, off the
    // one `travel`, so the two cannot come to rest saying different things.
    const travel = easeOutCubic(seg(t, SLIDE_AT, SLIDE_SPAN));
    const at = (rest * travel * 100).toFixed(2) + '%';
    fill.style.width = at;
    knob.style.left = at;
    amount.textContent = counter.say(target * travel);
    const settle = t > SLIDE_AT + SLIDE_SPAN
      ? Math.max(0, 1 - (t - SLIDE_AT - SLIDE_SPAN) * 3) : 0;
    amount.style.transform = `scale(${1 + 0.05 * settle})`;

    const on = seg(t, CTA_AT, 0.3);
    const up = easeOutBack(seg(t, CTA_AT, 0.6));
    const beat = t > CTA_AT ? Math.sin((t - CTA_AT) * 3.6) : 0;
    cta.style.opacity = String(easeOutCubic(seg(t, CTA_AT, 0.4)));
    cta.style.transform = `translateY(${44 * (1 - up)}px) scale(${1 + 0.022 * beat * on})`;
    cta.style.boxShadow =
      `0 14px 34px rgba(${a.rgb},${(0.3 + 0.3 * ((beat + 1) / 2) * on).toFixed(3)})`;
    sheen.style.transform = sheenAt(t - CTA_AT, CTA_WIDTH, sheenWidth, easeInOutCubic);

    // The swipe hint keeps drifting the way it is asking the viewer to go.
    const drift = t > CTA_AT ? ((t - CTA_AT) % 1.6) / 1.6 : 0;
    hint.style.opacity = String(easeOutCubic(seg(t, CTA_AT + 0.3, 0.5)));
    // Flipped here rather than in the stylesheet: CSS `rotate` is composed
    // before `transform`, so the drift below it would run the other way.
    hint.querySelector<HTMLElement>('.cf-t-ic')!.style.transform =
      `translateX(${-34 * easeInOutCubic(drift)}px) scaleX(-1)`;
  }

  return { fit, render };
}

/**
 * Where the knob rests, as a fraction of the scale.
 *
 * Read blunt rather than strict: "10.000 €" is ten thousand, and a scale whose
 * ends are written with a stray word in them should still put the knob roughly
 * right. The figure that has to be spelled back out at every frame is parsed
 * strictly instead, by `counterFor`.
 */
function restingAt(min: string, value: string, max: string): number {
  const lo = amountOf(min);
  const hi = amountOf(max);
  const at = amountOf(value);
  if (lo === null || hi === null || at === null || hi <= lo) return FALLBACK_AT;
  return clamp01((at - lo) / (hi - lo));
}
