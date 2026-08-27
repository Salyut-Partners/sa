// How a library entry is shown. This lives with the renderer rather than in the
// editor: what a button looks like — including in a catalogue — is the
// renderer's business, and E3's template library will ask the same question.
import { toPixels } from '../core/canvas.ts';
import type { Spec } from '../core/types.ts';

/** Chip proportions: wide enough for a real label, short enough to sit in a card. */
export const PREVIEW_CANVAS = { width: 560, height: 96 };

export function previewSpec(
  styleId: string,
  options: { color: string; text: string; fontId?: string },
): Spec {
  return {
    canvas: { ...PREVIEW_CANVAS },
    duration: 3,
    fps: 30,
    image: '',
    pushIn: false,
    glare: true,
    buttons: [{
      styleId,
      fontId: options.fontId ?? 'anton',
      text: options.text,
      color: options.color,
      rect: toPixels({ x: 1.4, y: 8.3, w: 97.2, h: 83.4 }, PREVIEW_CANVAS),
      // A catalogue entry is always fully arrived — it is not part of a video.
      timing: { appearAt: 0, hideAt: null, enter: 'none', enterDuration: 0 },
    }],
  };
}
