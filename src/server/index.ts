// Serves the editor, serves the render target, and turns a Spec into an mp4.
import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDER_TARGET_HTML, renderTargetScript } from './bundle.ts';
import { closeBrowser, removeQuietly, renderSpecToFile, SpecError, tempFile } from './render.ts';
import { ToolMissingError } from './ffmpeg.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const PORT = Number(process.env['PORT'] ?? 5180);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const app = express();
// Photos travel inside the spec as data URLs, so the body is large by design.
app.use(express.json({ limit: '80mb' }));

// Fonts, and the built editor when there is one.
app.use(express.static(path.join(root, 'public')));
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) app.use(express.static(dist));

app.get('/render.html', (_req, res) => {
  res.type('html').send(RENDER_TARGET_HTML);
});

app.get('/render-target.js', async (_req, res) => {
  try {
    res.type('js').send(await renderTargetScript());
  } catch (e) {
    res.status(500).type('text').send('render target bundle failed: ' + (e as Error).message);
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/render', async (req, res) => {
  const file = tempFile('.mp4');
  try {
    await renderSpecToFile(req.body, ORIGIN, file);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="creative.mp4"');
    res.setHeader('Content-Length', String(fs.statSync(file).size));
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(file).on('error', reject).on('end', resolve).pipe(res);
    });
  } catch (e) {
    const message = (e as Error).message;
    console.error('render failed:', message);
    if (res.headersSent) res.destroy();
    else res.status(e instanceof SpecError ? 400 : e instanceof ToolMissingError ? 503 : 500)
      .json({ error: message });
  } finally {
    removeQuietly(file);
  }
});

const server = app.listen(PORT, () => {
  console.log(`Creative Factory Search -> ${ORIGIN}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void closeBrowser().then(() => process.exit(0));
  });
}
