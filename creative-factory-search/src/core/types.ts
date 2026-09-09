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
export type LocaleId =
  'en' | 'de' | 'it' | 'es' | 'fr' | 'nl' | 'pl' | 'tr' | 'sv' | 'pt' | 'he' | 'hu';

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
 * One catalogue object placed on one photo.
 *
 * `colors` is a list rather than one colour because the reason to put a product
 * on a creative is usually to say it comes in several: the prop runs through
 * them in order, holding each for a beat. One colour is a prop that simply wears
 * it, and an empty list is the artwork as it was drawn.
 *
 * Which object it is stays an id. The artwork is the library's and the same
 * bytes for every user, so it is fetched by URL rather than carried in the
 * document the way a photo is.
 */
export interface PropLayer {
  id: string;
  propId: string;
  rect: Rect;
  colors: string[];
  timing: Timing;
}

/**
 * The template chosen on one photo: which one, and when it is on screen.
 *
 * What it *says* is not here. A field's text is the phrase book under the
 * locale's Override, and both are keyed by field rather than by photo — the
 * words are the offer, and the offer is the batch's, not one frame's. Which
 * layout states it, and when that layout arrives, is the photo's own.
 */
export interface TemplateLayer {
  definitionId: string;
  /**
   * How far down the frame the layout is nudged, as a percent of frame height.
   * Zero is where the layout draws itself; negative is up.
   *
   * Only layouts that say they can be moved are ever given a figure other than
   * zero — see `TemplateInfo.movable`.
   */
  offsetY: number;
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
  props: PropLayer[];
}

/**
 * One release language.
 *
 * It carries the two things that differ between languages and nothing else: what
 * the voice says, and every text the user wrote over the dictionary. Both are
 * the locale's rather than the photo's — one offer goes out in seven languages,
 * not seven offers — which is also what lets "translate my edits" be one pass
 * over one bag instead of a crawl over the batch.
 */
export interface Locale {
  id: LocaleId;
  /** What the voice says. Empty is a silent video, not a missing one. */
  script: string;
  /** This language's own voice, or null to use the project's. */
  voiceId: string | null;
  /** Whether it goes out in the next export. */
  include: boolean;
  /**
   * Whether this language's files get the batch's subtitles. Only means
   * anything while the project names a style; a language switched off here
   * comes out clean, which is a real choice — a geo whose script is read but
   * not shown — and not the absence of one.
   */
  subtitles: boolean;
  /** Hand edits to template fields, over the phrase book. */
  overrides: Readonly<Record<string, FieldValue>>;
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
  /** The release languages, in the order they were added. Never empty. */
  locales: Locale[];
  /** Which language the grid is showing. Always one the project carries. */
  activeLocale: LocaleId;
  /** The voice a locale that has not chosen its own speaks with. */
  voiceId: string;
  /** Which synthesis model — the quality-against-price dial. */
  modelId: string;
  /** Stretch the video to hold the voice-over rather than cutting it off. */
  fitToVoice: boolean;
  /**
   * The subtitle style every exported file is burned with, by id from the
   * pipeline's own dictionary, or null for no subtitles. On the batch rather
   * than on a photo or a language: the words are the script's, the script is
   * the language's, and one look across the whole release is what a buyer
   * picks — a language opts out, it does not pick another look.
   */
  subtitles: string | null;
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
 * A prop as the renderer wants it: the artwork located, the geometry in pixels
 * and the catalogue left behind. The renderer holds no catalogue, the same way
 * it holds no dictionary.
 */
export interface PropSpec {
  src: string;
  /**
   * The hue the artwork was drawn in, or null when it has none worth turning.
   * Recolouring is a rotation from here, so without it a colour would land
   * somewhere different on every prop.
   */
  hue: number | null;
  colors: string[];
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
  /** Percent of frame height the layout is nudged down by; negative is up. */
  offsetY: number;
  timing: Timing;
}

/**
 * A flat, immutable description of exactly one video. The only input the
 * renderer accepts — it never sees a Project.
 *
 * The last four fields are the sound. The renderer ignores them entirely: they
 * ride along because a Spec is one video end to end, and because the split
 * between them and everything above is exactly what `visualKey` hashes over.
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
  props: PropSpec[];
  /** Which language this one is. Not visual: the words are already resolved. */
  locale: LocaleId;
  /** What the voice says. Empty means no audio track at all. */
  script: string;
  voiceId: string;
  modelId: string;
}
