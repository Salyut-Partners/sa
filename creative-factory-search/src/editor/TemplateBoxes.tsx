import { useRef } from 'react';
import { clampShift } from '../core/canvas.ts';
import type { TemplateSlot } from '../core/project.ts';
import type { Photo, Rect } from '../core/types.ts';
import type { TemplateReach } from '../renderer/index.ts';
import { frameStyle } from './DragBox.tsx';

/** A layer's place, in percent of the frame, as a patch writes it. */
export interface Shift {
  offsetX: number;
  offsetY: number;
}

interface Props {
  photo: Photo;
  /** What the renderer measured of each layer; a slot it has not measured has no box. */
  reach: Partial<Record<TemplateSlot, TemplateReach>>;
  active: TemplateSlot | null;
  cellWidth: number;
  cellHeight: number;
  onSelect: (slot: TemplateSlot) => void;
  onMove: (slot: TemplateSlot, shift: Shift) => void;
}

const SLOTS: readonly TemplateSlot[] = ['template', 'overlay'];

/** Two places after the point: a pixel of the frame is a twentieth of a percent. */
const tidy = (v: number): number => Math.round(v * 100) / 100;

/** The content's box on the canvas, in percent of the canvas, moved as far as the frame lets it. */
function shownBox(reach: TemplateReach, shift: { x: number; y: number }): Rect {
  const { box, frame } = reach;
  return {
    x: frame.x + ((box.x + shift.x) / 100) * frame.w,
    y: frame.y + ((box.y + shift.y) / 100) * frame.h,
    w: (box.w / 100) * frame.w,
    h: (box.h / 100) * frame.h,
  };
}

/**
 * The photo's layout and its overlay, as things to take hold of. The box is
 * drawn round what the layout paints, not round the frame it is written on,
 * so it is the panel the user sees that they drag — and a scrim, which stays
 * put, is not in it.
 *
 * Drawn under the buttons' boxes: a button sits over a layout on the frame,
 * and the one in front is the one a click should reach.
 */
export function TemplateBoxes(props: Props) {
  const { photo, reach, active, cellWidth, cellHeight } = props;
  const drag = useRef<{ slot: TemplateSlot; x: number; y: number; from: { x: number; y: number } } | null>(null);

  const onPointerMove = (e: React.PointerEvent): void => {
    const state = drag.current;
    const r = state === null ? undefined : reach[state.slot];
    if (state === null || r === undefined) return;
    // Pointer pixels to percent of the frame: the frame may be letterboxed on
    // a photo of another shape, so it is its width on screen that counts.
    const dx = ((e.clientX - state.x) / ((r.frame.w / 100) * cellWidth)) * 100;
    const dy = ((e.clientY - state.y) / ((r.frame.h / 100) * cellHeight)) * 100;
    const next = clampShift(r.box, { x: state.from.x + dx, y: state.from.y + dy });
    props.onMove(state.slot, { offsetX: tidy(next.x), offsetY: tidy(next.y) });
  };

  const stop = (e: React.PointerEvent): void => {
    if (!drag.current) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <>
      {SLOTS.map(slot => {
        const layer = photo[slot];
        const r = reach[slot];
        if (layer === null || r === undefined) return null;
        const shift = clampShift(r.box, { x: layer.offsetX, y: layer.offsetY });
        const style = frameStyle(shownBox(r, shift), cellWidth, cellHeight);
        return slot === active ? (
          <div
            key={slot}
            className="box template"
            style={style}
            onPointerDown={e => {
              e.stopPropagation();
              e.preventDefault();
              drag.current = { slot, x: e.clientX, y: e.clientY, from: shift };
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={stop}
            onPointerCancel={stop}
          />
        ) : (
          <div
            key={slot}
            className="box idle template"
            style={style}
            onPointerDown={e => {
              // As with a button's box: without this the cell reads the click
              // as "make this photo active" and drops the selection to one.
              e.stopPropagation();
              props.onSelect(slot);
            }}
          />
        );
      })}
    </>
  );
}
