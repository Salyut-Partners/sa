import { useMemo } from 'react';
import type { Shared } from '../core/selection.ts';
import { BUTTON_STYLES, previewSpec } from '../renderer/index.ts';
import { Clock } from './clock.ts';
import { CreativeCell } from './CreativeCell.tsx';

const CHIP_SCALE = 0.52;
/** The catalogue chips run on their own loop — they are not part of the video. */
const chipClock = new Clock(3);

interface Props {
  /** Shared so that a selection disagreeing on style highlights nothing. */
  selectedId: Shared<string>;
  color: string;
  text: string;
  onPick: (styleId: string) => void;
}

/** The button library: every entry drawn by the renderer that will draw the video. */
export function StyleLibrary({ selectedId, color, text, onPick }: Props) {
  const chips = useMemo(
    () => BUTTON_STYLES.map(style => ({ style, spec: previewSpec(style.id, { color, text }) })),
    [color, text],
  );

  return (
    <div className="styles">
      {chips.map(({ style, spec }) => (
        <button
          key={style.id}
          className={'style-card' + (!selectedId.mixed && style.id === selectedId.value ? ' on' : '')}
          onClick={() => onPick(style.id)}
          type="button"
        >
          <div className="style-preview" style={{ height: spec.canvas.height * CHIP_SCALE }}>
            <CreativeCell spec={spec} scale={CHIP_SCALE} animate clock={chipClock} posterAt={0} />
          </div>
          <span className="name">{style.label}</span>
        </button>
      ))}
    </div>
  );
}
