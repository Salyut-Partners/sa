import type { ButtonLayer, Rect } from '../core/types.ts';
import { DragBox, frameStyle } from './DragBox.tsx';

interface Props {
  buttons: readonly ButtonLayer[];
  /** The one being edited, and the only one with handles. */
  activeIndex: number | null;
  cellWidth: number;
  cellHeight: number;
  onSelect: (index: number) => void;
  onChange: (rect: Rect) => void;
}

/**
 * Every button on the active photo, as something to click. Picking a button off
 * the frame is how a composition is actually edited — a list of labels tells you
 * a photo has three buttons but not which of them is the one in the way.
 *
 * Only the selected button carries handles. The rest are outlines: visible
 * enough to aim at, quiet enough not to read as part of the creative.
 */
export function ButtonBoxes(props: Props) {
  const { buttons, activeIndex, cellWidth, cellHeight } = props;

  return (
    <>
      {buttons.map((button, index) =>
        index === activeIndex ? null : (
          <div
            key={button.id}
            className="box idle"
            style={frameStyle(button.rect, cellWidth, cellHeight)}
            onPointerDown={e => {
              // Without this the click falls through to the cell, which reads it
              // as "make this photo active" and drops the selection down to one.
              e.stopPropagation();
              props.onSelect(index);
            }}
          />
        ))}
      {/* Last, so the button being edited is the one on top of the pile. */}
      {activeIndex !== null && buttons[activeIndex] ? (
        <DragBox
          rect={buttons[activeIndex]!.rect}
          cellWidth={cellWidth}
          cellHeight={cellHeight}
          onChange={props.onChange}
        />
      ) : null}
    </>
  );
}
