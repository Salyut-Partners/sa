// Serves the editor, serves the render target, runs the export queue and the launch.
import 'dotenv/config';
import { ZipArchive } from 'archiver';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocaleId } from '../core/locales.ts';
import { VOICE_MODELS } from '../core/voice.ts';
import { startBatch } from './batch.ts';
import { RENDER_TARGET_HTML, renderTargetScript } from './bundle.ts';
import { configPath, loadConfig } from './config.ts';
import { BadRequestError, cancelJob, jobById, outputsOf, RefusedError, statusOf } from './jobs.ts';
import { PlatformReadError, platformState } from './platform.ts';
import { launchTopic, launchTopics, showTopic, stageFile, startLaunch, transcribeStaged } from './quick-launch.ts';
import { closeBrowsers } from './render.ts';
import { startSubtitles, subsState } from './subs.ts';
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

// ------------------------------------------------------------------ config --

/** Where the config is and whether the platform can be reached — for `sa config`. */
app.get('/api/config', (_req, res) => {
  const config = loadConfig();
  const platform = platformState(config);
  res.json({
    path: configPath(),
    sources_root: config.sources_root,
    platform: platform.ready
      ? { ready: true, organization_id: platform.organizationId, base_url: platform.baseUrl }
      : { ready: false, note: platform.note },
  });
});

/** A refusal is the buyer's to fix and comes back as a 400; anything else is ours. */
function answerFailure(res: express.Response, e: unknown, what: string): void {
  if (e instanceof RefusedError) res.status(400).json({ error: e.message });
  else if (e instanceof PlatformReadError) res.status(502).json({ error: e.message });
  else {
    console.error(`${what}:`, (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
}

// ------------------------------------------------------------------ launch --

/** The buyer's topics on the platform, for the launch form. */
app.get('/api/launch/topics', async (_req, res) => {
  try {
    res.json({ topics: await launchTopics(loadConfig()) });
  } catch (e) {
    answerFailure(res, e, 'launch topics');
  }
});

/** One topic read off the platform: its sets with their defaults, and what the form's selects offer. Creates nothing. */
app.get('/api/launch/topics/:id', async (req, res) => {
  try {
    const source = typeof req.query['source'] === 'string' ? req.query['source'] : '';
    res.json(await launchTopic(loadConfig(), Number(req.params.id), source));
  } catch (e) {
    answerFailure(res, e, 'launch topic');
  }
});

/** One topic for Claude to read — term groups with keywords and weights, articles, sets: `sa show`. Creates nothing. */
app.get('/api/topics/:topic', async (req, res) => {
  try {
    const source = typeof req.query['source'] === 'string' ? req.query['source'] : '';
    res.json(await showTopic(loadConfig(), req.params.topic, source));
  } catch (e) {
    answerFailure(res, e, 'show topic');
  }
});

/** A designer's mp4 for the launch form: the body is the file, streamed to this machine and named by its digest. */
app.post('/api/launch/files', async (req, res) => {
  try {
    const name = typeof req.query['name'] === 'string' ? req.query['name'] : '';
    if (name === '') throw new RefusedError('потрібне name');
    res.json(await stageFile(req, name));
  } catch (e) {
    req.resume();
    answerFailure(res, e, 'launch file');
  }
});

/** The words a staged mp4 speaks, for its `ad_script` — Whisper on this machine, one file at a time. */
app.post('/api/launch/files/:id/transcript', async (req, res) => {
  try {
    res.json({ text: await transcribeStaged(req.params.id) });
  } catch (e) {
    answerFailure(res, e, 'launch transcript');
  }
});

/**
 * The launch: one new campaign from finished renders and files from disk. Only a body with
 * `confirm: true` — the editor sends it from the modal's «Підтвердити» — starts
 * anything; a refusal comes back before a job exists.
 */
app.post('/api/launch', async (req, res) => {
  try {
    res.json(await startLaunch(loadConfig(), req.body));
  } catch (e) {
    answerFailure(res, e, 'launch');
  }
});

// ------------------------------------------------------------------ export --

app.post('/api/batch', (req, res) => {
  try {
    res.json({ id: startBatch(req.body, ORIGIN) });
  } catch (e) {
    if (e instanceof BadRequestError || e instanceof RefusedError) res.status(400).json({ error: e.message });
    else {
      console.error('batch failed to start:', (e as Error).message);
      res.status(500).json({ error: (e as Error).message });
    }
  }
});

// -------------------------------------------------------------- subtitles --

app.get('/api/subtitles', async (_req, res) => {
  res.json(await subsState());
});

/**
 * One video in, one job out. The body is the file itself, streamed to disk;
 * what to do with it rides in the query, because a multipart parser is a
 * dependency for the sake of five short strings.
 */
app.post('/api/subtitles', async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const name = q['name'] ?? '';
  const style = q['style'] ?? '';
  const lang = q['lang'] && q['lang'] !== 'auto' ? q['lang'] : null;
  try {
    if (name === '' || style === '') throw new RefusedError('потрібні name і style');
    res.json({ id: await startSubtitles(req, { name, style, lang }) });
  } catch (e) {
    // The body may still be arriving; it is drained so the client sees the answer.
    req.resume();
    answerFailure(res, e, 'subtitles');
  }
});

// ------------------------------------------------------------------- jobs --

app.get('/api/jobs/:id', (req, res) => {
  const job = jobById(req.params.id);
  if (job === undefined) res.status(404).json({ error: 'задачі більше немає' });
  else res.json(statusOf(job));
});

app.delete('/api/jobs/:id', (req, res) => {
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
app.get('/api/jobs/:id/download', (req, res) => {
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
    void closeBrowsers().then(() => process.exit(0));
  });
}
