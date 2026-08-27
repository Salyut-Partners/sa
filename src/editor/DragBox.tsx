import { useRef } from 'react';
import { clampRect } from '../core/canvas.ts';
import { MIN_BUTTON_SIZE } from '../core/project.ts';
import type { Rect } from '../core/types.ts';

interface Props {
  rect: Rect;
  cellWidth: number;
  cellHeight: number;
  onChange: (rect: Rect) => void;
}

/**
 * The handle for moving and sizing a button. It works in percent throughout, so
 * the same gesture means the same thing whatever the cell is scaled to — and so
 * a drag on the active photo lands identically on every other selected one.
 */
export function DragBox({ rect, cellWidth, cellHeight, onChange }: Props) {
  const drag = useRef<{ mode: 'move' | 'size'; x: number; y: number; from: Rect } | null>(null);

  const onPointerDown = (e: React.PointerEvent, mode: 'move' | 'size'): void => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { mode, x: e.clientX, y: e.clientY, from: rect };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const state = drag.current;
    if (!state) return;
    const dx = ((e.clientX - state.x) / cellWidth) * 100;
    const dy = ((e.clientY - state.y) / cellHeight) * 100;
    const next: Rect = state.mode === 'move'
      ? { ...state.from, x: state.from.x + dx, y: state.from.y + dy }
      : { ...state.from, w: state.from.w + dx, h: state.from.h + dy };
    onChange(clampRect(next, MIN_BUTTON_SIZE));
  };

  const stop = (e: React.PointerEvent): void => {
    if (!drag.current) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="box"
      style={{
        left: (rect.x / 100) * cellWidth,
        top: (rect.y / 100) * cellHeight,
        width: (rect.w / 100) * cellWidth,
        height: (rect.h / 100) * cellHeight,
      }}
      onPointerDown={e => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <div className="grip" onPointerDown={e => onPointerDown(e, 'size')} />
    </div>
  );
}
