import { useMemo } from 'react';
import { NO_TEMPLATE, type Shared } from '../core/selection.ts';
import type { CanvasSize, Locale } from '../core/types.ts';
import { TEMPLATE_DEFINITIONS, templatePreviewSpec } from '../renderer/index.ts';
import { Clock } from './clock.ts';
import { CreativeCell } from './CreativeCell.tsx';

/** Wide enough to tell one layout from another; a chip narrower reads as a smudge. */
const CHIP_WIDTH = 136;
/** The catalogue runs on its own loop — the chips are not part of the video. */
const chipClock = new Clock(6);

/**
 * What a template chip is drawn over. The panels are white on a photo, so a
 * chip on black would flatter every one of them; a mid-tone stands in for the
 * kind of frame they are actually made to go over.
 */
const BACKDROP =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="16">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#5b6472"/><stop offset="1" stop-color="#171b23"/>' +
    '</linearGradient></defs><rect width="9" height="16" fill="url(#g)"/></svg>',
  );

interface Props {
  /** Shared, so a selection that disagrees on the template highlights nothing. */
  selectedId: Shared<string>;
  canvas: CanvasSize;
  color: string;
  /** The language being worked in, so a chip reads as the frame would. */
  locale: Locale;
  onPick: (definitionId: string | null) => void;
}

/**
 * The template library: every entry drawn by the renderer that will draw the
 * video, with the words the dictionary would put on it. Reading the layouts off
 * a list of names is what this exists to end.
 */
export function TemplateLibrary({ selectedId, canvas, color, locale, onPick }: Props) {
  const scale = CHIP_WIDTH / canvas.width;

  const chips = useMemo(
    () => TEMPLATE_DEFINITIONS.map(definition => ({
      definition,
      spec: templatePreviewSpec(definition.id, { canvas, image: BACKDROP, color, locale }),
    })),
    [canvas, color, locale],
  );

  const picked = (id: string): boolean => !selectedId.mixed && selectedId.value === id;

  return (
    <div className="templates">
      <button
        type="button"
        className={'template-card' + (picked(NO_TEMPLATE) ? ' on' : '')}
        onClick={() => onPick(null)}
      >
        <div
          className="template-preview empty"
          style={{ width: CHIP_WIDTH, height: canvas.height * scale }}
        >
          ✕
        </div>
        <span className="name">Без шаблону</span>
      </button>

      {chips.map(({ definition, spec }) => (
        <button
          key={definition.id}
          type="button"
          className={'template-card' + (picked(definition.id) ? ' on' : '')}
          onClick={() => onPick(definition.id)}
        >
          <div className="template-preview" style={{ height: canvas.height * scale }}>
            <CreativeCell spec={spec} scale={scale} animate clock={chipClock} posterAt={0} />
          </div>
          <span className="name">{definition.label}</span>
        </button>
      ))}
    </div>
  );
}
