// Serves the editor, serves the render target, and runs the export queue.
import 'dotenv/config';
import { ZipArchive } from 'archiver';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocaleId } from '../core/locales.ts';
import { VOICE_MODELS } from '../core/voice.ts';
import { describePlan, planLaunch, startApply } from './apply.ts';
import { startBatch } from './batch.ts';
import { campaignCreativesDir, listBatches, listCampaigns, readBatch, writeBatch } from './batches.ts';
import { RENDER_TARGET_HTML, renderTargetScript } from './bundle.ts';
import { clickupState } from './clickup.ts';
import { configPath, ensureLaunchesRoot, loadConfig } from './config.ts';
import { createLaunch, existingLaunchKeys, RefusedError } from './launches.ts';
import { isTrafficSource } from '../core/launch.ts';
import { BadRequestError, cancelJob, jobById, outputsOf, statusOf } from './jobs.ts';
import { PlatformReadError, platformState } from './platform.ts';
import { closeBrowser } from './render.ts';
import { startSubtitles, subsState, SUBS_OUTPUT } from './subs.ts';
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

// ---------------------------------------------------------------- launches --

/** Where things are and whether the ticket side can work — for `sa config`. */
app.get('/api/config', (_req, res) => {
  const config = loadConfig();
  const clickup = clickupState(config);
  const platform = platformState(config);
  res.json({
    path: configPath(),
    launches_root: config.launches_root,
    clickup: clickup.ready ? { ready: true, list_id: clickup.listId } : { ready: false, note: clickup.note },
    platform: platform.ready
      ? { ready: true, organization_id: platform.organizationId, base_url: platform.baseUrl }
      : { ready: false, note: platform.note },
  });
});

app.get('/api/launches', (_req, res) => {
  const config = loadConfig();
  res.json({ launches_root: config.launches_root, launches: existingLaunchKeys(config.launches_root) });
});

/**
 * A new launch: the folder tree, then the ticket. A refusal is a 400 with the
 * sentence for the buyer; a ticket that could not be filed is not a failure of
 * the request — the folder is there — and comes back inside the 200.
 */
app.post('/api/launches', async (req, res) => {
  const body = req.body as { launchKey?: unknown; name?: unknown; trafficSource?: unknown; vertical?: unknown; geo?: unknown };
  if (typeof body.launchKey !== 'string') {
    res.status(400).json({ error: 'у запиті немає launchKey' });
    return;
  }
  const source = body.trafficSource;
  if (source !== undefined && !isTrafficSource(source)) {
    res.status(400).json({ error: 'trafficSource має бути одним із: tiktok, facebook' });
    return;
  }
  try {
    res.json(await createLaunch(loadConfig(), {
      launchKey: body.launchKey,
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(source !== undefined ? { trafficSource: source } : {}),
      ...(typeof body.vertical === 'string' ? { vertical: body.vertical } : {}),
      ...(Array.isArray(body.geo) ? { geo: body.geo.map(String) } : {}),
    }));
  } catch (e) {
    if (e instanceof RefusedError) res.status(400).json({ error: e.message });
    else {
      console.error('launch failed:', (e as Error).message);
      res.status(500).json({ error: (e as Error).message });
    }
  }
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

// -------------------------------------------------------------- plan/apply --

/** The plan: reads the folder and the platform, creates nothing, however often it is asked. */
app.post('/api/launches/:key/plan', async (req, res) => {
  try {
    res.json(describePlan(await planLaunch(loadConfig(), req.params.key)));
  } catch (e) {
    answerFailure(res, e, 'plan');
  }
});

/**
 * The gate. Only a body that says `confirm: true` starts anything; the CLI
 * sends it only under `--confirm`, and the mono-repo denies that command to
 * Claude. A plan with errors is refused; an empty one answers with no job.
 */
app.post('/api/launches/:key/apply', async (req, res) => {
  const body = req.body as { confirm?: unknown } | undefined;
  try {
    res.json(await startApply(loadConfig(), req.params.key, body?.confirm === true));
  } catch (e) {
    answerFailure(res, e, 'apply');
  }
});

// ----------------------------------------------------------------- batches --

app.get('/api/launches/:key/campaigns', (req, res) => {
  try {
    res.json({ campaigns: listCampaigns(loadConfig(), req.params.key) });
  } catch (e) {
    answerFailure(res, e, 'campaigns');
  }
});

app.get('/api/launches/:key/batches', (req, res) => {
  try {
    res.json({ batches: listBatches(loadConfig(), req.params.key) });
  } catch (e) {
    answerFailure(res, e, 'batches');
  }
});

app.get('/api/launches/:key/batches/:batch', (req, res) => {
  try {
    res.json(readBatch(loadConfig(), req.params.key, req.params.batch));
  } catch (e) {
    answerFailure(res, e, 'batch read');
  }
});

app.put('/api/launches/:key/batches/:batch', (req, res) => {
  try {
    res.json(writeBatch(loadConfig(), req.params.key, req.params.batch, req.body));
  } catch (e) {
    answerFailure(res, e, 'batch write');
  }
});

// ------------------------------------------------------------------ export --

app.post('/api/batch', (req, res) => {
  try {
    const config = loadConfig();
    res.json({ id: startBatch(req.body, ORIGIN, (key, campaign) => campaignCreativesDir(config, key, campaign)) });
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
    const dest = q['launchKey'] && q['campaign']
      ? campaignCreativesDir(loadConfig(), q['launchKey'], q['campaign'])
      : SUBS_OUTPUT;
    res.json({ id: await startSubtitles(req, { name, style, lang, dest }) });
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
  // The launches folder exists from the first start, so the editor and `sa`
  // never meet a missing root. Where it is comes from the buyer's config.
  try {
    console.log(`launches -> ${ensureLaunchesRoot(loadConfig())}`);
  } catch (e) {
    console.error((e as Error).message);
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void closeBrowser().then(() => process.exit(0));
  });
}
