// Spec -> mp4. The page is driven one frame at a time: set the time, screenshot,
// push the JPEG into ffmpeg. Nothing here decides how the creative looks.
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

const getBrowser = (): Promise<Browser> =>
  (browserPromise ??= puppeteer.launch({
    headless: 'shell',
    args: [
      '--no-sandbox',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--disable-lcd-text',
      '--font-render-hinting=none',
    ],
  }));

export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (pending) await (await pending).close().catch(() => {});
}

export const tempFile = (ext: string): string =>
  path.join(os.tmpdir(), 'cfs-' + crypto.randomUUID() + ext);

export class SpecError extends Error {}

export function assertRenderable(spec: Spec): void {
  if (!spec || typeof spec !== 'object') throw new SpecError('порожній spec');
  if (!spec.image) throw new SpecError('у spec немає зображення');
  const { width, height } = spec.canvas ?? {};
  if (!(width > 0 && height > 0)) throw new SpecError('некоректний розмір полотна');
  if (!(spec.fps > 0)) throw new SpecError('некоректний fps');
  const frames = Math.round(spec.duration * spec.fps);
  if (!(frames >= 1 && frames <= MAX_FRAMES)) throw new SpecError('тривалість поза межами');
}

/** Render `spec` into `outFile`. `origin` is where the render target is served from. */
export async function renderSpecToFile(spec: Spec, origin: string, outFile: string): Promise<void> {
  assertRenderable(spec);

  const browser = await getBrowser();
  let page: Page | null = null;
  try {
    page = await browser.newPage();
    await page.setViewport({
      width: spec.canvas.width,
      height: spec.canvas.height,
      deviceScaleFactor: 1,
    });
    await page.goto(origin + '/render.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(s => window.__init(s), spec);
    // A half-decoded background would be captured as a blank frame.
    await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('.cf-base');
      return img && !img.complete ? img.decode().catch(() => undefined) : undefined;
    });
    await page.evaluate(() => document.fonts.ready);

    const encoder = spawnEncoder(spec.fps, outFile);
    const frames = Math.round(spec.duration * spec.fps);

    for (let i = 0; i < frames; i++) {
      await page.evaluate(t => window.__render(t), i / spec.fps);
      const frame = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!encoder.stdin.write(frame)) {
        await new Promise<void>(resolve => encoder.stdin.once('drain', () => resolve()));
      }
    }
    encoder.stdin.end();
    await encoder.done;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

export const removeQuietly = (file: string): void => {
  fs.promises.unlink(file).catch(() => {});
};
