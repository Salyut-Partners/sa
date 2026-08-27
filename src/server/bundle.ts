// The render target is bundled from source at startup rather than being a
// checked-in artefact. That is what guarantees the headless page is running the
// same renderer the editor is — there is no build step to forget.
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(here, '..', 'renderer', 'render-target.ts');

let cached: Promise<string> | null = null;

export function renderTargetScript(): Promise<string> {
  return (cached ??= esbuild
    .build({
      entryPoints: [ENTRY],
      bundle: true,
      format: 'iife',
      target: 'chrome120',
      write: false,
      logLevel: 'silent',
    })
    .then(result => {
      const file = result.outputFiles[0];
      if (!file) throw new Error('render target bundle produced no output');
      return file.text;
    }));
}

export const RENDER_TARGET_HTML = `<!doctype html>
<meta charset="utf-8">
<title>render target</title>
<style>*{margin:0;padding:0}html,body{overflow:hidden;background:#000}</style>
<div id="stage"></div>
<script src="/render-target.js"></script>
`;
