// The template library. Each entry is the drawing half of a record whose fields
// and label live in the core — a template is a layout and an animation, and the
// model has no business knowing either.
//
// Adding a template is a record in `core/templates.ts` and a record here. The
// form in the panel, the library preview and the exporter all pick it up with no
// further change: nothing in the editor names a template.
import { TEMPLATES, type TemplateInfo } from '../../core/templates.ts';
import type { TemplateSpec } from '../../core/types.ts';
import { cardPanel } from './card-panel.ts';
import { cardPills } from './card-pills.ts';
import { cardSheet } from './card-sheet.ts';
import { donorTiers } from './donor-tiers.ts';
import { rowsBanner } from './rows-banner.ts';

export interface BuildContext {
  spec: TemplateSpec;
  /** The 1080x1920 box the layout is written against, already scaled to the canvas. */
  frame: HTMLElement;
}

export interface TemplateParts {
  /**
   * Re-measure whatever the layout depends on being laid out. Called once on
   * build and again when the webfonts land, because a panel measured against a
   * fallback face is a panel measured at the wrong height.
   */
  fit: () => void;
  /**
   * Draw the frame. `t` is time since the layer appeared, not since the video
   * started, so a panel set to arrive on the third second lives the same life it
   * would have lived arriving on the first. `enter` is the entrance progress the
   * core computed — the template spends it on whatever entrance is its own.
   */
  render: (t: number, enter: number) => void;
}

export interface TemplateDefinition extends TemplateInfo {
  build: (context: BuildContext) => TemplateParts;
}

const BUILDERS: Record<string, (context: BuildContext) => TemplateParts> = {
  'jobs-banner': rowsBanner({
    headKey: 'headline',
    listKey: 'jobs',
    ctaKey: 'linkLine',
    headSize: 104,
    rowSize: 52,
    rowPad: '18px 36px',
    gap: 20,
  }),
  'jobs-card-pills': cardPills,
  'jobs-card-panel': cardPanel,
  'jobs-card-sheet': cardSheet,
  'donor-tiers': donorTiers,
  rates: rowsBanner({
    headKey: 'ratesHead',
    accentKey: 'ratesAccent',
    listKey: 'rates',
    ctaKey: 'linkLine',
    headSize: 126,
    rowSize: 96,
    rowPad: '30px 44px',
    gap: 34,
  }),
};

/**
 * The library, as one list. A template the core describes but nobody drew is
 * left out rather than shipped as a blank frame — the compiler cannot catch a
 * missing record, so the library does.
 */
export const TEMPLATE_DEFINITIONS: readonly TemplateDefinition[] = TEMPLATES
  .flatMap(info => {
    const build = BUILDERS[info.id];
    return build === undefined ? [] : [{ ...info, build }];
  });

export const definitionById = (id: string): TemplateDefinition | null =>
  TEMPLATE_DEFINITIONS.find(d => d.id === id) ?? null;
