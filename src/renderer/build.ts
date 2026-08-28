// The single renderer. The editor grid, the library thumbnails and the headless
// exporter all call this — which is the whole reason the preview can be trusted.
//
// Every frame is a pure function of `t`: no CSS transitions, no rAF, no clock.
// The frame walk sets a time and screenshots; anything time-dependent that is
// not derived from `t` would desync the export from what was on screen.
import { layerStateAt } from '../core/timing.ts';
import type { ButtonSpec, EnterAnimation, Spec, TemplateSpec } from '../core/types.ts';
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
}

// `currentColor` rather than white: the arrow is part of the label, and a style
// that writes in the accent (or in near-black, on a white fill) needs it to follow.
const ARROW_SVG =
  '<svg class="cf-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

/** The template layer, if the photo wears one. */
interface TemplatePlace {
  spec: TemplateSpec;
  layer: HTMLElement;
  parts: TemplateParts;
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

export function build(root: HTMLElement, spec: Spec): CreativeHandle {
  ensureRendererStyle(root.ownerDocument);

  root.className = 'cf-stage';
  root.style.width = spec.canvas.width + 'px';
  root.style.height = spec.canvas.height + 'px';

  // The order of the frame: photo, then at most one template, then the buttons
  // in the order of their list. A button is meant to be laid over a template,
  // never under one.
  root.innerHTML =
    '<div class="cf-wrap">' +
    '<img class="cf-base" alt="">' +
    (spec.template === null ? '' : '<div class="cf-layer cf-tpl"><div class="cf-tpl-frame"></div></div>') +
    spec.buttons.map(buttonHtml).join('') +
    '</div>';

  const wrap = root.querySelector<HTMLElement>('.cf-wrap')!;
  const base = root.querySelector<HTMLImageElement>('.cf-base')!;
  if (spec.image) base.src = spec.image;

  const template = dressTemplate(spec, root);
  const layers = [...root.querySelectorAll<HTMLElement>('.cf-btn-layer')];
  const parts: ButtonParts[] = spec.buttons.map((b, i) => dressButton(b, layers[i]!));

  const fitAll = (): void => {
    parts.forEach(fitText);
    template?.parts.fit();
  };
  fitAll();
  // Text measured before the webfont lands is measured against a fallback face,
  // so a label can end up a size too large and a panel a line too tall. Re-fit
  // once the real fonts are in.
  root.ownerDocument.fonts?.ready.then(fitAll).catch(() => {});

  function render(t: number): void {
    wrap.style.transform = 'scale(' + (spec.pushIn ? 1 + 0.022 * (t / spec.duration) : 1) + ')';
    if (template) renderTemplate(template, t, spec);
    for (const p of parts) renderButton(p, t, spec);
  }

  render(0);
  return { render, spec };
}

/**
 * Put the template on the frame, or answer nothing when the photo wears none —
 * or names one this build does not carry, which a project saved against an older
 * library can. A creative short a panel beats one that refuses to build.
 */
function dressTemplate(spec: Spec, root: HTMLElement): TemplatePlace | null {
  const layer = root.querySelector<HTMLElement>('.cf-tpl');
  const definition = spec.template === null ? null : definitionById(spec.template.definitionId);
  if (layer === null || spec.template === null || definition === null) {
    layer?.remove();
    return null;
  }

  const frame = layer.querySelector<HTMLElement>('.cf-tpl-frame')!;
  // Every template is written against one frame size and scaled to the canvas,
  // so a second output size is this line rather than four re-measured layouts.
  frame.style.transform = 'scale(' + spec.canvas.width / DESIGN.width + ')';

  return { spec: spec.template, layer, parts: definition.build({ spec: spec.template, frame }) };
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
