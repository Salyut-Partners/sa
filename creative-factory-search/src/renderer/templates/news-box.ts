// The tabloid box: a white sheet low on the frame, a rubric on an accent tag
// stuck over its top edge, and the headline in tall condensed capitals with its
// first word in the accent — the front-page block, laid over the photo.
//
// The sheet is its own ground, so like the other news strips it darkens
// nothing and can be slid to wherever the picture leaves room.
import { accent } from '../color.ts';
import { easeOutBack, easeOutCubic } from '../easing.ts';
import type { BuildContext, TemplateParts } from './index.ts';
import { fitAcross, line, say, seg, wipe } from './kit.ts';

const HEAD_SIZE = 112;

/**
 * The headline as markup, its first word set apart for the accent.
 *
 * The first word rather than a field of its own: it is what a reader's eye
 * lands on in every language, and a second box to keep in step across twelve
 * of them would be one more place for a translation to drift from its line.
 */
function headHtml(text: string): string {
  const trimmed = text.trim();
  const cut = trimmed.search(/\s/);
  if (cut < 0) return `<span class="a">${say(trimmed)}</span>`;
  return `<span class="a">${say(trimmed.slice(0, cut))}</span>${say(trimmed.slice(cut))}`;
}

export function newsBox({ spec, frame, rtl }: BuildContext): TemplateParts {
  const a = accent(spec.color);
  const sub = line(spec, 'newsSub');

  frame.innerHTML =
    '<div class="cf-nw-box">' +
      `<div class="tag">${say(line(spec, 'newsKicker'))}</div>` +
      `<div class="hd">${headHtml(line(spec, 'newsHead'))}</div>` +
      (sub === '' ? '' : `<div class="sub"><i></i><span>${say(sub)}</span></div>`) +
    '</div>';

  const box = frame.querySelector<HTMLElement>('.cf-nw-box')!;
  const tag = frame.querySelector<HTMLElement>('.tag')!;
  const head = frame.querySelector<HTMLElement>('.hd')!;
  const subEl = frame.querySelector<HTMLElement>('.sub');

  tag.style.background = a.base;
  head.querySelector<HTMLElement>('.a')!.style.color = a.base;
  subEl?.querySelector<HTMLElement>('i')?.style.setProperty('background', a.base);

  return {
    fit: () => fitAcross(head, head.getBoundingClientRect().width, HEAD_SIZE),
    render(t: number): void {
      const pop = easeOutBack(seg(t, 0, 0.55));
      box.style.opacity = String(easeOutCubic(seg(t, 0, 0.3)));
      box.style.transform = `scale(${0.86 + 0.14 * pop})`;

      const stick = easeOutBack(seg(t, 0.3, 0.4));
      tag.style.opacity = String(easeOutCubic(seg(t, 0.3, 0.2)));
      tag.style.transform = `translateY(${-30 * (1 - stick)}px)`;

      head.style.clipPath = wipe(easeOutCubic(seg(t, 0.4, 0.6)), rtl);
      if (subEl !== null) subEl.style.opacity = String(easeOutCubic(seg(t, 0.9, 0.4)));
    },
  };
}
