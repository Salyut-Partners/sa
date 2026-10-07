// `sa` — the buyer's command line, and what Claude calls. A thin HTTP client:
// flags in, one JSON object out on stdout, an exit code that means something.
//
// It only reads. A campaign is launched from the editor's «Креативи» tab, by
// the buyer's own press; articles, keywords and weights are changed by hand in
// the platform's admin. Claude gets the topics and one topic at a time, to
// talk about them, write texts and check compliance — nothing that writes.
//
// Exit codes: 0 done · 1 usage · 2 refused · 4 the server could not be reached
// or started · 5 the server or the platform failed.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const PORT = Number(process.env['SA_PORT'] ?? process.env['PORT'] ?? 5180);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const USAGE = `sa — робоче місце байера, лише читання

  sa topics           топіки байера на платформі: id і назва
  sa show <topic> [--source tiktok|facebook]
                      один топік за id або назвою: термгрупи з ключами й вагами,
                      статті текстом, сети (термгрупа + стаття) з останньою
                      кампанією — країна, бюджет, бід, старт, headline
  sa config           де конфігурація, куди лягають ісходники, чи доступна платформа
  sa --version        версія sa; не потребує сервера

Залив — кнопкою «Залити» у вкладці «Креативи» редактора. Статті, ключі, ваги —
руками в адмінці платформи. Відповідь завжди JSON в один об'єкт.`;

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
 * command and the next `sa` finds it running.
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

// ---------------------------------------------------------------- commands --

/** A read's answer out, and the exit code its status means. */
async function read(route: string): Promise<number> {
  await ensureServer();
  const { status, body } = await ask(route);
  out(body);
  if (status === 200) return 0;
  return status === 400 ? 2 : 5;
}

const commandTopics = (): Promise<number> =>
  read('/api/launch/topics');

async function commandShow(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { source: { type: 'string' } } });
  const topic = positionals.join(' ').trim();
  if (topic === '') fail(1, 'sa show потребує топік — id або назву: sa show 107567');
  const query = values.source === undefined ? '' : `?source=${encodeURIComponent(values.source)}`;
  return read(`/api/topics/${encodeURIComponent(topic)}${query}`);
}

const commandConfig = (): Promise<number> => read('/api/config');

/** No server needed: a clean install has to answer this before one has ever been started. */
function commandVersion(): number {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string };
  out({ sa: pkg.version });
  return 0;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'topics': return commandTopics();
    case 'show': return commandShow(rest);
    case 'config': return commandConfig();
    case '--version':
    case '-v':
      return commandVersion();
    case undefined:
    case '-h':
    case '--help':
      process.stdout.write(USAGE + '\n');
      return command === undefined ? 1 : 0;
    default:
      fail(1, `немає команди \`${command}\` — sa --help покаже, що є`);
  }
}

main().then(code => process.exit(code)).catch(e => fail(4, (e as Error).message));
