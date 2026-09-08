// Entry point for the page Puppeteer drives. It exposes exactly two hooks and
// builds the creative through the same `build` the editor uses — the export has
// no drawing code of its own.
import type { Spec } from '../core/types.ts';
import { build, type CreativeHandle } from './build.ts';

declare global {
  interface Window {
    __init: (spec: Spec) => boolean;
    __render: (t: number) => void;
  }
}

let handle: CreativeHandle | null = null;

window.__init = (spec: Spec): boolean => {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('render target has no #stage');
  handle = build(stage, spec);
  return true;
};

window.__render = (t: number): void => {
  if (!handle) throw new Error('__render called before __init');
  handle.render(t);
};
