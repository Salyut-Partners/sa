// The bands on their own: a stack of offers over the bare photograph, each one
// a band and a button, and nothing else on the frame.
//
// The one layout in the library that lays nothing over the whole picture. Every
// other one darkens the photo behind itself, because it has copy printed
// straight onto it; here each row is its own opaque strip and carries its own
// background, so the photograph is untouched between the rows and around them.
// That is why this is the layout to reach for when the picture is already
// saying what the offer is.
import { accent } from '../color.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { items, line } from './kit.ts';
import { tierRows, tierRowsHtml } from './tier-stack.ts';

/**
 * When the first row lands.
 *
 * Sooner than in the donor call, where the stack waits for a title and a
 * pledge to have their say first. Nothing is above these rows, so nothing is
 * worth waiting for: the frame opens on the offer.
 */
const ROWS_AT = 0.12;

export function tierRowsTemplate({ spec, frame, rtl }: BuildContext): TemplateParts {
  const a = accent(spec.color);

  frame.innerHTML =
    '<div class="cf-tr-stack">' +
    tierRowsHtml(items(spec, 'donorTiers'), line(spec, 'donorCta')) +
    '</div>';

  const stack = tierRows(frame.querySelector<HTMLElement>('.cf-tr-stack')!, a, rtl);

  return {
    // Nothing to measure: the rows are as tall as their own text and the stack
    // is as tall as the rows. The layouts that fit themselves do it because
    // they hold a panel of prose whose length changes with the language; a band
    // is a pair of figures and a button caption in every one of them.
    fit: () => {},
    render: (t: number) => stack.render(t, ROWS_AT),
  };
}
