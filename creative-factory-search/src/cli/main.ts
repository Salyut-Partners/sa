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
import fs from 'node:fs';
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
  sa adopt <topic-id> --key <launch-key> [--vertical jobs]
                      тека заливу з топіка, що вже є на платформі: topic.yaml,
                      ключі термгруп, статті з картинками, state.json з id;
                      кампанії не підхоплюються — далі sa expand
  sa expand <launch-key> [--file matrix.json]
                      матриця заливу → теки: термгрупи, статті й кампанії, яких ще
                      немає; JSON зі stdin або з --file; наявні теки не чіпає
  sa new campaign <launch-key> --termgroup <tg> --article <a> --language de
                      --country DE --account <alias> [--name <тека>] [--theme <id>]
                      [--headline "…"] [--bid 0.45] [--budget 20]
                      одна кампанія над наявними термгрупою і статтею
  sa launches         список заливів у launches_root
  sa tickets          звірити теки з листом ClickUp зараз: тікет на кожну теку,
                      «in progress» там, де є зібрана кампанія
  sa config           де конфігурація і що в ній
  sa plan <launch-key> [--campaign <name>]
                      що станеться на платформі: кроки з тілами, нічого не створює;
                      з --campaign — лише те, що потрібно одній кампанії
  sa apply <launch-key> --confirm [--campaign <name>]
                      виконати план; без --confirm відмовляється
  sa budget <launch-key>/<campaign> <value> [--confirm]
  sa bid <launch-key>/<campaign> <value> [--confirm]
  sa budget <launch-key> --all [--country DE] [--status active] <value> [--confirm]
                      змінити бюджет чи бід живої кампанії: без --confirm — план
                      «було → стане» і нічого не міняє; --confirm дає людина
  sa --version         версія sa; не потребує сервера

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
  if (args[0] === 'campaign') return commandNewCampaign(args.slice(1));
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

interface Expanded {
  created: { termgroups: string[]; articles: string[]; campaigns: string[] };
  notes: string[];
}

async function commandNewCampaign(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      termgroup: { type: 'string' }, article: { type: 'string' }, language: { type: 'string' }, country: { type: 'string' },
      account: { type: 'string' }, name: { type: 'string' }, theme: { type: 'string' }, headline: { type: 'string' },
      bid: { type: 'string' }, budget: { type: 'string' },
    },
  });
  const launchKey = positionals[0];
  if (launchKey === undefined) fail(1, 'sa new campaign потребує launch key: sa new campaign ai-jobs-de-wh --termgroup tg-wh --article a-wh --language de --country DE --account main');
  const number = (flag: 'bid' | 'budget'): number | undefined => {
    if (values[flag] === undefined) return undefined;
    const value = Number(values[flag]);
    if (!Number.isFinite(value) || value <= 0) fail(1, `--${flag} має бути додатним числом`);
    return value;
  };
  const bid = number('bid');
  const budget = number('budget');
  const request = {
    termgroup: values.termgroup ?? '', article: values.article ?? '', language: values.language ?? '',
    country: values.country ?? '', account: values.account ?? '',
    ...(values.name !== undefined ? { name: values.name } : {}),
    ...(values.theme !== undefined ? { theme: values.theme } : {}),
    ...(values.headline !== undefined ? { headline: values.headline } : {}),
    ...(bid !== undefined ? { bid } : {}),
    ...(budget !== undefined ? { budget } : {}),
  };
  await ensureServer();
  const { status, body } = await ask<Expanded | { error: string }>(`/api/launches/${launchKey}/campaigns`, asJson(request));
  out(body);
  if (status === 400) return 2;
  return status === 200 ? 0 : 5;
}

/** A folder from a topic already on the platform. The key is the buyer's: it cannot be read off `AImobNLtrap`. */
async function commandAdopt(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { key: { type: 'string' }, vertical: { type: 'string' } } });
  const topicId = Number(positionals[0]);
  if (positionals[0] === undefined || !Number.isInteger(topicId) || topicId <= 0) fail(1, 'sa adopt потребує id топіка з платформи: sa adopt 107567 --key ai-jobs-de-wh');
  if (values.key === undefined) fail(1, 'sa adopt потребує --key <launch-key>: ім\'я теки заливу задає байер');
  await ensureServer();
  const { status, body } = await ask<LaunchCreated | { error: string }>('/api/launches/adopt', asJson({
    topicId, launchKey: values.key, ...(values.vertical !== undefined ? { vertical: values.vertical } : {}),
  }));
  out(body);
  if (status === 400) return 2;
  if (status !== 200) return 5;
  return 'ticket' in body && body.ticket.ok ? 0 : 3;
}

/** The matrix: a JSON object from `--file` or stdin, handed to the server as is. */
async function commandExpand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { file: { type: 'string' } } });
  const launchKey = positionals[0];
  if (launchKey === undefined) fail(1, 'sa expand потребує launch key: echo \'{...}\' | sa expand ai-jobs-de-wh');
  let text: string;
  try {
    text = values.file !== undefined ? fs.readFileSync(values.file, 'utf8') : fs.readFileSync(0, 'utf8');
  } catch (e) {
    fail(1, `матриця не читається: ${(e as Error).message}`);
  }
  let matrix: unknown;
  try {
    matrix = JSON.parse(text);
  } catch (e) {
    fail(1, `матриця має бути JSON: ${(e as Error).message}`);
  }
  await ensureServer();
  const { status, body } = await ask<Expanded | { error: string }>(`/api/launches/${launchKey}/expand`, asJson(matrix));
  out(body);
  if (status === 400) return 2;
  return status === 200 ? 0 : 5;
}

async function commandTickets(): Promise<number> {
  await ensureServer();
  const { status, body } = await ask<{ tickets?: Record<string, { ok: boolean }> }>('/api/tickets/sync', { method: 'POST' });
  out(body);
  if (status !== 200) return 5;
  return Object.values(body.tickets ?? {}).every(t => t.ok) ? 0 : 3;
}

async function commandLaunches(): Promise<number> {
  await ensureServer();
  const { body } = await ask('/api/launches');
  out(body);
  return 0;
}

/** No server needed: a clean install has to answer this before one has ever been started. */
function commandVersion(): number {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string };
  out({ sa: pkg.version });
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
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { campaign: { type: 'string' } } });
  const launchKey = positionals[0];
  if (launchKey === undefined) fail(1, 'sa plan потребує launch key: sa plan ai-vadim-sperm-it');
  await ensureServer();
  const { status, body } = await ask<PlanShown | { error: string }>(
    `/api/launches/${launchKey}/plan`, asJson(values.campaign === undefined ? {} : { campaign: values.campaign }),
  );
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
  const { values, positionals } = parseArgs({
    args, allowPositionals: true, options: { confirm: { type: 'boolean' }, campaign: { type: 'string' } },
  });
  const launchKey = positionals[0];
  if (launchKey === undefined) fail(1, 'sa apply потребує launch key: sa apply ai-vadim-sperm-it --confirm');
  if (values.confirm !== true) {
    fail(2, 'sa apply створює сутності на платформі за живі гроші. Спершу sa plan, потім sa apply <key> --confirm — підтвердження дає людина.');
  }
  await ensureServer();
  const { status, body } = await ask<{ id: string | null; steps: number } | { error: string }>(
    `/api/launches/${launchKey}/apply`, asJson({ confirm: true, ...(values.campaign === undefined ? {} : { campaign: values.campaign }) }),
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

interface AdjustShown {
  changes: { label: string }[];
  skipped: string[];
  warnings: string[];
  errors: string[];
  note: string;
}

/**
 * `sa budget` and `sa bid`: `<key>/<campaign>` or `<key> --all` with filters,
 * the value, and `--confirm` for the change itself. The plan half answers
 * without the flag; the flag is a person's.
 */
async function commandAdjust(field: 'budget' | 'bid', args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { all: { type: 'boolean' }, country: { type: 'string' }, status: { type: 'string' }, confirm: { type: 'boolean' } },
  });
  const [target, raw] = positionals;
  if (target === undefined || raw === undefined) {
    fail(1, `sa ${field} потребує кампанію й значення: sa ${field} ai-jobs-de-wh/de-a 40, або sa ${field} ai-jobs-de-wh --all --country DE 40`);
  }
  const [launchKey, campaign] = target.split('/', 2);
  if (campaign === undefined && values.all !== true) fail(1, `назвіть кампанію як <key>/<campaign> або дайте --all`);
  if (campaign !== undefined && values.all === true) fail(1, `або <key>/<campaign>, або --all — не обоє`);
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) fail(1, `значення має бути додатним числом, отримано \`${raw}\``);
  await ensureServer();
  const { status, body } = await ask<AdjustShown | { error: string }>(`/api/launches/${launchKey}/adjust`, asJson({
    field, value,
    ...(campaign !== undefined ? { campaign } : { all: true }),
    ...(values.country !== undefined ? { country: values.country } : {}),
    ...(values.status !== undefined ? { status: values.status } : {}),
    ...(values.confirm === true ? { confirm: true } : {}),
  }));
  out(body);
  if (status === 400) return 2;
  if (status !== 200) return 5;
  return 'errors' in body && body.errors.length > 0 ? 2 : 0;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'new': return commandNew(rest);
    case 'adopt': return commandAdopt(rest);
    case 'expand': return commandExpand(rest);
    case 'launches': return commandLaunches();
    case 'tickets': return commandTickets();
    case 'config': return commandConfig();
    case 'plan': return commandPlan(rest);
    case 'apply': return commandApply(rest);
    case 'budget': return commandAdjust('budget', rest);
    case 'bid': return commandAdjust('bid', rest);
    case '--version':
      return commandVersion();
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
