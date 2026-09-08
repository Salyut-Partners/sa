import { useEffect, useRef, type ReactNode } from 'react';
import { build, type CreativeHandle } from '../renderer/index.ts';
import type { Spec } from '../core/types.ts';
import type { Clock } from './clock.ts';

interface Props {
  spec: Spec;
  scale: number;
  /** Selected cells run; the rest sit on their poster frame. */
  animate: boolean;
  clock: Clock;
  posterAt: number;
  /** In the set the panel writes to. */
  selected?: boolean;
  /** The one the panel reads its single values from — always also selected. */
  active?: boolean;
  caption?: string;
  onSelect?: (additive: boolean) => void;
  overlay?: ReactNode;
}

export function CreativeCell(props: Props) {
  const { spec, scale, animate, clock, posterAt } = props;
  const stage = useRef<HTMLDivElement>(null);
  const handle = useRef<CreativeHandle | null>(null);

  useEffect(() => {
    handle.current = build(stage.current!, spec);
    handle.current.render(animate ? 0 : posterAt);
    // `spec` is memoised upstream, so this reruns on a real change, not per frame.
  }, [spec]);

  useEffect(() => {
    if (!animate) {
      handle.current?.render(posterAt);
      return;
    }
    return clock.subscribe(t => handle.current?.render(t));
  }, [animate, clock, posterAt, spec]);

  return (
    <div
      className={
        'cell' + (props.selected ? ' selected' : '') + (props.active ? ' active' : '')
      }
      style={{ width: spec.canvas.width * scale, height: spec.canvas.height * scale }}
      onPointerDown={e => props.onSelect?.(e.metaKey || e.ctrlKey || e.shiftKey)}
    >
      <div className="scaler" style={{ transform: `scale(${scale})` }}>
        <div ref={stage} />
      </div>
      {props.overlay}
      {props.caption ? <div className="caption">{props.caption}</div> : null}
    </div>
  );
}
