// The preview clock lives outside React on purpose: sixty state updates a
// second would re-render the whole editor to move one button. Cells subscribe
// and draw themselves.
type Listener = (t: number) => void;

export class Clock {
  private listeners = new Set<Listener>();
  private frame = 0;
  private startedAt = 0;
  duration: number;

  constructor(duration: number) {
    this.duration = duration;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private start(): void {
    this.startedAt = performance.now();
    const tick = (): void => {
      const t = ((performance.now() - this.startedAt) / 1000) % Math.max(0.1, this.duration);
      for (const listener of this.listeners) listener(t);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
