// Serves the editor, serves the render target, and runs the export queue.
import 'dotenv/config';
import { ZipArchive } from 'archiver';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocaleId } from '../core/locales.ts';
import { VOICE_MODELS } from '../core/voice.ts';
import {
  BadRequestError, cancelJob, jobById, outputsOf, startBatch, statusOf,
} from './batch.ts';
import { RENDER_TARGET_HTML, renderTargetScript } from './bundle.ts';
import { closeBrowser } from './render.ts';
import { listVoices } from './tts.ts';
import { NoTranslatorError, translateAll, translator } from './translate.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const PORT = Number(process.env['PORT'] ?? 5180);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const app = express();
// Photos travel inside the spec as data URLs, and a batch carries one per
// creative, so the body is very large by design.
app.use(express.json({ limit: '400mb' }));

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

/** What the panel needs to offer a voice, a model and a translate button. */
app.get('/api/voices', async (_req, res) => {
  const catalogue = await listVoices();
  res.json({ ...catalogue, models: VOICE_MODELS, translator: translator() });
});

app.post('/api/translate', async (req, res) => {
  const body = req.body as { texts?: unknown; targets?: unknown };
  const texts = Array.isArray(body.texts) ? body.texts.map(String) : [];
  const targets = (Array.isArray(body.targets) ? body.targets : []).filter(isLocaleId);
  if (texts.length === 0 || targets.length === 0) {
    res.status(400).json({ error: 'нема що перекладати' });
    return;
  }
  try {
    res.json(await translateAll(texts, targets));
  } catch (e) {
    res.status(e instanceof NoTranslatorError ? 501 : 502).json({ error: (e as Error).message });
  }
});

// ------------------------------------------------------------------ export --

app.post('/api/batch', (req, res) => {
  try {
    res.json({ id: startBatch(req.body, ORIGIN) });
  } catch (e) {
    if (e instanceof BadRequestError) res.status(400).json({ error: e.message });
    else {
      console.error('batch failed to start:', (e as Error).message);
      res.status(500).json({ error: (e as Error).message });
    }
  }
});

app.get('/api/batch/:id', (req, res) => {
  const job = jobById(req.params.id);
  if (job === undefined) res.status(404).json({ error: 'задачі більше немає' });
  else res.json(statusOf(job));
});

app.delete('/api/batch/:id', (req, res) => {
  const job = jobById(req.params.id);
  if (job === undefined) {
    res.status(404).json({ error: 'задачі більше немає' });
    return;
  }
  cancelJob(job);
  res.json(statusOf(job));
});

/**
 * The result. One file comes back as itself rather than as a zip holding one
 * thing — checking a single creative should end in a video you can play.
 */
app.get('/api/batch/:id/download', (req, res) => {
  const job = jobById(req.params.id);
  if (job === undefined) {
    res.status(404).json({ error: 'задачі більше немає' });
    return;
  }
  const outputs = outputsOf(job);
  if (outputs.length === 0) {
    res.status(409).json({ error: 'ще нічого не готово' });
    return;
  }

  const only = outputs.length === 1 ? outputs[0]! : null;
  if (only !== null) {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${only.name}"`);
    fs.createReadStream(only.file).on('error', () => res.destroy()).pipe(res);
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="creatives.zip"');
  // Stored, not deflated: mp4 is already compressed, and the second pass would
  // cost seconds per file to save nothing.
  const zip = new ZipArchive({ store: true });
  zip.on('error', (e: Error) => {
    console.error('zip:', e.message);
    res.destroy();
  });
  zip.pipe(res);
  for (const output of outputs) zip.file(output.file, { name: output.name });
  void zip.finalize();
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
