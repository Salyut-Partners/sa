// Options side by side: a row of white tiles low on the frame, each a figure
// over a strip of the accent that carries the same caption. Three plans, three
// terms, three sizes — whatever the photo is offering a choice between.
//
// Once the row has landed, the tiles take it in turns to lift, so the eye is
// walked along the choice rather than left on whichever tile it hit first.
//
// The tiles are their own ground, so the row darkens nothing and can be slid
// to wherever the photo leaves room.
import { accent } from '../color.ts';
import { easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { fitAcross, items, line, say, seg } from './kit.ts';

const VALUE_SIZE = 54;
const CTA_SIZE = 36;
const STEP = 0.12;
/** When the tiles start taking turns, and how long one turn is. */
const TURNS_AT = 1.4;
const TURN = 0.8;

export function optionTiles({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const tiles = items(spec, 'otTiles').filter(s => s.trim() !== '');
  const cta = line(spec, 'cta');

  frame.innerHTML =
    '<div class="cf-ot">' +
      tiles.map(s =>
        `<div class="tile"><div class="v"><span>${say(s)}</span></div>` +
        `<div class="go"><span>${say(cta)}</span></div></div>`).join('') +
    '</div>';

  const els = [...frame.querySelectorAll<HTMLElement>('.tile')];
  for (const tile of els) {
    tile.querySelector<HTMLElement>('.go')!.style.background =
      `linear-gradient(180deg,${a.lift(0.12)} 0%,${a.dark(0.12)} 100%)`;
  }

  return {
    // A long word in a tile shrinks rather than pushing its neighbours off the
    // frame. Each tile's own box is the room: the row shares the width evenly.
    fit(): void {
      for (const tile of els) {
        tile.style.transform = 'none';
        for (const [sel, size] of [['.v', VALUE_SIZE], ['.go', CTA_SIZE]] as const) {
          const box = tile.querySelector<HTMLElement>(sel)!;
          fitAcross(box.querySelector<HTMLElement>('span')!, box.getBoundingClientRect().width * 0.9, size);
        }
      }
    },
    render(t: number): void {
      const turns = Math.max(0, t - TURNS_AT);
      const turnOf = els.length > 0 ? Math.floor(turns / TURN) % els.length : -1;
      els.forEach((tile, i) => {
        const at = i * STEP;
        const rise = easeOutBack(seg(t, at, 0.5));
        // A turn is a lift and a settle, the sine's first half.
        const lift = t >= TURNS_AT && turnOf === i ? Math.sin(Math.PI * ((turns % TURN) / TURN)) : 0;
        tile.style.opacity = String(easeOutCubic(seg(t, at, 0.25)));
        tile.style.transform =
          `translateY(${140 * (1 - rise) - 18 * lift}px) scale(${1 + 0.05 * lift})`;
      });
    },
  };
}
