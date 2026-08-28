// The vocabulary from the PRD, as types. Everything here is data: no methods,
// no DOM, no promises. The renderer, the editor and the server all speak it.

/** Output frame size. Lives in the model, never as a constant in the code. */
export interface CanvasSize {
  width: number;
  height: number;
}

/**
 * Layer geometry, in percent of the canvas (0..100). Percent rather than pixels
 * is what makes a second aspect ratio a change to one value instead of a rewrite.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

declare const pixelBrand: unique symbol;

/**
 * The same geometry resolved against a canvas, ready for the DOM.
 *
 * Branded on purpose: structurally it is identical to `Rect`, so without this
 * the compiler would happily let percent flow where pixels are meant — the one
 * distinction this file exists to keep. `toPixels` is the only way to make one.
 */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  readonly [pixelBrand]: true;
}

export type EnterAnimation = 'none' | 'fade' | 'pop' | 'rise';

/**
 * The languages a project can be released in. A closed set: the phrase book
 * ships translated for exactly these, and a locale nobody wrote the dictionary
 * for would render as a frame full of blanks.
 */
export type LocaleId = 'en' | 'de' | 'it' | 'es' | 'fr' | 'nl' | 'pl';

/** What one template field holds. A list is a list all the way down — see FieldKind. */
export type FieldValue = string | readonly string[];

/**
 * When a layer is on screen. `hideAt: null` means "until the end" and is
 * resolved against the *current* duration, so stretching the video to fit a
 * voice-over keeps open-ended layers to the new end.
 */
export interface Timing {
  appearAt: number;
  hideAt: number | null;
  enter: EnterAnimation;
  enterDuration: number;
}

/** One button placed on one photo. */
export interface ButtonLayer {
  id: string;
  styleId: string;
  fontId: string;
  text: string;
  color: string;
  rect: Rect;
  timing: Timing;
}

/**
 * The template chosen on one photo: which one, what the user typed into it, and
 * when it is on screen.
 *
 * `values` holds only the fields edited by hand. Everything else comes from the
 * phrase book at build time, so a field nobody touched follows the dictionary
 * when the locale changes instead of freezing at whatever it said when the
 * template was picked — and "reset this field" is deleting a key, not guessing
 * what it used to say.
 */
export interface TemplateLayer {
  definitionId: string;
  values: Readonly<Record<string, FieldValue>>;
  timing: Timing;
}

/** One creative in the batch. Not the image file — the creative built on it. */
export interface Photo {
  id: string;
  name: string;
  /** data: URL. Kept in the model so a project is one self-contained document. */
  image: string;
  accent: string;
  pushIn: boolean;
  glare: boolean;
  /** At most one. A photo either wears a template or it does not. */
  template: TemplateLayer | null;
  buttons: ButtonLayer[];
}

/** Everything one working session holds. The unit of saving. */
export interface Project {
  canvas: CanvasSize;
  fps: number;
  duration: number;
  photos: Photo[];
  /** Photo ids being edited. Empty means nothing selected. */
  selection: string[];
  /** The photo the side panel reads its single-value state from. */
  activeId: string | null;
}

// ------------------------------------------------------------------- spec --

/** A button as the renderer wants it: geometry already resolved to pixels. */
export interface ButtonSpec {
  styleId: string;
  fontId: string;
  text: string;
  color: string;
  rect: PixelRect;
  timing: Timing;
}

/**
 * A template as the renderer wants it: every field in its schema resolved to a
 * value, with nothing left to look up. The renderer holds no dictionary.
 */
export interface TemplateSpec {
  definitionId: string;
  fields: Readonly<Record<string, FieldValue>>;
  /** The photo's accent, which the template paints itself in. */
  color: string;
  timing: Timing;
}

/**
 * A flat, immutable description of exactly one video. The only input the
 * renderer accepts — it never sees a Project.
 */
export interface Spec {
  canvas: CanvasSize;
  duration: number;
  fps: number;
  image: string;
  pushIn: boolean;
  glare: boolean;
  template: TemplateSpec | null;
  buttons: ButtonSpec[];
}
