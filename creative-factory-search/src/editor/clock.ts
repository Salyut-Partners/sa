// The preview clock lives outside React on purpose: sixty state updates a
// second would re-render the whole editor to move one button. Cells subscribe
// and draw themselves.
//
// It also owns the transport — playing, paused, scrubbed to a second. Time is a
// property of the preview, not of the model: nothing here reaches a Spec, and
// the exporter walks its own frames from zero regardless of where this sits.
type Listener = (t: number) => void;

export class Clock {
  private listeners = new Set<Listener>();
  private frame = 0;
  /** When `t` was zero, in `performance.now()` terms. Only meaningful while playing. */
  private origin = 0;
  private at = 0;
  private running = true;
  /** Written by whoever owns the transport when the video gets longer or shorter. */
  duration: number;

  constructor(duration: number) {
    this.duration = duration;
  }

  get time(): number {
    return this.at;
  }

  get playing(): boolean {
    return this.running;
  }

  /** A new cell joins mid-loop, so it is given the current frame rather than zero. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.at);
    this.tick();
    return () => {
      this.listeners.delete(listener);
      this.tick();
    };
  }

  play(): void {
    if (this.running) return;
    this.running = true;
    // `tick` picks the loop up from `at`, so this resumes where the scrubber
    // left it rather than from zero.
    this.tick();
  }

  pause(): void {
    this.running = false;
    this.tick();
  }

  /** Move to a time and draw it, playing or not. */
  seek(t: number): void {
    this.at = Math.min(Math.max(0, t), this.span());
    this.origin = performance.now() - this.at * 1000;
    this.emit();
  }

  /** The length the loop wraps at. Never zero, or the wrap would divide by it. */
  private span(): number {
    return Math.max(0.1, this.duration);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.at);
  }

  /** Start or stop the loop to match what is wanted: playing, with someone watching. */
  private tick(): void {
    const wanted = this.running && this.listeners.size > 0;
    const looping = this.frame > 0;
    if (wanted === looping) return;
    if (!wanted) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      return;
    }
    this.origin = performance.now() - this.at * 1000;
    const step = (): void => {
      this.at = ((performance.now() - this.origin) / 1000) % this.span();
      this.emit();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
}
