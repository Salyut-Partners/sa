// The row banner: a headline, a stack of rows that fly in one after another, and
// a line along the bottom. Ported from the predecessor's first layout.
//
// Two records are built from it — the vacancy list and the rate list. They are
// the same shell over two different schemas, which is exactly the difference the
// PhraseBook draws: the rows of one are words that translate, the rows of the
// other are figures that do not.
import { accent } from '../color.ts';
import { easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { inFrom, items, line, say, seg } from './kit.ts';

export interface RowsOptions {
  /** Which field the headline comes from, and the word to set in the accent. */
  headKey: string;
  accentKey?: string;
  listKey: string;
  ctaKey: string;
  /** How big a row's text is — figures carry a bigger face than job titles. */
  rowSize: number;
  rowPad: string;
  gap: number;
  headSize: number;
}

/** When the rows start arriving, and how the stagger shrinks as a list gets long. */
const ROWS_AT = 0.55;
const ROWS_SPAN = 3.2;
const CTA_AT = 0.35;

/** The width the stack is laid out at, and the width a row's line must fit into. */
const STACK_WIDTH = 888;

/** What one row would be if nothing clipped it — its own padding included. */
const rowWidth = (row: HTMLElement): number => {
  const val = row.querySelector<HTMLElement>('.val');
  return val === null ? 0 : val.scrollWidth + (row.offsetWidth - val.offsetWidth);
};

export function rowsBanner(options: RowsOptions) {
  return function build({ spec, frame, rtl }: BuildContext): TemplateParts {
    const a = accent(spec.color);
    const rows = items(spec, options.listKey);
    const head = say(line(spec, options.headKey));
    const word = options.accentKey === undefined ? '' : say(line(spec, options.accentKey));

    frame.innerHTML =
      '<div class="cf-t-tint cf-bn-scrims"></div>' +
      `<div class="cf-bn-head">${head}${word === '' ? '' : ` <span class="hl">${word}</span>`}</div>` +
      '<div class="cf-bn-rule"></div>' +
      '<div class="cf-bn-rows">' +
      rows.map(row => `<div class="cf-bn-row"><span class="val">${say(row)}</span></div>`).join('') +
      '</div>' +
      `<div class="cf-bn-cta"><span class="pill">${say(line(spec, options.ctaKey))}</span></div>`;

    const scrims = frame.querySelector<HTMLElement>('.cf-bn-scrims')!;
    const headline = frame.querySelector<HTMLElement>('.cf-bn-head')!;
    const rule = frame.querySelector<HTMLElement>('.cf-bn-rule')!;
    const stack = frame.querySelector<HTMLElement>('.cf-bn-rows')!;
    const cta = frame.querySelector<HTMLElement>('.cf-bn-cta')!;
    const rowEls = [...frame.querySelectorAll<HTMLElement>('.cf-bn-row')];

    // Two scrims and a vignette in one element: the copy sits at the top and the
    // bottom of the frame, and both ends have to stay readable over any photo.
    scrims.style.background =
      'linear-gradient(180deg,rgba(6,7,10,.82) 0%,rgba(6,7,10,.5) 22%,rgba(6,7,10,0) 36%),' +
      'linear-gradient(0deg,rgba(6,7,10,.88) 0%,rgba(6,7,10,.5) 22%,rgba(6,7,10,0) 40%),' +
      'radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 52%,rgba(0,0,0,.42) 100%)';

    headline.style.fontSize = options.headSize + 'px';
    frame.querySelector<HTMLElement>('.hl')?.style.setProperty('color', a.lift(0.42));
    rule.style.background = `linear-gradient(90deg,${a.base},${a.lift(0.45)})`;
    rule.style.boxShadow = `0 6px 20px rgba(${a.rgb},.5)`;

    for (const row of rowEls) {
      row.style.borderLeft = `12px solid ${a.base}`;
      row.style.padding = options.rowPad;
    }
    for (const val of frame.querySelectorAll<HTMLElement>('.cf-bn-row .val')) {
      val.style.fontSize = options.rowSize + 'px';
    }
    stack.style.gap = options.gap + 'px';

    // A long list stops the last row arriving after the video has ended, without
    // making a short one look hesitant.
    const step = rowEls.length > 1 ? Math.min(1.05, ROWS_SPAN / rowEls.length) : 0;

    let scale = 1;
    /**
     * Where the stack sits and how big it is, both measured.
     *
     * The rule follows the headline down however many lines it wraps to, the
     * stack takes the middle of what is left, and the whole block scales to fit
     * what it is given. A row is one line that must not break, so it is measured
     * across as well as down: "Gepäckabfertigung" is half again the width of
     * "Cleaning", and shrinking the block is what keeps it a row rather than a
     * row with its end cut off.
     */
    function fit(): void {
      stack.style.transform = 'translateY(-50%)';
      const bottom = headline.offsetTop + headline.offsetHeight;
      rule.style.top = bottom + 26 + 'px';

      const top = bottom + 60;
      const room = cta.offsetTop - top;
      const height = stack.offsetHeight;
      // Nothing laid out to measure — keep the fit an earlier pass found.
      if (height > 0 && room > 0) {
        const widest = Math.max(0, ...rowEls.map(rowWidth));
        scale = Math.min(1, room / height, widest > 0 ? STACK_WIDTH / widest : 1);
      }
      stack.style.top = (top + room / 2) + 'px';
      stack.style.transform = `translateY(-50%) scale(${scale})`;
    }

    function render(t: number): void {
      rowEls.forEach((row, i) => {
        const start = ROWS_AT + i * step;
        const move = easeOutBack(seg(t, start, 0.62));
        row.style.opacity = String(easeOutCubic(seg(t, start, 0.4)));
        row.style.transform =
          `translateX(${150 * inFrom(rtl) * (1 - move)}px) scale(${0.9 + 0.1 * move})`;
      });

      const p = easeOutCubic(seg(t, CTA_AT, 0.6));
      const beat = t > CTA_AT + 0.6 ? Math.sin((t - CTA_AT - 0.6) * 4.2) : 0;
      cta.style.opacity = String(p);
      cta.style.transform = `translateY(${72 * (1 - p)}px) scale(${1 + 0.03 * beat * p})`;
    }

    return { fit, render };
  };
}
