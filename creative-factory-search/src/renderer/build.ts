// The single renderer. The editor grid, the library thumbnails and the headless
// exporter all call this — which is the whole reason the preview can be trusted.
//
// Every frame is a pure function of `t`: no CSS transitions, no rAF, no clock.
// The frame walk sets a time and screenshots; anything time-dependent that is
// not derived from `t` would desync the export from what was on screen.
import { clampShift } from '../core/canvas.ts';
import { localeDir } from '../core/locales.ts';
import type { TemplateSlot } from '../core/project.ts';
import { layerStateAt } from '../core/timing.ts';
import type { ButtonSpec, EnterAnimation, Rect, Spec, TemplateSpec } from '../core/types.ts';
import { styleById, type ButtonStyle } from './button-styles.ts';
import { accent, type Accent } from './color.ts';
import { ensureRendererStyle } from './css.ts';
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic } from './easing.ts';
import { fontById } from './fonts.ts';
import { definitionById, type TemplateParts } from './templates/index.ts';
import { DESIGN } from './templates/kit.ts';

export interface CreativeHandle {
  /** Draw the frame at `t` seconds. */
  render: (t: number) => void;
  spec: Spec;
  /** How far each template layer's content reaches, once it has been measured. */
  reach: () => Partial<Record<TemplateSlot, TemplateReach>>;
}

/**
 * Where a template's content sits, for the editor to draw a handle round and
 * hold a drag inside the frame with.
 */
export interface TemplateReach {
  /** The content where it draws itself, before any move, in percent of the frame. */
  box: Rect;
  /** The frame on the canvas, in percent of the canvas: all of it for a 9:16 photo. */
  frame: Rect;
}

// `currentColor` rather than white: the arrow is part of the label, and a style
// that writes in the accent (or in near-black, on a white fill) needs it to follow.
const ARROW_SVG =
  '<svg class="cf-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

/** A template layer — the photo's layout, or the overlay drawn over it. */
interface TemplatePlace {
  slot: TemplateSlot;
  spec: TemplateSpec;
  layer: HTMLElement;
  parts: TemplateParts;
  /** The 1080x1920 frame, scaled to the canvas. Holds the scrims. */
  frame: HTMLElement;
  /** Everything on the frame but the scrims: what a move moves. */
  mover: HTMLElement;
  /** Where the content draws itself, in percent of the frame; null until measured. */
  box: Rect | null;
}

/** One button's DOM, plus everything about it that does not change per frame. */
interface ButtonParts {
  spec: ButtonSpec;
  style: ButtonStyle;
  accent: Accent;
  layer: HTMLElement;
  button: HTMLElement;
  arrow: SVGElement | null;
  flash: HTMLElement;
  sheen: HTMLElement;
  sheenWidth: number;
  riseBy: number;
}

/**
 * Build a creative on `root`. `onFit` hears each time the templates were
 * measured afresh — on build, when the webfonts land, and when a stage built
 * hidden is first drawn visible — which is when their reach may have changed.
 */
export function build(root: HTMLElement, spec: Spec, onFit?: () => void): CreativeHandle {
  ensureRendererStyle(root.ownerDocument);

  root.className = 'cf-stage';
  // The frame says which language it is in, because two of the things the
  // browser does to text depend on knowing: `text-transform: uppercase`, which
  // the banner headline and the rates headline both use, and hyphenation.
  // Turkish is where it shows — its capital of "i" is "İ", so an unmarked frame
  // uppercases "bu işi bul" to "BU IŞI BUL", which is not a Turkish sentence.
  // Set here rather than in each template: it is a property of the frame, and a
  // template that forgot would be wrong only in one language.
  root.lang = spec.locale;
  // And which way it is read. Hebrew makes this load-bearing twice over. The
  // browser lays Hebrew letters out right to left whatever the frame says, but
  // it resolves the neutrals — the full stop, the question mark, the bullet
  // between two perks — to the *paragraph* direction, so in an unmarked frame
  // the full stop of a Hebrew sentence lands at the end the sentence starts
  // from. And the layouts read off it: a column pinned to the left of the
  // picture belongs on the right when the eye enters there. See `localeDir`
  // and the `[dir=rtl]` half of the template stylesheet.
  root.dir = localeDir(spec.locale);
  root.style.width = spec.canvas.width + 'px';
  root.style.height = spec.canvas.height + 'px';

  // The order of the frame: photo, then the template, then the overlay drawn
  // over it, then the buttons in the order of their list. A button is meant to
  // be laid over a template, never under one.
  root.innerHTML =
    '<div class="cf-wrap">' +
    '<img class="cf-base" alt="">' +
    TEMPLATE_HTML.repeat((spec.template === null ? 0 : 1) + (spec.overlay === null ? 0 : 1)) +
    spec.buttons.map(buttonHtml).join('') +
    '</div>';

  const wrap = root.querySelector<HTMLElement>('.cf-wrap')!;
  const base = root.querySelector<HTMLImageElement>('.cf-base')!;
  if (spec.image) base.src = spec.image;

  const slots = [...root.querySelectorAll<HTMLElement>('.cf-tpl')];
  const templates = ([['template', spec.template], ['overlay', spec.overlay]] as const)
    .filter((t): t is readonly [TemplateSlot, TemplateSpec] => t[1] !== null)
    .map(([slot, t], i) => dressTemplate(slot, t, spec, slots[i]!))
    .filter((t): t is TemplatePlace => t !== null);
  // Measuring draws the layer once more, so a layer nobody moved and nobody
  // holds a handle to — a library chip — is left where it draws itself.
  const measured = (t: TemplatePlace): boolean =>
    onFit !== undefined || t.spec.offsetX !== 0 || t.spec.offsetY !== 0;
  const layers = [...root.querySelectorAll<HTMLElement>('.cf-btn-layer')];
  const parts: ButtonParts[] = spec.buttons.map((b, i) => dressButton(b, layers[i]!));

  /** The last time drawn, to come back to after a measurement. */
  let now = 0;

  const fitAll = (): void => {
    parts.forEach(fitText);
    for (const template of templates) {
      template.parts.fit();
      if (measured(template)) settle(template);
    }
    onFit?.();
  };
  fitAll();
  // Text measured before the webfont lands is measured against a fallback face,
  // so a label can end up a size too large and a panel a line too tall. Re-fit
  // once the real fonts are in.
  root.ownerDocument.fonts?.ready.then(() => { fitAll(); render(now); }).catch(() => {});

  function render(t: number): void {
    now = t;
    // A stage built inside a hidden tab measured nothing; the first frame it is
    // drawn visible is the first one it can.
    const late = templates.filter(x => x.box === null && measured(x) && settle(x));
    if (late.length > 0) onFit?.();
    wrap.style.transform = 'scale(' + (spec.pushIn ? 1 + 0.022 * (t / spec.duration) : 1) + ')';
    for (const template of templates) renderTemplate(template, t, spec);
    for (const p of parts) renderButton(p, t, spec);
  }

  const reach = (): Partial<Record<TemplateSlot, TemplateReach>> => {
    const fit = Math.min(spec.canvas.width / DESIGN.width, spec.canvas.height / DESIGN.height);
    const w = (100 * DESIGN.width * fit) / spec.canvas.width;
    const h = (100 * DESIGN.height * fit) / spec.canvas.height;
    const frame: Rect = { x: (100 - w) / 2, y: (100 - h) / 2, w, h };
    return Object.fromEntries(templates
      .filter(t => t.box !== null)
      .map(t => [t.slot, { box: t.box!, frame }]));
  };

  render(0);
  return { render, spec, reach };
}

const TEMPLATE_HTML = '<div class="cf-layer cf-tpl"><div class="cf-tpl-frame"></div></div>';

/**
 * What a layout lays over the whole picture rather than on part of it. A move
 * leaves these where they are: dragged along, a scrim would bare one edge of
 * the photo and push its shading off the other.
 */
const SCRIMS = '.cf-t-tint, .cf-na-dim';

/**
 * A time every layout has long since built itself by, at which its content is
 * measured: where it rests is where the viewer reads it.
 */
const REST = 30;

/**
 * Put a template on the frame, or answer nothing when it names one this build
 * does not carry, which a project saved against an older library can. A
 * creative short a panel beats one that refuses to build.
 */
function dressTemplate(slot: TemplateSlot, template: TemplateSpec, spec: Spec, layer: HTMLElement): TemplatePlace | null {
  const definition = definitionById(template.definitionId);
  if (definition === null) {
    layer.remove();
    return null;
  }

  const frame = layer.querySelector<HTMLElement>('.cf-tpl-frame')!;
  // Every template is written against one frame size and scaled to the canvas,
  // so a second output size is this line rather than four re-measured layouts.
  // A canvas of another shape than 9:16 — a square or landscape photo — gets
  // the frame whole, as large as fits and centred: a layout cut off at the
  // edges loses its words, and a squashed one is not the layout any more.
  const fit = Math.min(spec.canvas.width / DESIGN.width, spec.canvas.height / DESIGN.height);
  const dx = (spec.canvas.width - DESIGN.width * fit) / 2;
  const dy = (spec.canvas.height - DESIGN.height * fit) / 2;
  frame.style.transform = `translate(${dx}px, ${dy}px) scale(${fit})`;

  const parts = definition.build({
    spec: template,
    frame,
    rtl: localeDir(spec.locale) === 'rtl',
  });

  // The layout drew itself straight onto the frame. Everything but its scrims
  // goes one level down, into a box the size of the frame, so a move is one
  // transform on that box: the layout's own positions, its measurements and
  // its animations all read the same inside it as they did on the frame.
  const mover = frame.ownerDocument.createElement('div');
  mover.className = 'cf-tpl-move';
  for (const child of [...frame.children]) if (!child.matches(SCRIMS)) mover.appendChild(child);
  frame.appendChild(mover);
  moveContent(mover, template, null);

  return { slot, spec: template, layer, parts, frame, mover, box: null };
}

/**
 * Put the content where the user moved it, held inside the frame once its
 * reach is known.
 *
 * Written in the frame's own 1080x1920 units, so the same figure means the
 * same place on the picture whatever size the canvas turns out to be. Held
 * here as well as in the editor's drag: a move made on one photo reaches every
 * selected one, and one of those may carry longer copy and a taller panel.
 */
function moveContent(mover: HTMLElement, template: TemplateSpec, box: Rect | null): void {
  const wanted = { x: template.offsetX, y: template.offsetY };
  const { x, y } = box === null ? wanted : clampShift(box, wanted);
  mover.style.transform = x === 0 && y === 0
    ? ''
    : `translate(${(DESIGN.width * x) / 100}px, ${(DESIGN.height * y) / 100}px)`;
}

interface Edges { left: number; top: number; right: number; bottom: number }

/**
 * Measure how far a layout's content reaches, and hold its move to the frame.
 * Answers whether there was anything laid out to measure.
 *
 * The content is drawn at rest for the measurement and left that way: every
 * caller draws the frame it wants straight after. Only what paints counts —
 * text, a background, a border, a picture — so a column a layout spans the
 * full width to centre a headline in does not pin the headline to that width.
 */
function settle(place: TemplatePlace): boolean {
  const { layer, frame, mover } = place;
  const hidden = layer.style.display;
  const entrance = layer.style.transform;
  layer.style.display = '';
  layer.style.transform = '';
  mover.style.transform = '';
  place.parts.render(REST, 1);

  const origin = frame.getBoundingClientRect();
  const k = origin.width / DESIGN.width;
  let edges: Edges | null = null;
  const add = (r: Edges): void => {
    if (r.right <= r.left || r.bottom <= r.top) return;
    const next: Edges = {
      left: (r.left - origin.left) / k, top: (r.top - origin.top) / k,
      right: (r.right - origin.left) / k, bottom: (r.bottom - origin.top) / k,
    };
    edges = edges === null ? next : {
      left: Math.min(edges.left, next.left), top: Math.min(edges.top, next.top),
      right: Math.max(edges.right, next.right), bottom: Math.max(edges.bottom, next.bottom),
    };
  };
  if (k > 0) visit(mover, add, null);

  layer.style.display = hidden;
  layer.style.transform = entrance;
  const found = edges as Edges | null;
  if (found === null) {
    moveContent(mover, place.spec, null);
    return false;
  }
  place.box = {
    x: (100 * found.left) / DESIGN.width,
    y: (100 * found.top) / DESIGN.height,
    w: (100 * (found.right - found.left)) / DESIGN.width,
    h: (100 * (found.bottom - found.top)) / DESIGN.height,
  };
  moveContent(mover, place.spec, place.box);
  return true;
}

const BLANK = new Set(['rgba(0, 0, 0, 0)', 'transparent']);
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** The part of `r` inside `clip`, in the page's own pixels. */
const within = (r: DOMRect | Edges, clip: Edges | null): Edges => clip === null ? r : {
  left: Math.max(r.left, clip.left), top: Math.max(r.top, clip.top),
  right: Math.min(r.right, clip.right), bottom: Math.min(r.bottom, clip.bottom),
};

/**
 * Hand `add` the box of everything under `el` that puts paint on the frame,
 * cut to what the boxes around it let show. A button's sheen waits thousands
 * of pixels to one side of the button it crosses, hidden by that button's own
 * edges; counted whole, it would pin the layout it belongs to in place.
 */
function visit(el: Element, add: (r: Edges) => void, clip: Edges | null): void {
  const view = el.ownerDocument.defaultView;
  if (view === null) return;
  const style = view.getComputedStyle(el);
  if (style.display === 'none') return;
  const own = el.getBoundingClientRect();
  if (el.namespaceURI === 'http://www.w3.org/2000/svg' || el.tagName === 'IMG' || el.tagName === 'CANVAS') {
    add(within(own, clip));
    return;
  }
  const paints = !BLANK.has(style.backgroundColor) || style.backgroundImage !== 'none'
    || SIDES.some(side => parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0
      && !BLANK.has(style.getPropertyValue(`border-${side}-color`)));
  if (paints) add(within(own, clip));
  const inner = style.overflowX === 'visible' && style.overflowY === 'visible' ? clip : within(own, clip);
  for (const node of el.childNodes) {
    if (node.nodeType === 3) {
      if ((node.textContent ?? '').trim() === '') continue;
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(node);
      add(within(range.getBoundingClientRect(), inner));
    } else if (node.nodeType === 1) {
      visit(node as Element, add, inner);
    }
  }
}

function renderTemplate(place: TemplatePlace, t: number, spec: Spec): void {
  const state = layerStateAt(place.spec.timing, t, spec.duration);
  if (!state.visible) {
    place.layer.style.display = 'none';
    return;
  }
  place.layer.style.display = '';
  // The layer is the whole frame, so a rise is a short slide of everything on it
  // rather than a panel travelling its own height. Small on purpose: the
  // template spends the same entrance on the motion that is its own, and two
  // full-length arrivals stacked on each other read as a stutter.
  applyEntrance(place.layer, place.spec.timing.enter, state.enter, spec.canvas.height * 0.05);
  // Time since it arrived, not since the video started: a panel set to land on
  // the third second lives the life it would have lived landing on the first.
  place.parts.render(t - place.spec.timing.appearAt, state.enter);
}

function buttonHtml(b: ButtonSpec): string {
  const style = styleById(b.styleId);
  return (
    `<div class="cf-layer cf-btn-layer" style="left:${b.rect.x}px;top:${b.rect.y}px;` +
    `width:${b.rect.w}px;height:${b.rect.h}px">` +
    '<div class="cf-btn"><div class="cf-fill">' +
    '<span class="cf-txt"></span>' +
    (style.arrow ? ARROW_SVG : '') +
    '<div class="cf-gloss"></div><div class="cf-flash"></div><div class="cf-sheen"></div>' +
    '</div></div></div>'
  );
}

function dressButton(spec: ButtonSpec, layer: HTMLElement): ButtonParts {
  const style = styleById(spec.styleId);
  const font = fontById(spec.fontId);
  const a = accent(spec.color);
  const { w, h } = spec.rect;

  const radius = h * style.radiusRatio;
  const pad = h * style.padRatio;

  const button = layer.querySelector<HTMLElement>('.cf-btn')!;
  const fill = layer.querySelector<HTMLElement>('.cf-fill')!;
  const gloss = layer.querySelector<HTMLElement>('.cf-gloss')!;
  const flash = layer.querySelector<HTMLElement>('.cf-flash')!;
  const sheen = layer.querySelector<HTMLElement>('.cf-sheen')!;
  const text = layer.querySelector<HTMLElement>('.cf-txt')!;
  const arrow = layer.querySelector<SVGElement>('.cf-arrow');

  button.style.cssText =
    `border-radius:${radius}px;padding:${pad}px;background:${style.rim(a)}`;
  const innerRadius = Math.max(0, radius - pad);
  // The ink goes on the fill, not on the label: the label and the arrow both
  // inherit it, and the arrow is drawn in `currentColor`.
  fill.style.cssText =
    `border-radius:${innerRadius}px;background:${style.fill(a)};color:${style.ink(a)}`;
  gloss.style.cssText = `border-radius:${innerRadius}px;background:${style.gloss}`;
  flash.style.background =
    'linear-gradient(180deg,rgba(255,255,255,.34) 0%,rgba(255,255,255,.14) 55%,' +
    'rgba(255,255,255,.22) 100%)';

  text.textContent = font.upper ? spec.text.toUpperCase() : spec.text;
  text.style.cssText =
    `font-family:${font.family};font-weight:${font.weight};text-shadow:${style.textShadow(a)}`;

  if (arrow) {
    const size = Math.round(h * 0.34);
    arrow.setAttribute('width', String(size));
    arrow.setAttribute('height', String(size));
    (arrow as unknown as HTMLElement).style.marginLeft = Math.round(h * 0.12) + 'px';
  }

  // Painted by the engine off the button's own picture, so it follows every
  // pulse and rise of the button without a second copy to keep in step.
  if (style.reflect) {
    button.style.setProperty('-webkit-box-reflect',
      `below ${Math.round(h * 0.08)}px linear-gradient(transparent 40%,rgba(255,255,255,${style.reflect}))`);
  }

  const sheenWidth = Math.round(w * 0.7);
  sheen.style.width = sheenWidth + 'px';
  sheen.style.opacity = String(style.sheen);

  return {
    spec, style, accent: a, layer, button, arrow, flash, sheen, sheenWidth,
    riseBy: h * 0.55,
  };
}

/**
 * Shrink the label until it fits rather than trusting a hand-picked size — the
 * same button carries wildly different word lengths across locales.
 */
function fitText(p: ButtonParts): void {
  const font = fontById(p.spec.fontId);
  const { w, h } = p.spec.rect;
  const text = p.layer.querySelector<HTMLElement>('.cf-txt')!;

  const room =
    w - h * p.style.padRatio * 2 - h * 0.54 - (p.style.arrow ? h * 0.55 : 0);

  // A layer outside its window is display:none, and a hidden element measures
  // zero wide. The re-fit that runs when the webfont lands would then see every
  // button that has not appeared yet as fitting at its starting size, and clip
  // its label for the whole video. Lay it out for the measurement and put it
  // back — this is a measurement, and a measurement needs it in the layout.
  const hidden = p.layer.style.display;
  p.layer.style.display = '';

  // Still zero means nothing is laid out at all — a detached stage, or one
  // inside a hidden panel. There is nothing to measure against, and guessing a
  // size would throw away the fit a previous pass got right.
  if (text.offsetWidth > 0) {
    const setSize = (px: number): void => {
      text.style.fontSize = px + 'px';
      text.style.letterSpacing = (px * p.style.letterRatio).toFixed(2) + 'px';
    };

    // offsetWidth, not getBoundingClientRect: the grid scales cells with a CSS
    // transform, and a rect measurement would come back scaled while `room` is
    // in canvas pixels. That mismatch let the preview clip a label the export
    // fitted.
    let size = Math.round(h * font.sizeRatio);
    setSize(size);
    while (size > 8 && text.offsetWidth > room) {
      size -= 1;
      setSize(size);
    }
  }

  p.layer.style.display = hidden;
}

function renderButton(p: ButtonParts, t: number, spec: Spec): void {
  const state = layerStateAt(p.spec.timing, t, spec.duration);
  if (!state.visible) {
    p.layer.style.display = 'none';
    return;
  }
  p.layer.style.display = '';
  applyEntrance(p.layer, p.spec.timing.enter, state.enter, p.riseBy);

  const style = p.style;
  const beat = (Math.sin(t * 5.2) + 1) / 2;
  p.button.style.transform = 'scale(' + (1 + style.pulse * beat) + ')';
  p.button.style.boxShadow = haloShadow(style.halo, p.accent, beat) + style.drop(p.accent);
  if (p.arrow) {
    (p.arrow as unknown as HTMLElement).style.transform = 'translateX(' + 7 * beat + 'px)';
  }

  renderGlare(p, t, spec.glare);
}

/**
 * The coloured light a button throws while it beats, ending in a comma so the
 * style's own shadow can be appended. A style with no halo contributes nothing
 * and is left with its shadow alone — that is what a matte button is.
 */
function haloShadow(strength: number, a: Accent, beat: number): string {
  if (strength <= 0) return '';
  return (
    `0 0 ${((24 + 66 * beat) * strength).toFixed(1)}px ` +
    `rgba(${a.rgb},${clamp01((0.28 + 0.46 * beat) * strength).toFixed(3)}),` +
    `0 0 ${((8 + 22 * beat) * strength).toFixed(1)}px ` +
    `rgba(255,255,255,${clamp01((0.1 + 0.18 * beat) * strength).toFixed(3)}),`
  );
}

/**
 * The entrance the layer itself performs, over whatever the thing inside it does.
 * `riseBy` is in canvas pixels and belongs to the layer: a button rises by a
 * fraction of its own height, and a full-canvas layer has no height to rise by.
 */
function applyEntrance(
  el: HTMLElement,
  kind: EnterAnimation,
  enter: number,
  riseBy: number,
): void {
  switch (kind) {
    case 'fade':
      el.style.opacity = String(enter);
      el.style.transform = '';
      return;
    case 'pop': {
      const k = easeOutBack(clamp01(enter));
      el.style.opacity = String(clamp01(enter * 1.6));
      el.style.transform = 'scale(' + (0.86 + 0.14 * k) + ')';
      return;
    }
    case 'rise': {
      const k = easeOutCubic(clamp01(enter));
      el.style.opacity = String(clamp01(enter * 1.6));
      el.style.transform = 'translateY(' + riseBy * (1 - k) + 'px)';
      return;
    }
    case 'none':
      el.style.opacity = '1';
      el.style.transform = '';
  }
}

const GLARE_PERIOD = 2.3;
const GLARE_SPAN = 0.46;

function renderGlare(p: ButtonParts, t: number, on: boolean): void {
  if (!on || p.style.sheen <= 0) {
    p.sheen.style.transform = 'translateX(-3000px)';
    p.flash.style.opacity = '0';
    return;
  }
  const cycle = (t % GLARE_PERIOD) / GLARE_PERIOD;
  const live = cycle < GLARE_SPAN;
  if (!live) {
    p.sheen.style.transform = 'translateX(-3000px)';
    p.flash.style.opacity = '0';
    return;
  }
  const q = easeInOutCubic(cycle / GLARE_SPAN);
  const travel = p.spec.rect.w + p.sheenWidth + 180;
  p.sheen.style.transform =
    'translateX(' + (-p.sheenWidth - 60 + travel * q) + 'px) skewX(-14deg)';
  p.flash.style.opacity =
    (0.62 * p.style.sheen * Math.sin(Math.PI * (cycle / GLARE_SPAN))).toFixed(3);
}
