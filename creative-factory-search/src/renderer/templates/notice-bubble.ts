// A comment, answered: the white bubble a short-video app puts over a reply,
// with "reply to a comment" in grey above an avatar and the question in bold —
// which types itself out, so the frame reads as someone asking it now.
//
// The avatar is a person mark on the accent rather than a face. A real
// person's photo would make the question theirs, which it is not.
//
// It hangs from the top of the frame, so it is not offered for moving.
import { accent } from '../color.ts';
import { easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { icon, line, say, seg } from './kit.ts';

const TYPE_AT = 0.5;
/** Characters a second. Fast enough to finish on a short video, slow enough to watch. */
const TYPE_RATE = 26;

export function noticeBubble({ spec, frame }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  // Typed a character at a time — counted by code point, so a letter outside
  // the basic plane is never cut in half on its way in.
  const question = [...line(spec, 'nbText')];

  frame.innerHTML =
    '<div class="cf-nb">' +
      `<div class="lb">${say(line(spec, 'nbLabel'))}</div>` +
      '<div class="row">' +
        `<div class="av">${icon('person', 46, '#fff')}</div>` +
        '<div class="q"></div>' +
      '</div>' +
    '</div>';

  const bubble = frame.querySelector<HTMLElement>('.cf-nb')!;
  const q = frame.querySelector<HTMLElement>('.q')!;
  frame.querySelector<HTMLElement>('.av')!.style.background =
    `linear-gradient(160deg,${a.lift(0.3)} 0%,${a.dark(0.2)} 100%)`;

  // Only rewritten when the count changes: the frame walk asks for every
  // frame, and most frames show the same letters as the one before.
  let shown = -1;

  return {
    fit: () => {},
    render(t: number): void {
      const pop = easeOutBack(seg(t, 0, 0.45));
      bubble.style.opacity = String(easeOutCubic(seg(t, 0, 0.2)));
      bubble.style.transform = `scale(${0.6 + 0.4 * pop})`;

      const count = Math.min(question.length, Math.max(0, Math.floor((t - TYPE_AT) * TYPE_RATE)));
      if (count !== shown) {
        shown = count;
        // The full text stays laid out underneath, invisible, so the bubble is
        // its finished size from the first frame and never grows as it types.
        q.innerHTML =
          `<span>${say(question.slice(0, count).join(''))}</span>` +
          `<span class="rest">${say(question.slice(count).join(''))}</span>`;
      }
    },
  };
}
