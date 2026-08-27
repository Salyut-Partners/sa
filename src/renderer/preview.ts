// How a library entry is shown. This lives with the renderer rather than in the
// editor: what a button looks like — including in a catalogue — is the
// renderer's business, and E3's template library will ask the same question.
import { toPixels } from '../core/canvas.ts';
import type { Spec } from '../core/types.ts';

/** Chip proportions: wide enough for a real label, short enough to sit in a card. */
export const PREVIEW_CANVAS = { width: 560, height: 96 };

/**
 * What a catalogue chip sits on. Not black: the library holds a style with a
 * smoked-glass body and one that is a ring around the photo showing through, and
 * on black both of them are a label floating in nothing. A mid-tone stands in
 * for the photo they are made to go over.
 */
const BACKDROP =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="4">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#46505f"/><stop offset="1" stop-color="#151922"/>' +
    '</linearGradient></defs><rect width="16" height="4" fill="url(#g)"/></svg>',
  );

export function previewSpec(
  styleId: string,
  options: { color: string; text: string; fontId?: string },
): Spec {
  return {
    canvas: { ...PREVIEW_CANVAS },
    duration: 3,
    fps: 30,
    image: BACKDROP,
    pushIn: false,
    glare: true,
    buttons: [{
      styleId,
      fontId: options.fontId ?? 'anton',
      text: options.text,
      color: options.color,
      // Inset rather than edge to edge: a style whose shadow is an offset slab
      // needs somewhere to cast it, and a chip that clips it misrepresents it.
      rect: toPixels({ x: 3, y: 11, w: 91, h: 74 }, PREVIEW_CANVAS),
      // A catalogue entry is always fully arrived — it is not part of a video.
      timing: { appearAt: 0, hideAt: null, enter: 'none', enterDuration: 0 },
    }],
  };
}
