// The headline as stickers: a small tag, then the headline a line at a time,
// each line on a block of its own, tipped a little off square — the plain lines
// on white, the accent lines on the accent. It is the poster headline that sits
// at the top of a photo and lets the picture under it do the rest.
//
// Each block is its own ground, so nothing behind them is darkened. It is not
// offered for moving all the same: it already stands at the top of the frame,
// and a nudge only ever lifts a layout, so there would be nowhere to take it.
import { accent } from '../color.ts';
import { easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { fitAcross, items, line, say, seg } from './kit.ts';

/** The line size before a long word in a long language has had a say. */
const LINE_SIZE = 104;
/**
 * How wide a block's lettering may run, in the frame's own units: the stack's
 * 960 less the block's own padding.
 */
const LINE_ROOM = 908;
const STACK = 960;
/** When the first block lands, and how far behind it each next one lands. */
const LINES_AT = 0.15;
const LINE_STEP = 0.12;

/** The tilt of each block. Alternating, so the stack reads as stuck on by hand. */
const tilt = (i: number): number => (i % 2 === 0 ? -3 : -1.5);

export function headlineBlocks({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const tagText = line(spec, 'hlTag');
  const plain = items(spec, 'hlLines').filter(l => l.trim() !== '');
  const loud = items(spec, 'hlAccent').filter(l => l.trim() !== '');

  frame.innerHTML =
    '<div class="cf-hb">' +
      (tagText === '' ? '' : `<div class="tag">${say(tagText)}</div>`) +
      plain.map(l => `<div class="ln"><span>${say(l)}</span></div>`).join('') +
      loud.map(l => `<div class="ln a"><span>${say(l)}</span></div>`).join('') +
    '</div>';

  const stack = frame.querySelector<HTMLElement>('.cf-hb')!;
  const tag = frame.querySelector<HTMLElement>('.tag');
  const blocks = [...frame.querySelectorAll<HTMLElement>('.ln')];
  for (const block of frame.querySelectorAll<HTMLElement>('.ln.a')) block.style.background = a.base;

  return {
    // Measured square: the tilt and the pop of the last frame drawn would
    // otherwise widen every line by the angle it happens to be standing at.
    fit(): void {
      const room = LINE_ROOM * (stack.getBoundingClientRect().width / STACK);
      for (const block of blocks) {
        block.style.transform = 'none';
        fitAcross(block.querySelector<HTMLElement>('span')!, room, LINE_SIZE);
      }
    },
    render(t: number): void {
      if (tag !== null) {
        const drop = easeOutBack(seg(t, 0, 0.45));
        tag.style.opacity = String(easeOutCubic(seg(t, 0, 0.25)));
        tag.style.transform = `translateY(${-40 * (1 - drop)}px) rotate(-3deg)`;
      }
      blocks.forEach((block, i) => {
        const start = LINES_AT + i * LINE_STEP;
        const pop = easeOutBack(seg(t, start, 0.5));
        block.style.opacity = String(easeOutCubic(seg(t, start, 0.25)));
        block.style.transform = `scale(${0.5 + 0.5 * pop}) rotate(${tilt(i)}deg)`;
      });
    },
  };
}
