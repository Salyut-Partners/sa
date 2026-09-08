// The button library. Every entry is a recipe for how a button looks; none of
// them carries text, colour or position — those belong to the instance on the
// photo. Adding a style to the library is adding a record here: nothing in the
// editor, the catalogue or the exporter names a style.
//
// Every visual is a function of the instance's accent, so a style holds no
// colour of its own and any of the ten works in any colour the user picks.
import type { Accent } from './color.ts';

/** A paint that ignores the accent — a fixed gradient, or nothing at all. */
const flat = (css: string) => (): string => css;

const NO_PAINT = flat('transparent');
const WHITE = flat('#fff');
const NO_GLOSS = 'transparent';

export interface ButtonStyle {
  id: string;
  label: string;
  /** Corner radius as a share of the button height. 0.5 is a full pill. */
  radiusRatio: number;
  /** Outer rim thickness as a share of the button height. */
  padRatio: number;
  /** Letter spacing as a share of the font size. */
  letterRatio: number;
  arrow: boolean;
  /**
   * The button's own background. It shows as a ring, because the fill is laid
   * over it inset by the padding — so `padRatio: 0` makes it invisible.
   */
  rim: (a: Accent) => string;
  /**
   * The body, over the rim. A translucent one lets the photo through; a fully
   * transparent one shows the rim rather than the photo, since the rim is what
   * is directly behind it.
   */
  fill: (a: Accent) => string;
  /**
   * The sheet of light over the fill. A plain string, unlike the paints around
   * it: a highlight is white light on whatever is under it, and no style in the
   * library tints one by the accent.
   */
  gloss: string;
  /** The label colour, and with it the arrow's. */
  ink: (a: Accent) => string;
  textShadow: (a: Accent) => string;
  /** How hard the button pulses, 0 for a still button. */
  pulse: number;
  /** How much accent halo the pulse throws, 0 for a button that only casts a shadow. */
  halo: number;
  /**
   * The shadow under whatever the halo adds. In canvas pixels rather than a
   * ratio of the height: a shadow is cast by the button onto the photo, and it
   * does not grow just because the button is a little taller.
   */
  drop: (a: Accent) => string;
  /** How brightly the glare crosses the button, 0 for a matte one. */
  sheen: number;
}

export const BUTTON_STYLES: ButtonStyle[] = [
  {
    id: 'glow',
    label: 'Glow',
    radiusRatio: 0.234,
    padRatio: 0.051,
    letterRatio: 0.021,
    arrow: false,
    rim: a => `linear-gradient(160deg,${a.tint(0.92)} 0%,${a.tint(0.62)} 42%,${a.tint(0.3)} 100%)`,
    fill: a => `linear-gradient(180deg,${a.lift(0.22)} 0%,${a.base} 46%,${a.dark(0.42)} 100%)`,
    gloss:
      'linear-gradient(180deg,rgba(255,255,255,.30) 0%,rgba(255,255,255,.08) 46%,' +
      'rgba(255,255,255,0) 52%,rgba(0,0,0,.16) 100%)',
    ink: WHITE,
    textShadow: flat('0 5px 0 rgba(0,0,0,.30),0 0 22px rgba(0,0,0,.45)'),
    pulse: 0.03,
    halo: 1,
    drop: flat('0 10px 26px rgba(0,0,0,.45)'),
    sheen: 1,
  },
  {
    id: 'solid',
    label: 'Solid',
    radiusRatio: 0.161,
    padRatio: 0,
    letterRatio: 0.038,
    arrow: true,
    rim: NO_PAINT,
    fill: a => `linear-gradient(180deg,${a.lift(0.14)} 0%,${a.base} 60%,${a.dark(0.3)} 100%)`,
    gloss: 'linear-gradient(180deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,0) 55%)',
    ink: WHITE,
    textShadow: flat('0 3px 10px rgba(0,0,0,.35)'),
    pulse: 0.022,
    halo: 0.5,
    drop: flat('0 10px 26px rgba(0,0,0,.40)'),
    sheen: 0.8,
  },
  {
    id: 'glass',
    label: 'Glass',
    radiusRatio: 0.5,
    padRatio: 0.022,
    letterRatio: 0.017,
    arrow: false,
    rim: a => `linear-gradient(160deg,${a.tint(0.86)} 0%,${a.tint(0.34)} 100%)`,
    fill: flat('linear-gradient(180deg,rgba(14,16,22,.74) 0%,rgba(8,10,15,.82) 100%)'),
    gloss: 'linear-gradient(180deg,rgba(255,255,255,.20) 0%,rgba(255,255,255,0) 48%)',
    ink: WHITE,
    textShadow: flat('0 3px 12px rgba(0,0,0,.60)'),
    pulse: 0.018,
    halo: 0.45,
    drop: flat('0 12px 30px rgba(0,0,0,.50)'),
    sheen: 0.7,
  },
  {
    // The wide banner call-to-action, lifted off the bottom of the template it
    // used to be welded into. Widely tracked and squared off — it reads as a
    // strip across the frame rather than as a button sitting on it.
    id: 'bar',
    label: 'Bar',
    radiusRatio: 0.22,
    padRatio: 0,
    letterRatio: 0.058,
    arrow: true,
    rim: NO_PAINT,
    fill: a => `linear-gradient(180deg,${a.lift(0.2)} 0%,${a.base} 55%,${a.dark(0.42)} 100%)`,
    gloss: 'linear-gradient(180deg,rgba(255,255,255,.14) 0%,rgba(255,255,255,0) 60%)',
    ink: WHITE,
    textShadow: flat('0 2px 8px rgba(0,0,0,.35)'),
    pulse: 0.024,
    halo: 0.8,
    drop: a => `0 12px 30px rgba(${a.rgb},.34)`,
    sheen: 1,
  },
  {
    // The headline pill: smoked glass with a hairline of white round it, and no
    // accent anywhere. The one style that leaves the colour to the photo.
    id: 'pill',
    label: 'Pill',
    radiusRatio: 0.5,
    padRatio: 0.015,
    letterRatio: 0.004,
    arrow: false,
    rim: flat('rgba(255,255,255,.22)'),
    fill: flat('rgba(11,12,15,.70)'),
    gloss: 'linear-gradient(180deg,rgba(255,255,255,.10) 0%,rgba(255,255,255,0) 50%)',
    ink: WHITE,
    textShadow: flat('0 2px 10px rgba(0,0,0,.55)'),
    pulse: 0,
    halo: 0,
    drop: flat('0 20px 54px rgba(0,0,0,.55)'),
    sheen: 0.35,
  },
  {
    // Mostly frame: a thick accent ring round a body dark enough to read a label
    // through and thin enough to see the photo through. For a busy frame, where
    // an opaque button reads as a patch stuck on top of the picture.
    //
    // Not a true hole. The rim is the button's own background and the body is
    // the layer over it, so a body painted `transparent` shows the rim rather
    // than the photo — cutting one would take a mask, and a mask on the button
    // takes the label with it.
    id: 'ghost',
    label: 'Ghost',
    radiusRatio: 0.5,
    padRatio: 0.06,
    letterRatio: 0.03,
    arrow: true,
    rim: a => `linear-gradient(150deg,${a.lift(0.35)} 0%,${a.base} 55%,${a.dark(0.25)} 100%)`,
    fill: flat('linear-gradient(180deg,rgba(10,13,18,.42) 0%,rgba(4,6,10,.52) 100%)'),
    gloss: NO_GLOSS,
    ink: WHITE,
    textShadow: flat('0 3px 14px rgba(0,0,0,.75),0 0 30px rgba(0,0,0,.55)'),
    pulse: 0.02,
    halo: 0.6,
    drop: flat('0 8px 24px rgba(0,0,0,.40)'),
    sheen: 0.5,
  },
  {
    // Flat, square and still, on a hard offset shadow. Nothing on it moves —
    // the one style for a frame where everything else already does.
    id: 'slab',
    label: 'Slab',
    radiusRatio: 0.06,
    padRatio: 0,
    letterRatio: 0.05,
    arrow: false,
    rim: NO_PAINT,
    fill: a => a.base,
    gloss: NO_GLOSS,
    ink: WHITE,
    textShadow: flat('none'),
    pulse: 0,
    halo: 0,
    drop: flat('14px 14px 0 rgba(0,0,0,.60)'),
    sheen: 0,
  },
  {
    // Inverted: a white card with the accent in the lettering. Reads loudest on
    // a dark photo, where every filled style is competing with the frame.
    id: 'snow',
    label: 'Snow',
    radiusRatio: 0.28,
    padRatio: 0.03,
    letterRatio: 0.02,
    arrow: true,
    rim: flat('linear-gradient(180deg,#ffffff 0%,#d8dde5 100%)'),
    fill: flat('linear-gradient(180deg,#ffffff 0%,#eef1f6 100%)'),
    gloss: 'linear-gradient(180deg,rgba(255,255,255,.7) 0%,rgba(255,255,255,0) 45%)',
    ink: a => a.dark(0.3),
    textShadow: flat('none'),
    pulse: 0.016,
    halo: 0.25,
    drop: flat('0 14px 34px rgba(0,0,0,.45)'),
    sheen: 0.5,
  },
  {
    // A lit tube: near-black inside, the accent in the rim and in the letters,
    // and the heaviest halo in the library.
    id: 'neon',
    label: 'Neon',
    radiusRatio: 0.3,
    padRatio: 0.028,
    letterRatio: 0.045,
    arrow: false,
    rim: a => `linear-gradient(160deg,${a.lift(0.55)} 0%,${a.base} 50%,${a.lift(0.35)} 100%)`,
    fill: flat('linear-gradient(180deg,rgba(8,10,16,.94) 0%,rgba(4,5,9,.98) 100%)'),
    gloss: 'linear-gradient(180deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,0) 40%)',
    ink: a => a.lift(0.55),
    textShadow: a => `0 0 18px rgba(${a.rgb},.90),0 0 40px rgba(${a.rgb},.55)`,
    pulse: 0.026,
    halo: 1.3,
    drop: flat('0 10px 30px rgba(0,0,0,.55)'),
    sheen: 0.6,
  },
  {
    // Thick pale rim, fully round, glossy: the sweet one. Takes the most room of
    // any style in the library, so it wants a taller button than the rest.
    id: 'candy',
    label: 'Candy',
    radiusRatio: 0.5,
    padRatio: 0.085,
    letterRatio: 0.015,
    arrow: true,
    rim: a => `linear-gradient(180deg,#ffffff 0%,${a.tint(0.5)} 100%)`,
    fill: a => `linear-gradient(180deg,${a.lift(0.3)} 0%,${a.base} 52%,${a.dark(0.34)} 100%)`,
    gloss:
      'linear-gradient(180deg,rgba(255,255,255,.46) 0%,rgba(255,255,255,.10) 44%,' +
      'rgba(255,255,255,0) 50%,rgba(0,0,0,.12) 100%)',
    ink: WHITE,
    textShadow: flat('0 4px 0 rgba(0,0,0,.22),0 0 20px rgba(0,0,0,.40)'),
    pulse: 0.034,
    halo: 0.9,
    drop: flat('0 12px 28px rgba(0,0,0,.40)'),
    sheen: 1,
  },
];

/**
 * A style a project names, or the first in the library. A saved project can
 * name a style this build no longer carries, and a button drawn in the wrong
 * style beats a creative that fails to build at all.
 */
export const styleById = (id: string): ButtonStyle =>
  BUTTON_STYLES.find(s => s.id === id) ?? BUTTON_STYLES[0]!;
