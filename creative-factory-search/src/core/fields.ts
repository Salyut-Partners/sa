// What a template's editable fields are, as data. The form in the panel is built
// from this rather than laid out by hand — which is what lets a template be
// added to the library without the editor learning its name.
import type { FieldValue } from './types.ts';

/**
 * How a field is written, and therefore what control it gets.
 *
 * `list` is a kind of its own rather than a `text` the template splits: a list
 * of vacancies is a list to the user, to the layout and to the phrase book, and
 * making them agree on a separator is exactly the fight this avoids.
 */
export type FieldKind = 'line' | 'text' | 'list';

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
}

/** The fields one template carries, in the order the panel shows them. */
export type FieldSchema = readonly Field[];

/** A value in the one form every control edits: text, a line per list item. */
export const toText = (value: FieldValue): string =>
  typeof value === 'string' ? value : value.join('\n');

/**
 * Text back into a value of the kind the field wants.
 *
 * A list drops its blank lines — they are what a half-finished edit looks like
 * on the way to the next item, and an empty row in a list of vacancies renders
 * as a gap nobody asked for. A paragraph keeps them: there they are paragraphing.
 */
export function fromText(text: string, kind: FieldKind): FieldValue {
  if (kind !== 'list') return text;
  return text.split('\n').map(line => line.trim()).filter(line => line !== '');
}


/** What a field with nothing behind it holds — in the kind's own shape. */
export const blankFor = (kind: FieldKind): FieldValue => (kind === 'list' ? [] : '');
