// The template library. Each entry is the drawing half of a record whose fields
// and label live in the core — a template is a layout and an animation, and the
// model has no business knowing either.
//
// Adding a template is a record in `core/templates.ts` and a record here. The
// form in the panel, the library preview and the exporter all pick it up with no
// further change: nothing in the editor names a template.
import { TEMPLATES, type TemplateInfo } from '../../core/templates.ts';
import type { TemplateSpec } from '../../core/types.ts';
import { aviaStrip } from './avia-strip.ts';
import { donorTiers } from './donor-tiers.ts';
import { gaugeSwap } from './gauge-swap.ts';
import { guideArc } from './guide-arc.ts';
import { headlineBlocks } from './headline-blocks.ts';
import { newsBox } from './news-box.ts';
import { newsTab } from './news-tab.ts';
import { newsTv } from './news-tv.ts';
import { noticeAlert } from './notice-alert.ts';
import { noticeBubble } from './notice-bubble.ts';
import { noticePush } from './notice-push.ts';
import { optionTiles } from './option-tiles.ts';
import { photoPanel } from './photo-panel.ts';
import { rateSlider } from './rate-slider.ts';
import { rowsBanner } from './rows-banner.ts';
import { stepsCard } from './steps-card.ts';
import { tierRowsTemplate } from './tier-rows.ts';
import { verdictPills } from './verdict-pills.ts';

export interface BuildContext {
  spec: TemplateSpec;
  /** The 1080x1920 box the layout is written against, already scaled to the canvas. */
  frame: HTMLElement;
  /**
   * Whether the frame is read right to left.
   *
   * The stylesheet mirrors what it can off the frame's own `dir`, which covers
   * every layout whose parts are laid out by the flow. What it cannot reach is
   * anything a template writes as a number at build time — the direction a row
   * slides in from, the end of the track a slider fills from — and those are the
   * lines that would otherwise leave a Hebrew creative entering from the side
   * the eye leaves by. Told rather than read off the DOM: a library thumbnail is
   * built before it is anywhere, and a layout should not have to be attached to
   * know which way round it is.
   */
  rtl: boolean;
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
  'avia-strip': aviaStrip,
  'donor-tiers': donorTiers,
  'tier-rows': tierRowsTemplate,
  'rate-slider': rateSlider,
  'news-tab': newsTab,
  'news-tv': newsTv,
  'news-box': newsBox,
  'headline-blocks': headlineBlocks,
  'photo-panel': photoPanel,
  'verdict-pills': verdictPills,
  'option-tiles': optionTiles,
  'steps-card': stepsCard,
  'gauge-swap': gaugeSwap,
  'notice-push': noticePush,
  'notice-alert': noticeAlert,
  'notice-bubble': noticeBubble,
  'guide-arc': guideArc,
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
