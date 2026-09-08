// Spec -> mp4, without the sound. The page is driven one frame at a time: set
// the time, screenshot, push the JPEG into ffmpeg. Nothing here decides how the
// creative looks, and nothing here knows about batches.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import type { Spec } from '../core/types.ts';
import { spawnEncoder } from './ffmpeg.ts';

/** A ten-minute video at 60 fps — far past anything a creative needs, close enough to catch a bad number. */
const MAX_FRAMES = 36_000;

let browserPromise: Promise<Browser> | null = null;

/**
 * The render browser: launched once and kept, because starting one costs more
 * than a whole short video.
 *
 * Kept, but not trusted. A handle whose browser has gone answers every call
 * with "Connection closed", and a memo that never looks would hand that same
 * dead handle to every export from then until the server was restarted — a
 * batch of twelve failing twelve times in a row, instantly, with a message
 * about a connection the user never made. The browser outlives any one export
 * and so has time to die between them: the machine sleeps, the shell is killed,
 * a crash takes it. So liveness is asked at the moment of use, which is the
 * only moment the answer is worth anything.
 *
 * A launch that failed is dropped for the same reason: a rejected promise left
 * in the memo is a permanent outage caused by one bad minute.
 */
async function getBrowser(): Promise<Browser> {
  const pending = browserPromise;
  if (pending !== null) {
    const browser = await pending.catch(() => null);
    if (browser !== null && browser.connected) return browser;
    // Only if no one has replaced it meanwhile: several workers reach here at
    // once, and the second must not throw away the browser the first just made.
    if (browserPromise === pending) browserPromise = null;
  }
  return (browserPromise ??= launchBrowser());
}

const launchBrowser = (): Promise<Browser> =>
  puppeteer.launch({
    headless: 'shell',
    // Over a pipe rather than a socket on a port, for two failures seen on this
    // machine: a localhost connection does not always survive the laptop
    // sleeping, and a browser attached only by a port lives on as an orphan
    // when its parent is killed outright — one had been holding memory for
    // eight days. A pipe closes when the process at the other end goes, and the
    // browser leaves with it.
    pipe: true,
    args: [
      '--no-sandbox',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--disable-lcd-text',
      '--font-render-hinting=none',
    ],
  });

export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  // Nothing here may throw: this runs on the way out of the process, and a
  // launch that had failed would otherwise reject on shutdown and leave the
  // exit that was waiting on it unreached.
  const browser = pending === null ? null : await pending.catch(() => null);
  if (browser !== null) await browser.close().catch(() => {});
}

export const tempFile = (ext: string): string =>
  path.join(os.tmpdir(), 'cfs-' + crypto.randomUUID() + ext);

export class SpecError extends Error {}

/** Thrown when the user cancelled the job this render belonged to. */
export class CancelledError extends Error {
  constructor() {
    super('скасовано');
    this.name = 'CancelledError';
  }
}

export function assertRenderable(spec: Spec, duration: number): void {
  if (!spec || typeof spec !== 'object') throw new SpecError('порожній spec');
  if (!spec.image) throw new SpecError('у spec немає зображення');
  const { width, height } = spec.canvas ?? {};
  if (!(width > 0 && height > 0)) throw new SpecError('некоректний розмір полотна');
  if (!(spec.fps > 0)) throw new SpecError('некоректний fps');
  const frames = Math.round(duration * spec.fps);
  if (!(frames >= 1 && frames <= MAX_FRAMES)) throw new SpecError('тривалість поза межами');
}

export interface RenderOptions {
  /** Where the render target is served from. */
  origin: string;
  /**
   * How long the video runs. Passed in rather than read off the Spec because a
   * group's length is decided by the longest voice-over in it, which is not
   * known until the speech has been made.
   */
  duration: number;
  /** Asked between frames. A job the user has abandoned should stop, not finish. */
  cancelled?: () => boolean;
}

/** Render one Spec into `outFile` as a silent mp4. */
export async function renderSpecToFile(
  spec: Spec,
  outFile: string,
  options: RenderOptions,
): Promise<void> {
  const { origin, duration, cancelled } = options;
  assertRenderable(spec, duration);

  const browser = await getBrowser();
  let page: Page | null = null;
  let encoder: ReturnType<typeof spawnEncoder> | null = null;
  try {
    page = await browser.newPage();
    await page.setViewport({
      width: spec.canvas.width,
      height: spec.canvas.height,
      deviceScaleFactor: 1,
    });
    await page.goto(origin + '/render.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    // The page is built at the length it will be walked at, so a layer with an
    // open end reaches the new end rather than the one the user authored at.
    await page.evaluate(s => window.__init(s), { ...spec, duration });
    // A half-decoded image would be captured as a blank frame. Every image on
    // the page rather than the photo alone: a prop is fetched from the catalogue
    // over the network, so it lands later than a photo that came in the spec.
    await page.evaluate(() => Promise.all(
      [...document.images]
        .filter(img => !img.complete)
        .map(img => img.decode().catch(() => undefined)),
    ).then(() => undefined));
    await page.evaluate(() => document.fonts.ready);

    encoder = spawnEncoder(spec.fps, outFile);
    const frames = Math.round(duration * spec.fps);

    for (let i = 0; i < frames; i++) {
      if (cancelled?.()) throw new CancelledError();
      await page.evaluate(t => window.__render(t), i / spec.fps);
      const frame = await page.screenshot({ type: 'jpeg', quality: 95 });
      await encoder.write(frame);
    }
    encoder.stdin.end();
    await encoder.done;
    encoder = null;
  } finally {
    // A half-fed encoder left running would hold the temp file open and the
    // process alive long after the job it belonged to was abandoned.
    if (encoder) encoder.kill();
    if (page) await page.close().catch(() => {});
  }
}

export const removeQuietly = (file: string): void => {
  fs.promises.unlink(file).catch(() => {});
};
