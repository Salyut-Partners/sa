# Creative Factory Search

Batch editor for vertical video creatives: import photos, lay button and template
layers over them, generate a voice-over, export mp4 per photo and per locale —
as a download, or straight into a new campaign on the platform.

The spec lives in [`.scratch/prd-creative-factory-search.md`](.scratch/prd-creative-factory-search.md);
the launch in [`.scratch/prd-quick-launch.md`](.scratch/prd-quick-launch.md).

## What works today (stage E6)

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
language has its script; the voice is one for the project, with a play button
for ElevenLabs' free sample of it, and the panel counts
the characters and quotes the price before you spend it, once per language
however many photos are in the batch.

Export takes the selected photos across every language ticked for release.
«Куди» says where they go before anything exports: a download, or a launch —
a new campaign on the platform, from the form that opens under it (below).
It runs as a job on the server, so the editor keeps working while it goes: a bar,
the file being made, an estimate, and a cancel. Videos that differ only in their
soundtrack are drawn once and muxed twice, and the panel says how many frame
walks it saved. One creative that fails leaves the rest of the batch alone and
lands in a list of what did not come out. What comes back is an mp4 for one
creative and a zip named by photo and language for a batch.

A batch can carry a subtitle style. The export panel's first group picks one
of the pipeline's styles, or none; under it, each release language has a box
to leave that language clean, and the line counts how many of the files
going out will be burned. The words are the script's, verbatim: the voice
comes back from ElevenLabs with the time of every character, `core` turns
those into timed words, and the server hands them to the `subs` pipeline as
a file, so Whisper never runs and the text on screen matches what the buyer
wrote. It is a step after the mux, on each file — the video is still drawn
once per group, whatever the language says over it — and a machine that
cannot burn (no `ffmpeg-full`, no venv) is told so in the panel and refuses
the export before the first frame rather than on the last file. The style is
saved in the batch file as an optional field, so a file written with one
still opens in an editor from before it existed.

### The launch

«Куди» → «Залити на платформу» opens the launch form in the export panel; with
no token in the config the option is not offered and the download is chosen. It
keeps no state: the topic is read off the platform every time, and the only
thing written to disk is the sources folder after a success.

- **Topic** — typed into a search box over the buyer's topics on the platform
  (`GET /topics`, narrowed to the buyer the token names —
  `core/platform-token.ts`). A topic read once this session shows at once when
  picked again; «Оновити з платформи» reads it again after a change in the admin.
  A launch drops what was read of its topic, so the next visit reads it fresh.
- **Set** — a term group and an article that have had campaigns, by their
  names, newest first by their latest campaign; «+ Новий сет» picks the pair
  from the topic's term groups and articles. The campaign's name does not
  matter. A topic with no term group or no article says so and launches
  nothing.
- **Creatives** — every render the export would make, a checkbox each, and
  mp4 files from disk by button or drop, each sent to the server once when it
  is added (`POST /api/launch/files`, named by its digest) and removable with
  a cross. Each file from disk is transcribed on this machine by the subs
  pipeline (`subtitle_styler.py --transcript`, `POST
  /api/launch/files/:id/transcript`) into an editable box — its `ad_script`.
  Languages may be mixed in one campaign. The «Залив» tab is the same form
  with no project: files from disk only, for creatives made elsewhere.
- **Campaigns** — a row each: a cabinet (never defaulted; dead ones hidden),
  its **budget** and **bid**. A cabinet may be in several rows («+» beside a
  row adds one more in it). The first row takes the set's budget and bid;
  each row added after takes the last row's budget and its bid a step higher
  (`nextCampaign`; the step is a field, the team's 0.05 — `bid_step` — until
  typed), so the campaigns do not meet in one auction — the playbook's bid
  grid. Every cell stays editable.
- **Countries** (one or several — several are one multi-geo profile and a
  builder on All; the creative's language does not decide it) and **Launch
  tomorrow**, from the set's latest campaign, shared by every row — and the
  **pixel**, in plain sight: a wrong one is money on the wrong niche.
- **The rest** in small print — source, FP (identity), language, RSOC, theme,
  headline, keyword rotation, age, gender, devices, OS, end date, schedule —
  from the team's defaults; «Редагувати» opens them into fields for this
  launch only.

The defaults are `setsAndDefaults` in `core/quick-launch.ts`. «The set's
latest campaign» is the newest builder whose campaign is not DELETED —
rejected ones count. Budget and bid fall back to the topic's latest campaign,
then the team's; the pixel to the topic's latest, then to the pixel of the
topic's niche (read off the topic's name by `core/niche.ts`, and off the
pixel's name: «Джобс», «Лонс», «Авто», «Еком») that the buyer last launched
with anywhere; the headline to the topic's latest, then «Learn more». The
team's defaults are `TEAM_DEFAULTS` in code — RSOC 6, 25 / 0.3, start today,
identity «Good Life», the dark theme, TikTok, language and targeting All —
and the buyer overrides fields of it with `launch_defaults` in
`~/.config/sa/config.json`.

A cabinet sees only its business's pixels and identities (the platform's
`business_id` on cabinets, pixels and `GET /tiktok/pages`), and a pixel of
another business goes out as no pixel at all — the same name, «Лонс», is a
different pixel in the GB and the P business. So picking a cabinet fits both
(`forCabinet`): the pixel becomes the one of the same name in the cabinet's
business, or nothing for the buyer to pick; the identity stays if it is the
business's, else becomes the team's by name where the business has one
(«Good Life» on GB, which takes no default), else the cabinet's default
(P). The pixel and identity are picked once and fitted to every row's
cabinet, so one launch may go to cabinets of both businesses; a row whose
business has no pixel of that name says so and blocks the launch.
`launchSteps` refuses a pixel or identity of another business.

«Залити» opens a modal with the whole summary — the shared fields once, a
table of the campaigns with each one's cabinet, pixel, FP, budget and bid, and
the sum of the budgets — and warns, without refusing, of one bid in two
campaigns and of more than fifteen at once (`campaignWarnings`); «Підтвердити»
renders what changed since a render the server still has (a file's identity is
its picture, words and length), then `POST /api/launch` with `confirm: true`.
`launchSteps` in `core/quick-launch.ts` checks the form against the platform
before anything — the set is the topic's, every row's cabinet and pixel are
listed and of one business, the theme, RSOC count, countries and language are
ones it takes — and orders the writes: every file the topic does not already
hold under its upload name (its own name with eight characters of its digest;
the same bytes twice go up once) or by its bytes under any name — the platform
drops a second upload of bytes it holds without a word, so the server finds
such a file by size off the storage's headers, then by digest, and reuses it —
the headline unless the topic has one with those words, a profile for every
budget and bid unless one has those fields, and a builder per row, always new
and always last — so a launch that stops before them has bought nothing, and
«Спробувати ще», the same call again, reuses what the first attempt put up.
What the campaigns share stops the launch where it fails; a builder that fails
does not — the other rows are still built, each row's line says ✓ or why not,
and the rows that were built are marked in the form and not sent again, so
«Спробувати ще» makes only the missing ones. Old campaigns are never touched.
The server (`server/quick-launch.ts`) runs the steps as a job under the queue
policy and reports each: the render per language with its percent (frames),
each upload in megabytes (the multipart body is handed over in slices,
`server/platform.ts`), what was found and reused, each profile with its
budget, bid and geo, each campaign, a link, and the sources. A failed step is
red with a sentence of what to do (`plainFailure`). The form keeps its values
after a launch, so the same set to a second country is one select and one
press.

After the campaigns — once one is made — the pictures behind the ticked renders go to
`sources_root/<topic name>/` (`~/sa/sources` by default): flat, a picture the
folder already holds not written again, a different one under a taken name
suffixed `-2` (`placeSources`). A folder that will not take them is said, not
a failed launch.

Facebook: every request body was taken from TikTok dumps of the admin, so a
launch on Facebook warns and sends the TikTok shape until dumps of a Facebook
profile and builder are taken (`core/platform-model.ts`, where the bodies are).

### Subtitles for a video from elsewhere

The header has a second tab. Drop a video from a designer, a phone or Grok
into it, pick a style and a language, and it goes through the same Python
pipeline the `inbox/<style>/` watcher feeds into `subs/output/`, one file at a
time, as a job on the same board as an export: a line per file with the
pipeline's own stages, a cancel, and the error under the file that failed. The
six styles are read off the pipeline's `--list-styles`, never listed here, and
its `--check` says what the machine is missing before the first file rather
than on it. The mono-repo's `setup.sh` installs the lot. To launch the result,
add it in the launch form with «+ mp4 з диска».

The editor's tools — undo, open, save, new, the photo count — are in the
header of the creatives tab only; the subtitles tab keeps the theme switch and
nothing else. The address keeps the tab (`#/creatives`, `#/subtitles`,
`core/route.ts`).

## Running it

A new buyer's machine: `../setup.sh` from the mono-repo root installs Node,
ffmpeg, both of this package's dependencies and `subs`', and a config
template. Rerunning it skips whatever is already there. `../ONBOARDING.md` is
the one page from that script to a first launch.

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
`RENDER_CONCURRENCY` sets how many workers walk frames at once, each in its own browser (default 2, at most 4; 4 is about 1.6 times faster still, and loud).

### `sa` — reads only

```sh
bin/sa topics
bin/sa show 107567
bin/sa show AIjobsDEwh --source facebook
bin/sa config
bin/sa --version
```

`sa` is how Claude reads the platform, and it only reads: a campaign is
launched from the editor by the buyer's press, and articles, keys and weights
are changed by hand in the admin. `sa topics` lists the buyer's topics;
`sa show <topic>` takes an id or a name and answers the term groups with their
keys and weights, the articles as text, and the sets with what their latest
campaign ran with. `sa config` says where the config is, where sources go and
whether the platform is reachable; `sa --version` answers without the server.
`sa` is a thin HTTP client: one JSON object out, an exit code that means
something (0 done · 1 usage · 2 refused · 4 no server · 5 server or platform
failed), and it starts the server if none answers.

The buyer's own settings — the platform's Bearer with the organisation id,
`sources_root`, `launch_defaults` — live in `~/.config/sa/config.json`,
outside the repository (`SA_CONFIG` points elsewhere for tests).

The launch as it was before — launch folders, `sa new` / `adopt` / `expand` /
`plan` / `apply`, the launches tab, ClickUp tickets, autorules — is in git
history; `.scratch/prd-autolaunch.md` is its PRD.

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
- **`src/cli`** — `sa`. Parses flags, calls the server, prints JSON; reads
  only. `core/quick-launch.ts` is the launch: the sets and their defaults off
  a topic snapshot, the steps a filled form turns into — a builder per
  campaign row — the bid ladder and the rows' warnings, the sources' names,
  the sentence for a failed step. `core/platform-model.ts` is the platform as
  a launch sees it — the reads' types, the writes' bodies, comparing two
  headlines or two profiles. `core/queue.ts` decides what happens to a call
  that went wrong; `core/niche.ts` reads a niche off a name;
  `core/platform-token.ts` the buyer off the Bearer. `server/platform.ts` is
  the digifor client, thin, answering outcomes rather than throwing;
  `server/policy.ts` is the one loop that sends a write the way the queue
  policy says; `server/quick-launch.ts` reads a topic, stages dropped files,
  and runs a launch as a job.
- **`src/server`** — Express, Puppeteer, ffmpeg. Bundles the render target from
  source at startup, so the headless page can never drift from the editor. An
  export is a job in memory: the editor posts a plan, gets an id, and watches it.
  `jobs.ts` is the registry — state, progress, cancel, sweep — and `batch.ts`,
  `subs.ts` and `quick-launch.ts` are three kinds of work on it, watched
  through the same routes; a launch takes its files from finished export jobs.
  ElevenLabs and the translators sit behind two thin modules; a missing key is
  a state each of them explains rather than an error the server starts with.
  `subs.ts` runs `../subs` as a subprocess and knows nothing about styles
  beyond what the pipeline prints — for a dropped video with Whisper, for an
  exported creative with the words the export already has (`--words`), the
  burn being `render → mux → burn` on each file in `batch.ts`.

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
it to `Sound` in `core/batch.ts`, or it never reaches the server at all. The
subtitle style sits on the item for the same reason — it is the script in the
frame, and the script is per language — and must never enter `visualParts`, or
every group would split into one per language.

## Checks

```sh
npm test           # core suite
npm run typecheck
```
