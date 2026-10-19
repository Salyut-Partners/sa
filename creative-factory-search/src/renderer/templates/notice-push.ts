// A notification banner dropping in from the top of the frame: a frosted card
// with a square app icon, the app's name and the time, a bold title and a line
// of text — the shape of a phone's own banner, laid over the photo.
//
// The icon is the accent with the app name's first letter on it, never a
// picture. That is deliberate: a banner wearing a real app's or a bank's logo
// is a creative passing itself off as that app (CMP-016), and a letter on a
// colour is as far as this layout will go towards looking like one.
//
// It hangs from the top edge, so it is not offered for moving.
import { accent } from '../color.ts';
import { easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { line, say, seg } from './kit.ts';

/** The first letter of the app's name, or a dot for a banner with no name. */
const initial = (name: string): string => [...name.trim()][0]?.toUpperCase() ?? '•';

export function noticePush({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const app = line(spec, 'npApp');

  frame.innerHTML =
    '<div class="cf-np">' +
      `<div class="ic">${say(initial(app))}</div>` +
      '<div class="tx">' +
        `<div class="top"><span class="app">${say(app)}</span><span class="when">${say(line(spec, 'npTime'))}</span></div>` +
        `<div class="ti">${say(line(spec, 'npTitle'))}</div>` +
        `<div class="bd">${say(line(spec, 'npText'))}</div>` +
      '</div>' +
    '</div>';

  const card = frame.querySelector<HTMLElement>('.cf-np')!;
  frame.querySelector<HTMLElement>('.ic')!.style.background =
    `linear-gradient(160deg,${a.lift(0.25)} 0%,${a.base} 60%,${a.dark(0.25)} 100%)`;

  return {
    // The card is as tall as its text and wraps inside its own width, so there
    // is nothing it could run off.
    fit: () => {},
    render(t: number): void {
      const drop = easeOutBack(seg(t, 0, 0.6));
      card.style.opacity = String(easeOutCubic(seg(t, 0, 0.25)));
      card.style.transform = `translateY(${-300 * (1 - drop)}px)`;
    },
  };
}
