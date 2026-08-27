# Creative Factory Search

Batch editor for vertical video creatives: import photos, lay button and template
layers over them, generate a voice-over, export mp4 per photo and per locale.

The spec lives in [`.scratch/prd-creative-factory-search.md`](.scratch/prd-creative-factory-search.md).

## What works today (stage E1)

Import a 9:16 photo, put buttons on it, drag and size them, pick a style, colour
and text, set the duration, and export an mp4. Multi-photo grids, the full button
and template libraries, timings UI, locales and the voice-over land in E2–E5.

## Running it

```sh
npm install
npm run dev        # server on 5180, editor on 5181
```

Open <http://localhost:5181>. The editor proxies `/api` to the server.

`npm run build && npm start` serves the built editor from the server alone, on 5180.

ffmpeg and ffprobe must be on `PATH` (`brew install ffmpeg`). Chromium comes with
Puppeteer. Keys for the voice-over and translation providers go in `.env`
(see `.env.example`); nothing needs them before E5.

## Shape of the code

Three build units and one rule.

- **`src/core`** — the model and everything derived from it, as pure functions.
  No DOM, no React, no network. This is the one tested seam.
- **`src/renderer`** — plain DOM, no React. Builds a creative from a `Spec` and
  exposes `render(t)`. Ships its own CSS so a single import is enough anywhere.
- **`src/editor`** — React. Owns interaction and nothing about how a creative looks.
- **`src/server`** — Express, Puppeteer, ffmpeg. Bundles the render target from
  source at startup, so the headless page can never drift from the editor.

The rule: **the preview and the export call the same renderer.** There is no
second drawing path. Anything time-dependent inside the renderer must be derived
from `t` — no transitions, no `requestAnimationFrame`, no wall clock — or the
frame walk stops matching what was on screen.

## Checks

```sh
npm test           # core suite
npm run typecheck
```
