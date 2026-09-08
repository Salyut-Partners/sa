// The band and its button: the row that two layouts in this library are built
// from, and the ladder of colour that tells one row from the next.
//
// Shared rather than copied because it is one row design wearing two placements
// — the donor call ends on these rows after stating a whole offer, and the strip
// is the rows alone over a photograph that says the rest. A row drawn in two
// files is a row that will end up drawn two ways, and the difference would show
// on the one thing both layouts are actually for.
import type { Accent } from '../color.ts';
import { easeOutBack, easeOutCubic } from '../easing.ts';
import { inFrom, say, seg } from './kit.ts';

/** The span a long stack has to build itself in, however many rows it holds. */
const STACK_SPAN = 2.4;

/** The rows, as markup. One button caption, repeated: every row makes the same offer. */
export const tierRowsHtml = (tiers: readonly string[], cta: string): string =>
  tiers.map(text =>
    '<div class="cf-tier">' +
    `<span class="band"><span class="v">${say(text)}</span></span>` +
    `<span class="go">${say(cta)}</span>` +
    '</div>').join('');

export interface TierRows {
  /** Build the stack in a row at a time, the first one starting at `from`. */
  render(t: number, from: number): void;
}

/**
 * Paint the rows in the creative's accent and hand back their entrance.
 *
 * The rows are near-identical by design — it is the same offer at three ages —
 * so they are told apart by one step of colour each and not by three unrelated
 * hues. The accent belongs to the creative, and a row that ignored it would be
 * the one thing on the frame the user's colour could not reach.
 */
export function tierRows(stack: HTMLElement, a: Accent, rtl: boolean): TierRows {
  const rows = [...stack.querySelectorAll<HTMLElement>('.cf-tier')];

  // The ladder stays in the pale half of the accent on purpose: the age sits on
  // the band in dark ink, and a rung dark enough to look striking is a rung the
  // figure stops reading on.
  const rungs = Math.max(1, rows.length - 1);
  rows.forEach((row, i) => {
    const k = 0.58 - 0.44 * (i / rungs);
    // The band lightens along the way the row is read, which is the other way
    // round when the row is read the other way round.
    row.querySelector<HTMLElement>('.band')!.style.background =
      `linear-gradient(${rtl ? 264 : 96}deg,${a.lift(k)},${a.lift(Math.max(0, k - 0.22))})`;
    const go = row.querySelector<HTMLElement>('.go')!;
    go.style.background = `linear-gradient(180deg,${a.lift(0.2)},${a.dark(0.14)})`;
    go.style.boxShadow = `0 10px 26px rgba(${a.rgb},.42)`;
  });

  // Longer stacks step faster rather than running past the end of the video.
  const step = rows.length > 1 ? Math.min(0.34, STACK_SPAN / rows.length) : 0;

  return {
    render(t: number, from: number): void {
      rows.forEach((row, i) => {
        const start = from + i * step;
        const move = easeOutBack(seg(t, start, 0.6));
        row.style.opacity = String(easeOutCubic(seg(t, start, 0.38)));
        row.style.transform =
          `translateX(${160 * inFrom(rtl) * (1 - move)}px) scale(${0.92 + 0.08 * move})`;
      });
    },
  };
}
