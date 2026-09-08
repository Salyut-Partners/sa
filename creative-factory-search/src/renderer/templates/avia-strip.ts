// The airport strip: a full-width bar across the bottom of the frame carrying
// the perks and the compliance line, and nothing else.
//
// It is the one layout in the library that assumes the photograph is already
// doing most of the talking. These pictures are generated with the headline and
// the rate printed into the scene and the bottom quarter left deliberately
// clear, so the strip has two jobs: say the half that has to stay editable and
// translatable, and stay out of the way of the rest.
//
// That is why it is a bar rather than a scrim. The column layout darkens one
// side of the picture because the copy runs the height of the frame and needs a
// wall behind it; here the copy is four words and a footnote, and a haze wide
// enough to seat them over wet tarmac with painted lines on it would be a haze
// covering a quarter of the photo. A bar with an edge reads as a lower third —
// something laid on the picture on purpose — and it takes its ground with it, so
// the perks are as legible over near-black gravel as over grey metal.
//
// It also has to end where it says it ends. A CTA button is placed under it by
// hand, so the ink stops at 1680 and the ground stops with it: nothing this
// layout draws may reach the band the button lives in.
import { accent } from '../color.ts';
import { easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { DESIGN, fitScale, items, line, say, seg, stripePaint } from './kit.ts';

/**
 * How tall the bar is. Where it sits is the stylesheet's business; the height is
 * repeated here because the fit needs the room inside it, and a number declared
 * in two places is a number that stops agreeing with itself.
 */
const BAR_HEIGHT = 240;
/** Left and right air, and therefore how wide a line of perks may run. */
const SIDE = 56;
const ROW = DESIGN.width - SIDE * 2;
/** What is left for the copy once the rule and the breathing room are taken. */
const ROOM = BAR_HEIGHT - 62;

/** The perk size before a locale too long for the strip has had a say in it. */
const PERK_SIZE = 40;

/** When each part of the strip arrives. */
const RULE_AT = 0;
const BAR_AT = 0.12;
const PERKS_AT = 0.45;
const PERK_STEP = 0.12;
const DISC_AT = 1.15;

export function aviaStrip({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const perks = items(spec, 'aviaPerks').filter(perk => perk.trim() !== '');

  frame.innerHTML =
    '<div class="cf-av-bar">' +
      '<div class="cf-av-glow"></div>' +
      '<div class="cf-av-rule"></div>' +
      '<div class="cf-av-in">' +
        `<div class="cf-av-perks">${perks.map(p => `<span class="perk">${say(p)}</span>`).join('')}</div>` +
        `<div class="cf-av-disc">${say(line(spec, 'aviaDisclaimer'))}</div>` +
      '</div>' +
    '</div>';

  const bar = frame.querySelector<HTMLElement>('.cf-av-bar')!;
  const rule = frame.querySelector<HTMLElement>('.cf-av-rule')!;
  const inner = frame.querySelector<HTMLElement>('.cf-av-in')!;
  const perksBox = frame.querySelector<HTMLElement>('.cf-av-perks')!;
  const disc = frame.querySelector<HTMLElement>('.cf-av-disc')!;
  const perkEls = [...frame.querySelectorAll<HTMLElement>('.perk')];

  rule.style.background = stripePaint(a);

  /**
   * The dividers, one fewer than there are perks — the most any arrangement of
   * them can need. Made once and dealt out by the fit, because which of them is
   * on screen depends on where the lines break.
   */
  const document_ = frame.ownerDocument;
  const dividers = perkEls.slice(1).map(() => {
    const dot = document_.createElement('i');
    dot.className = 'sep';
    dot.style.background = a.lift(0.34);
    return dot;
  });
  /** The divider drawn in front of each perk, once the lines are known. */
  let sepOf: (HTMLElement | null)[] = perkEls.map(() => null);

  let scale = 1;

  /**
   * Break the perks into lines, then rebuild them as those lines.
   *
   * Two passes rather than one wrapping row, because of the dividers. A dot
   * between every pair of perks is right along a line and wrong at the head of
   * one — a wrapped row would open its second line with a dot floating in front
   * of the first word. So the first pass lets the engine wrap the perks alone
   * and reads back where it put them, and the second lays each line out with the
   * dividers it actually needs. Only ever removing dividers, and only ever from
   * the head of a line, means the second pass cannot widen a line the first pass
   * measured: the arrangement is stable rather than chased round a loop.
   */
  function fit(): void {
    inner.style.transform = 'none';
    perksBox.style.fontSize = PERK_SIZE + 'px';
    // Dividers and all, so the wrap is measured against what will actually be
    // on the line. Measuring the words alone would call a line that fits and
    // then widen it by three dots.
    perksBox.replaceChildren(
      ...perkEls.flatMap((perk, i) => (i === 0 ? [perk] : [dividers[i - 1]!, perk])),
    );
    perksBox.style.flexDirection = 'row';
    perksBox.style.flexWrap = 'wrap';

    // One word wider than the strip is a word that would run off both ends of
    // the frame — no wrap can save it, so the size gives way instead. One pass
    // is exact: a word's width is linear in its font size.
    const widest = perkEls.reduce((w, p) => Math.max(w, p.offsetWidth), 0);
    if (widest > ROW) {
      perksBox.style.fontSize = Math.floor((PERK_SIZE * ROW) / widest) + 'px';
    }

    // Grouped by where the engine put each perk. Nothing laid out — a detached
    // stage, or a frame inside a hidden panel — answers zero for every one of
    // them, which comes out as a single line and is corrected by the re-fit the
    // webfonts trigger.
    const lines: HTMLElement[][] = [];
    let top = 0;
    for (const perk of perkEls) {
      const y = perk.offsetTop;
      if (lines.length === 0 || Math.abs(y - top) > 2) {
        lines.push([perk]);
        top = y;
      } else lines[lines.length - 1]!.push(perk);
    }

    sepOf = perkEls.map(() => null);
    perksBox.style.flexDirection = 'column';
    perksBox.style.flexWrap = 'nowrap';
    let dealt = 0;
    perksBox.replaceChildren(...lines.map(group => {
      const row = document_.createElement('div');
      row.className = 'line';
      group.forEach((perk, i) => {
        if (i > 0) {
          const dot = dividers[dealt++]!;
          sepOf[perkEls.indexOf(perk)] = dot;
          row.append(dot);
        }
        row.append(perk);
      });
      return row;
    }));

    // German runs four words where English runs two, so a third line is a real
    // outcome and not a mistake. It shrinks to stay inside the bar rather than
    // pushing the disclaimer down into the band the button is going to want.
    scale = fitScale(inner, ROOM, scale);
    inner.style.transform = `scale(${scale})`;
  }

  function render(t: number): void {
    // The rule draws itself out from the middle, and the bar comes up under it.
    // The order is the point: the line is what says a strip is arriving, and a
    // ground that appeared first would just be the photo going dark.
    const drawn = easeOutCubic(seg(t, RULE_AT, 0.55));
    rule.style.transform = `scaleX(${drawn})`;
    // The accent breathes along the top edge once it is there, the way the rate
    // does on the other layouts. Derived from `t`, like everything else here.
    const breath = t > 0.7 ? (Math.sin((t - 0.7) * 1.8) + 1) / 2 : 0;
    rule.style.boxShadow =
      `0 0 ${(14 + 26 * breath).toFixed(1)}px rgba(${a.rgb},${(0.28 + 0.3 * breath).toFixed(3)})`;

    const up = easeOutCubic(seg(t, BAR_AT, 0.5));
    bar.style.opacity = String(up);
    bar.style.transform = `translateY(${(26 * (1 - up)).toFixed(2)}px)`;

    perkEls.forEach((perk, i) => {
      const p = easeOutCubic(seg(t, PERKS_AT + i * PERK_STEP, 0.42));
      const shift = `translateY(${(16 * (1 - p)).toFixed(2)}px)`;
      perk.style.opacity = String(p);
      perk.style.transform = shift;
      // The divider belongs to the word it introduces, so it arrives with it
      // rather than hanging in the air waiting for one.
      const dot = sepOf[i];
      if (dot) {
        dot.style.opacity = String(p);
        dot.style.transform = shift;
      }
    });

    const d = easeOutCubic(seg(t, DISC_AT, 0.5));
    disc.style.opacity = String(d);
    disc.style.transform = `translateY(${(10 * (1 - d)).toFixed(2)}px)`;
  }

  return { fit, render };
}