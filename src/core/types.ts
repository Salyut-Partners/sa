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

/** One creative in the batch. Not the image file — the creative built on it. */
export interface Photo {
  id: string;
  name: string;
  /** data: URL. Kept in the model so a project is one self-contained document. */
  image: string;
  accent: string;
  pushIn: boolean;
  glare: boolean;
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
  buttons: ButtonSpec[];
}
