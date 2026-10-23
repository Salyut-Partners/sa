#!/usr/bin/env node
// The server under a keeper. `tsx watch` restarts on a changed file and on
// nothing else: a server that crashed sat dead until someone touched the code,
// while Vite went on serving an editor whose every call failed. This restarts
// it on both — a crash, and a change under src/server, src/core or
// src/renderer. The renderer is in the list because the server bundles it once
// per process: without a restart a `git pull` would export with the old one.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsx = path.join(root, 'node_modules', '.bin', 'tsx');
const entry = path.join(root, 'src', 'server', 'index.ts');
const WATCHED = ['server', 'core', 'renderer'].map(dir => path.join(root, 'src', dir));

/** What `src/server/index.ts` exits with when its port is taken. */
const PORT_TAKEN = 3;

let child = null;
let stopping = false;
let restartOnExit = false;
/** Crashes in a row; reset once a run has lasted a minute. */
let crashes = 0;
let startedAt = 0;

function start() {
  startedAt = Date.now();
  child = spawn(tsx, [entry], { stdio: 'inherit', cwd: root });
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) process.exit(0);
    if (restartOnExit) {
      restartOnExit = false;
      start();
      return;
    }
    if (code === PORT_TAKEN) {
      // Another server has the port — the buyer's other window, most likely.
      // Retrying would only print this every half a minute for ever.
      console.error('[serve] порт зайнятий іншим сервером — цей не запускаю. Закрийте те вікно або працюйте в ньому.');
      process.exit(1);
    }
    if (Date.now() - startedAt > 60_000) crashes = 0;
    crashes += 1;
    // A server that dies at once — a port taken, a syntax error — would spin; it
    // waits longer each time, up to half a minute.
    const wait = Math.min(30_000, 1000 * 2 ** (crashes - 1));
    console.error(`[serve] сервер упав (${signal ?? `код ${code}`}) — перезапуск через ${wait / 1000} с`);
    setTimeout(start, wait);
  });
}

let debounce = null;
function changed() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (child === null) return;
    console.log('[serve] код змінився — перезапуск');
    crashes = 0;
    restartOnExit = true;
    child.kill('SIGTERM');
  }, 300);
}

for (const dir of WATCHED) {
  fs.watch(dir, { recursive: true }, (_event, file) => {
    if (file && /\.test\.ts$/.test(file)) return;
    changed();
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    if (child === null) process.exit(0);
    child.kill(signal);
  });
}

start();
