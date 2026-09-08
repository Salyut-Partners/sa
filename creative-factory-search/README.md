# Creative Factory Search

Batch editor for vertical video creatives: import photos, lay button and template
layers over them, generate a voice-over, export mp4 per photo and per locale.

The spec lives in [`.scratch/prd-creative-factory-search.md`](.scratch/prd-creative-factory-search.md).

## What works today (stage E5)

Import a batch of 9:16 photos at once — the ones that do not fit are listed with
a reason rather than failing the import. The batch lays out four to a row; a
click picks the photo the panel edits, ⌘-click adds another, ⌘A takes all of
them, and every change is written to the whole selection at once. Where the
selection disagrees, a field says so instead of showing one photo's value. Only
selected cells animate; the rest sit on the frame where their composition has
finished arriving. The batch autosaves to IndexedDB and saves to a `.json` file,
and ⌘Z walks back through the edits — a whole drag being one step.

A photo carries as many buttons as you like. They come from a library of ten
styles, each chip in it drawn by the renderer that will draw the video. A button
is picked off the frame or out of the list, dragged and sized on the preview,
typed to the pixel, nudged with the arrow keys, restyled, recoloured, refonted,
reordered, duplicated. Each one has its own window: when it arrives, how it
arrives, when it goes — or nothing, for one that stays to the end however long
the video becomes. A window that falls outside the video says so. The slider
under the grid stops the selected cells on a second, so you can check what is on
screen at it without waiting for a render — ⌘A first, to hold the whole batch to
the same clock.

A photo also wears at most one template, chosen from a library of five whose
chips are whole frames drawn by the same renderer: a banner listing the
vacancies, three versions of the offer card — pills, panel, and a sheet that
unrolls from the top — and the rate list. The form under the library is built
from the template's own schema rather than laid out by hand, so every field it
carries is editable, lists a line to an item. The template has the same window as
a button — appears at, hides at, entrance — and lands over the same warnings.

The strip over the grid holds the languages. Adding one shows the batch in it:
every cell, and every chip in the template library, is redrawn from the phrase
book, which ships all seven locales. What a field says belongs to the language
rather than to the photo — the offer is the batch's — so a field written over
says so, resets back with one click, and stays out of the other six languages
until you press translate, which carries the hand-written fields and the
voice-over script across in one step and names the provider that did it. Each
language has its script and, if you want, a voice of its own; the panel counts
the characters and quotes the price before you spend it, once per language
however many photos are in the batch.

Export takes the selected photos across every language ticked for release. It
runs as a job on the server, so the editor keeps working while it goes: a bar,
the file being made, an estimate, and a cancel. Videos that differ only in their
soundtrack are drawn once and muxed twice, and the panel says how many frame
walks it saved. One creative that fails leaves the rest of the batch alone and
lands in a list of what did not come out. What comes back is an mp4 for one
creative and a zip named by photo and language for a batch.

## Running it

```sh
npm install
npm run dev        # server on 5180, editor on 5181
```

Open <http://localhost:5181>. The editor proxies `/api` to the server.

`npm run build && npm start` serves the built editor from the server alone, on 5180.

ffmpeg and ffprobe must be on `PATH` (`brew install ffmpeg`). Chromium comes with
Puppeteer.

Keys go in `.env` (see `.env.example`) and none of them are required:
`ELEVENLABS_API_KEY` for the voice-over, and either `DEEPL_API_KEY` or
`ANTHROPIC_API_KEY` for translation. Without them the editor runs and exports
silent creatives, and the panel says which key is missing rather than failing.
`RENDER_CONCURRENCY` sets how many pages walk frames at once (default 2).

### `sa` — the buyer's command line

```sh
bin/sa new ai-vadim-sperm-it --name "AI Vadim Sperm IT" --vertical jobs --geo DE,IT
bin/sa launches
bin/sa config
```

`sa` is a thin HTTP client to the server: flags in, one JSON object out, an
exit code that means something (0 done · 1 usage · 2 refused · 3 folder made
but no ticket · 4 no server · 5 server failed). It starts the server if none answers. `sa new`
lays out the launch folder under `launches_root` and files a ticket in
ClickUp; the folder always comes first, so a missing token leaves the buyer
with somewhere to work and a sentence saying why there is no ticket.

The buyer's own settings — `launches_root` and the ClickUp token and list —
live in `~/.config/sa/config.json`, outside the repository (`SA_CONFIG`
points elsewhere for tests). Without the file everything defaults to
`~/sa/launches` and no ticket.

## Shape of the code

Three build units and one rule.

- **`src/core`** — the model and everything derived from it, as pure functions.
  No DOM, no React, no network. This is the one tested seam.
- **`src/renderer`** — plain DOM, no React. Builds a creative from a `Spec` and
  exposes `render(t)`. Ships its own CSS so a single import is enough anywhere.
  A template is a record in two halves: its fields and label in `core/templates.ts`,
  because the model has to merge them with the dictionary, and its layout and
  animation in `renderer/templates/`. Adding one is a record in each and nothing
  in the editor.
- **`src/editor`** — React. Owns interaction and nothing about how a creative looks.
  That line is what makes the light/dark theme safe: it repaints the chrome from
  the tokens at the top of `editor.css` and never touches a creative, so a
  preview looks the same in either theme and still matches the mp4. The choice
  cycles system → light → dark in the header, lives in `localStorage`, and is
  never written into a project file.
- **`src/cli`** — `sa`. Parses flags, calls the server, prints JSON. Knows
  nothing about launches beyond the route names; the server does the work and
  `core/launch.ts` decides what a launch is: the manifests, the key, the tree.
- **`src/server`** — Express, Puppeteer, ffmpeg. Bundles the render target from
  source at startup, so the headless page can never drift from the editor. An
  export is a job in memory: the editor posts a plan, gets an id, and watches it.
  ElevenLabs and the translators sit behind two thin modules; a missing key is a
  state each of them explains rather than an error the server starts with.

The rule: **the preview and the export call the same renderer.** There is no
second drawing path. Anything time-dependent inside the renderer must be derived
from `t` — no transitions, no `requestAnimationFrame`, no wall clock — or the
frame walk stops matching what was on screen.

A corollary the export leans on: `visualKey` hashes exactly the half of a `Spec`
that reaches the frame, and `planBatch` groups by it, so two files that share a
key share a video. Adding a visual field to `Spec` means adding it to
`visualParts` — otherwise a real difference silently ships the same video twice.

That grouping is also what keeps the export request small: the `Spec` — and so
the photo, as a data URL — is written once per group, and each `BatchItem` in it
carries only the sound that separates it from its neighbours. Which is the same
obligation read from the other end: adding a *sound* field to `Spec` means adding
it to `Sound` in `core/batch.ts`, or it never reaches the server at all.

## Checks

```sh
npm test           # core suite
npm run typecheck
```
