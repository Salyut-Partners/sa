// How a library entry is shown. This lives with the renderer rather than in the
// editor: what a layer looks like — including in a catalogue — is the renderer's
// business, and both libraries ask the same question.
import { toPixels } from '../core/canvas.ts';
import { DEFAULT_LOCALE } from '../core/phrasebook.ts';
import { templateById, templateFields } from '../core/templates.ts';
import type { Spec, Timing } from '../core/types.ts';

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
    template: null,
  };
}

/**
 * A whole frame wearing one template, for the template library.
 *
 * Nothing is typed into it: the chip shows what the template says out of the
 * dictionary, which is what picking it would actually put on the photo. It is
 * built at full canvas size and scaled down by the caller — the same renderer as
 * the video, so the catalogue cannot drift from the result.
 */
export function templatePreviewSpec(
  definitionId: string,
  options: { canvas: { width: number; height: number }; image: string; color: string },
): Spec {
  // A chip plays the entrance rather than sitting on the finished frame: the
  // three card versions carry the same words in three layouts, and the way each
  // one arrives is half of what tells them apart.
  const timing: Timing = { appearAt: 0, hideAt: null, enter: 'none', enterDuration: 0.9 };
  return {
    canvas: { ...options.canvas },
    duration: 6,
    fps: 30,
    image: options.image,
    pushIn: false,
    glare: true,
    buttons: [],
    template: templateById(definitionId) === null ? null : {
      definitionId,
      fields: templateFields({ definitionId, values: {}, timing }, DEFAULT_LOCALE),
      color: options.color,
      timing,
    },
  };
}
