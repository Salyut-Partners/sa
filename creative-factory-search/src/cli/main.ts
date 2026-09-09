// `sa` — the buyer's command line, and what Claude calls. A thin HTTP client:
// flags in, one JSON object out on stdout, an exit code that means something.
// No questions asked at the prompt — a wizard is exactly what a model driving
// the tool cannot answer.
//
// Exit codes: 0 done · 1 usage · 2 refused · 3 done in part (folder made, no
// ticket) · 4 the server could not be reached or started · 5 the server failed.
//
// `sa apply` is the one command that spends money. Without `--confirm` it
// refuses before touching the server, and the mono-repo's Claude settings
// deny the command outright — the gate is the flag and the deny, not a
// permission prompt a model in auto mode would never see.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { LaunchCreated } from '../core/launch.ts';
import type { JobStatus } from '../server/jobs.ts';

const PORT = Number(process.env['SA_PORT'] ?? process.env['PORT'] ?? 5180);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const USAGE = `sa — робоче місце байера

  sa new <launch-key> [--name "AI Vadim Sperm IT"] [--source tiktok|facebook]
                      [--vertical jobs] [--geo DE,IT]
  sa launches         список заливів у launches_root
  sa config           де конфігурація і що в ній
  sa plan <launch-key>            що станеться на платформі: кроки з тілами, нічого не створює
  sa apply <launch-key> --confirm виконати план; без --confirm відмовляється

Launch key: малі літери, цифри й дефіси, щонайменше два сегменти — перший це
скорочення команди. Відповідь завжди JSON в один об'єкт.`;

function out(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function fail(code: number, message: string): never {
  out({ error: message });
  process.exit(code);
}

// ------------------------------------------------------------------ server --

async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The server, started if it is not answering. Detached, so it outlives this
 * command and the next `sa` finds it running; `launchd` keeps it for the hourly
 * status once that exists, and this is the fallback for a laptop that was just
 * opened.
 */
async function ensureServer(): Promise<void> {
  if (await healthy()) return;
  const tsx = path.join(PACKAGE_ROOT, 'node_modules', '.bin', 'tsx');
  const child = spawn(tsx, [path.join(PACKAGE_ROOT, 'src', 'server', 'index.ts')], {
    cwd: PACKAGE_ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT) },
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await healthy()) return;
  }
  fail(4, `сервер не відповідає на ${ORIGIN} і не піднявся за 20 секунд`);
}

async function ask<T>(route: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const response = await fetch(`${ORIGIN}${route}`, init);
  const body = await response.json().catch(() => ({ error: response.statusText })) as T;
  return { status: response.status, body };
}

const asJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ---------------------------------------------------------------- commands --

async function commandNew(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      source: { type: 'string' },
      vertical: { type: 'string' },
      geo: { type: 'string' },
    },
  });
  const launchKey = positionals[0];
  if (launchKey === undefined) fail(1, 'sa new потребує launch key: sa new ai-vadim-sperm-it');
  const request = {
    launchKey,
    ...(values.name !== undefined ? { name: values.name } : {}),
    ...(values.source !== undefined ? { trafficSource: values.source } : {}),
    ...(values.vertical !== undefined ? { vertical: values.vertical } : {}),
    ...(values.geo !== undefined ? { geo: values.geo.split(',').map(s => s.trim()).filter(Boolean) } : {}),
  };
  await ensureServer();
  const { status, body } = await ask<LaunchCreated | { error: string }>('/api/launches', asJson(request));
  out(body);
  if (status === 400) return 2;
  if (status !== 200) return 5;
  return 'ticket' in body && body.ticket.ok ? 0 : 3;
}

async function commandLaunches(): Promise<number> {
  await ensureServer();
  const { body } = await ask('/api/launches');
  out(body);
  return 0;
}

async function commandConfig(): Promise<number> {
  await ensureServer();
  const { body } = await ask('/api/config');
  out(body);
  return 0;
}

interface PlanShown {
  steps: unknown[];
  errors: string[];
}

async function commandPlan(args: string[]): Promise<number> {
  const launchKey = args[0];
  if (launchKey === undefined) fail(1, 'sa plan потребує launch key: sa plan ai-vadim-sperm-it');
  await ensureServer();
  const { status, body } = await ask<PlanShown | { error: string }>(`/api/launches/${launchKey}/plan`, asJson({}));
  out(body);
  if (status === 400) return 2;
  if (status !== 200) return 5;
  return 'errors' in body && body.errors.length > 0 ? 2 : 0;
}

/** How often the apply is asked after. Steps take seconds each, so this is plenty. */
const APPLY_POLL_MS = 1000;

/**
 * Apply, and stay until it stops. Progress goes to stderr a line at a time,
 * the result to stdout as one object; Ctrl-C cancels the job on the server
 * and waits for it to settle rather than leaving it running blind.
 */
async function commandApply(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { confirm: { type: 'boolean' } } });
  const launchKey = positionals[0];
  if (launchKey === undefined) fail(1, 'sa apply потребує launch key: sa apply ai-vadim-sperm-it --confirm');
  if (values.confirm !== true) {
    fail(2, 'sa apply створює сутності на платформі за живі гроші. Спершу sa plan, потім sa apply <key> --confirm — підтвердження дає людина.');
  }
  await ensureServer();
  const { status, body } = await ask<{ id: string | null; steps: number } | { error: string }>(
    `/api/launches/${launchKey}/apply`, asJson({ confirm: true }),
  );
  if (status === 400) { out(body); return 2; }
  if (status !== 200 || !('id' in body)) { out(body); return 5; }
  if (body.id === null) {
    out({ launchKey, applied: 0, note: 'план порожній — на платформі вже все є' });
    return 0;
  }

  const id = body.id;
  let cancelling = false;
  const onInterrupt = (): void => {
    if (cancelling) return;
    cancelling = true;
    process.stderr.write('\nскасовую…\n');
    void ask(`/api/jobs/${id}`, { method: 'DELETE' });
  };
  process.on('SIGINT', onInterrupt);

  let last = '';
  for (;;) {
    await new Promise(r => setTimeout(r, APPLY_POLL_MS));
    const polled = await ask<JobStatus | { error: string }>(`/api/jobs/${id}`);
    if (!('state' in polled.body)) { out(polled.body); return 5; }
    const job = polled.body;
    const line = `${job.done}/${job.total} ${job.current}`;
    if (line !== last && job.current !== '') {
      process.stderr.write(line + '\n');
      last = line;
    }
    if (job.state === 'running') continue;
    process.off('SIGINT', onInterrupt);
    out({ launchKey, state: job.state, done: job.done - job.errors.length, total: job.total, errors: job.errors });
    return job.state === 'done' ? 0 : job.state === 'cancelled' ? 2 : 5;
  }
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'new': return commandNew(rest);
    case 'launches': return commandLaunches();
    case 'config': return commandConfig();
    case 'plan': return commandPlan(rest);
    case 'apply': return commandApply(rest);
    case undefined:
    case '-h':
    case '--help':
      process.stdout.write(USAGE + '\n');
      return command === undefined ? 1 : 0;
    default:
      fail(1, `невідома команда \`${command}\`\n${USAGE}`);
  }
}

main().then(
  code => process.exit(code),
  e => fail(4, (e as Error).message),
);
