import { useEffect, useRef, useState } from 'react';
import type { Clock } from './clock.ts';

interface Props {
  clock: Clock;
  duration: number;
}

/**
 * The transport under the grid: play, pause, and a second to stop on.
 *
 * It writes the playhead into the DOM by hand instead of holding it in state.
 * The clock ticks sixty times a second, and a component that re-rendered on
 * each one would re-render the editor to move a slider thumb — the same reason
 * the cells subscribe to the clock rather than being handed a time.
 */
export function Timeline({ clock, duration }: Props) {
  const slider = useRef<HTMLInputElement>(null);
  const readout = useRef<HTMLElement>(null);
  /** Set while the user owns the thumb, so the clock does not fight them for it. */
  const scrubbing = useRef(false);
  const [playing, setPlaying] = useState(clock.playing);

  useEffect(() => clock.subscribe(t => {
    if (readout.current) readout.current.textContent = t.toFixed(2);
    if (slider.current && !scrubbing.current) slider.current.value = String(t);
  }), [clock]);

  const pause = (): void => {
    clock.pause();
    setPlaying(false);
  };

  return (
    <div className="timeline">
      <button
        className="transport"
        title={playing ? 'Пауза' : 'Грати'}
        onClick={() => {
          if (playing) return pause();
          clock.play();
          setPlaying(true);
        }}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        ref={slider}
        min={0}
        max={duration}
        step={0.01}
        defaultValue={clock.time}
        // Grabbing the thumb stops the clock: scrubbing against a running
        // preview means never landing on the second you were aiming for.
        onPointerDown={() => { scrubbing.current = true; pause(); }}
        // Capture ends however the drag does, including off the edge of the
        // control — a pointerup that never arrives would leave the thumb
        // permanently detached from the clock.
        onLostPointerCapture={() => { scrubbing.current = false; }}
        onChange={e => clock.seek(Number(e.target.value))}
      />
      <span className="readout">
        <b ref={readout}>{clock.time.toFixed(2)}</b> / {duration.toFixed(1)} с
      </span>
    </div>
  );
}
