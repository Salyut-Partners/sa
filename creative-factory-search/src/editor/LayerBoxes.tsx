import type { Rect } from '../core/types.ts';
import { DragBox, frameStyle } from './DragBox.tsx';

/** As much of a layer as a box on the frame needs to know about it. */
export interface Boxed {
  id: string;
  rect: Rect;
}

interface Props {
  layers: readonly Boxed[];
  /** The one being edited, and the only one with handles. */
  activeIndex: number | null;
  cellWidth: number;
  cellHeight: number;
  onSelect: (index: number) => void;
  onChange: (rect: Rect) => void;
}

/**
 * One kind of layer on the active photo, as something to click. Picking a layer
 * off the frame is how a composition is actually edited — a list of labels tells
 * you a photo has three buttons but not which of them is the one in the way.
 *
 * Only the selected one carries handles. The rest are outlines: visible enough
 * to aim at, quiet enough not to read as part of the creative.
 */
export function LayerBoxes(props: Props) {
  const { layers, activeIndex, cellWidth, cellHeight } = props;

  return (
    <>
      {layers.map((layer, index) =>
        index === activeIndex ? null : (
          <div
            key={layer.id}
            className="box idle"
            style={frameStyle(layer.rect, cellWidth, cellHeight)}
            onPointerDown={e => {
              // Without this the click falls through to the cell, which reads it
              // as "make this photo active" and drops the selection down to one.
              e.stopPropagation();
              props.onSelect(index);
            }}
          />
        ))}
      {/* Last, so the one being edited is on top of the pile. */}
      {activeIndex !== null && layers[activeIndex] ? (
        <DragBox
          rect={layers[activeIndex]!.rect}
          cellWidth={cellWidth}
          cellHeight={cellHeight}
          onChange={props.onChange}
        />
      ) : null}
    </>
  );
}
