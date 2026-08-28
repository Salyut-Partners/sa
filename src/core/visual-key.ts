// The hash that says two videos are the same video.
//
// A batch of four photos in seven languages is twenty-eight files but rarely
// twenty-eight videos: a creative with no template says the same thing in every
// language, and the only difference between its German and its Polish is the
// soundtrack. This key is what lets the export notice — it walks the frames
// once per distinct picture and muxes the rest.
import type { FieldValue, Spec, Timing } from './types.ts';

/**
 * Everything about a Spec that reaches the frame, written down in a fixed order.
 *
 * Built by hand rather than by stringifying the Spec, on two counts. A Spec that
 * arrived over the wire holds its fields in whatever order the sender wrote them
 * and `JSON.stringify` would follow that, splitting a group for no reason. And
 * naming each field is what makes the line between picture and sound something
 * the compiler checks: adding a visual field to `Spec` without adding it here is
 * a mistake this file is meant to make visible.
 */
function visualParts(spec: Spec): unknown[] {
  const { canvas, template } = spec;
  return [
    canvas.width, canvas.height, spec.duration, spec.fps,
    spec.image, spec.pushIn, spec.glare,
    template === null ? null : [
      template.definitionId,
      template.color,
      timingParts(template.timing),
      // Sorted, because a field bag is a map and a map has no order — the same
      // two fields written the other way round are the same frame.
      Object.keys(template.fields).sort().map(k => [k, flatten(template.fields[k]!)]),
    ],
    spec.buttons.map(b => [
      b.styleId, b.fontId, b.text, b.color,
      b.rect.x, b.rect.y, b.rect.w, b.rect.h,
      timingParts(b.timing),
    ]),
  ];
}

const timingParts = (t: Timing): unknown[] => [t.appearAt, t.hideAt, t.enter, t.enterDuration];

/**
 * A field value as one string. A list and the line made of its items must not
 * collide, so each is tagged with which it is.
 */
const flatten = (value: FieldValue): string =>
  typeof value === 'string' ? 's' + value : 'l' + value.join('');

/**
 * FNV-1a, twice with different multipliers.
 *
 * Thirty-two bits over a batch this size is safe enough on paper and not safe
 * enough in practice: a collision would not fail, it would ship one creative's
 * video under another creative's name, and nobody would find out until the ads
 * were live. Sixty-four costs one more multiply per character of a string we are
 * walking anyway.
 */
function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
  }
  return (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36);
}

/** The visual identity of a Spec. Equal keys mean one video will do for both. */
export const visualKey = (spec: Spec): string => hash(JSON.stringify(visualParts(spec)));
