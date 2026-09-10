# Creative Factory Search

Batch editor for vertical video creatives: import photos, lay button and template
layers over them, generate a voice-over, export mp4 per photo and per locale.

The spec lives in [`.scratch/prd-creative-factory-search.md`](.scratch/prd-creative-factory-search.md).

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
language has its script and, if you want, a voice of its own; the panel counts
the characters and quotes the price before you spend it, once per language
however many photos are in the batch.

Export takes the selected photos across every language ticked for release.
With the batch bound to a topic the panel grows a row per language saying
which campaign folder its files go to — the campaign whose manifest speaks the
language, by default — and a second control when only some photos are
selected, to send those elsewhere or nowhere; a language can be left out
entirely. The rule is data in `core/placement.ts`, so the split is shown before
the button is pressed and the count on it is arithmetic, not a plan. The server
writes each mp4 into `campaigns/<campaign>/creatives/` — made in scratch and
moved in whole, so a failed or cancelled file never sits there half-written —
and the finished note names the folders. A re-export replaces a file of the
same name: the creative was remade, not added to. Unbound, the export is a
download as before. It
runs as a job on the server, so the editor keeps working while it goes: a bar,
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

### The launches tab

The header's third tab is the buyer's launches as a tree: niche → topic →
campaigns, with the count of mp4 files in each campaign's folder before
anything goes up, and the rejected ones counted beside. The niche is the
`vertical` in `topic.yaml`, which `sa new --vertical` writes; a topic without
one sits under «без ніші». The tree is the disk and nothing else — it is
read again every few seconds while the tab is open, so a folder `sa new`
just made appears on its own, and the state of a campaign on the platform is
deliberately not drawn on it. Opening a topic asks the server for its plan,
which is what decides the button on each campaign: «Залити» where there is
something to create, «Перезалити» where the plan sees a relaunch, and a
disabled button with the reason where there is nothing to do or the folder
has errors. Pressing it shows that campaign's plan in the panel — the same
steps `sa plan <key> --campaign <name>` prints — and only a second press,
under the words «за живі гроші», starts the apply, which is then a bar, the
step in flight and a cancel, watched from any tab. The rule for the tree
is `core/launches-tree.ts`; the plan for one campaign — the topic's steps,
the campaign's own, and the steps of another campaign it leans on for a
shared profile or headline, with the other campaigns' errors left out — is
`narrowPlan` in `core/plan.ts`; both are tested there.

### Subtitles for a video from elsewhere

The header has a second tab. Drop a video from a designer, a phone or Grok
into it, pick a style, a language and a folder — a campaign of a topic, or the
pipeline's own `subs/output/` — and it goes through the same Python pipeline
the `inbox/<style>/` watcher feeds, one file at a time, as a job on the same
board as an export: a line per file with the pipeline's own stages, a cancel,
and the error under the file that failed. The six styles are read off the
pipeline's `--list-styles`, never listed here, and its `--check` says what the
machine is missing before the first file rather than on it. The mono-repo's
`setup.sh` installs the lot.

## Running it

A new buyer's machine: `../setup.sh` from the mono-repo root installs Node,
ffmpeg, both of this package's dependencies and `subs`', a config template,
and an hourly `launchd` agent that keeps the server alive for ticket syncs.
Rerunning it skips whatever is already there. `../ONBOARDING.md` is the one
page from that script to a first `sa new`.

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
bin/sa tickets
bin/sa config
bin/sa plan ai-vadim-sperm-it
bin/sa plan ai-vadim-sperm-it --campaign de-a
bin/sa apply ai-vadim-sperm-it --confirm
bin/sa apply ai-vadim-sperm-it --confirm --campaign de-a
bin/sa --version
```

`sa --version` answers without the server — the one check a clean install can
run before anything has ever been started. `sa tickets` runs the ticket sync
now and prints a line per folder; it is also what the mono-repo's `launchd`
agent calls hourly.

`sa` is a thin HTTP client to the server: flags in, one JSON object out, an
exit code that means something (0 done · 1 usage · 2 refused · 3 folder made
but no ticket · 4 no server · 5 server failed). It starts the server if none answers. `sa new`
lays out the launch folder under `launches_root` and files a ticket in
ClickUp; the folder always comes first, so a missing token leaves the buyer
with somewhere to work and a sentence saying why there is no ticket.

The buyer's own settings — `launches_root`, the ClickUp token and list, and
the platform's Bearer with the organisation id — live in
`~/.config/sa/config.json`, outside the repository (`SA_CONFIG` points
elsewhere for tests). Without the file everything defaults to `~/sa/launches`,
no ticket, and no platform.

### Tickets

A folder is a ticket. The server looks at `launches_root` when it starts,
every ten minutes after, right after every apply, and for the folder `sa new`
just made, and holds each folder against the ClickUp list: a folder with a
`topic.yaml` and no ticket gets one — found by name first, the launch key
being the task's name, so a lost `state.json` finds its own ticket rather than
making a twin — with `topic`, `vertical` and `geo` filled from the manifest;
a folder with a built campaign has its ticket raised to «in progress». The
rule, in `core/ticket-sync.ts`, only ever raises: a ticket the buyer moved
forward by hand stands, and «complete» is theirs alone. The ticket's id and
url go into the folder's `state.json`; the tab shows the link under the
topic, or the one sentence why there is none — no token, a vertical the list
does not offer, two tickets by one name. The list's status names are
`to do` / `in progress` / `complete` unless `clickup.statuses` in the config
says otherwise.

### `sa plan` and `sa apply`

`sa plan <key>` reads the launch folder — `topic.yaml`, every
`termgroups/<tg>/keywords.txt` (one key per line, an optional
`termgroup.yaml` beside it with `weight`, `country`, `language`), every
`articles/<a>/article.md` (a front matter with `title`, `country`,
`language`, or the first `#` heading as the title; pictures from `images/`
inlined as base64 the way the admin embeds them) — takes a snapshot of the
platform filtered by the topic, and prints the ordered list of calls with
their bodies. It creates nothing, however many times it runs — though an id
it found by read-back (a topic by `internal_name`, the campaign the platform
made from a builder) is written into `state.json` there and then, since an
empty plan is never applied and that is the only moment it would land. Anything wrong
in the folder is refused there, in words: a placeholder site, a key repeated
in a file, two articles with one title, a country the platform does not know.
The topic is found by `internal_name` even when `state.json` does not name it,
a term group by its folder name, a post by its title in the topic — so a run
that fell over between the platform's answer and the state file finds its own
entity on the next plan rather than making a twin. What exists is updated in
place (`PUT` for a term group, `POST /posts/{id}/update` for an article) and
only when its content changed; the article's hash of what was last sent is in
`state.json` next to the id.

`sa apply <key> --confirm` runs those steps as a job on the server, one after
another, with the pauses the admin's own traffic suggests and the read-back
the PRD insists on: an answer that never came, or a 5xx, is followed by a
read of the topic's list before anything is sent again, and only a list that
still lacks the entity earns a retry with backoff. Before every create the
list as it stood is written to `state.json` as `pending`, and every id goes
into the file the moment it is known — the server is the only writer. Ctrl-C
cancels after the step in flight. Without `--confirm` the command refuses
before reaching the server, and `~/sa/.claude/settings.json` denies it to
Claude outright: the gate is the flag and the deny, not a permission prompt.
The rule of the queue — timeouts, retries, pauses — is `core/queue.ts`; the
create-or-update decisions are `core/plan.ts`; both are tested there and only
obeyed in `server/apply.ts`.

### Creatives, headline, TSP and the campaign

A campaign is a folder under `campaigns/` with `campaign.yaml`, `script.md`
and mp4 files at the top of `creatives/` (`rejected/` below it is not sent).
A folder with no mp4 yet is the buyer's draft: the plan says it was left out
and goes on with the rest, placeholders and all. Once there are files, the
manifest has to be whole, and everything it points at is checked against
the platform before a single request is shown — the term group and article
folders, the cabinet alias and its ad account and pixel, the theme (by id,
key or title), the rsoc count, the country, the profile's language, age
bands and gender. The manifest's own `language` is the export locale the
placement rule reads; what the platform gets is `All`, as the admin sends
it, and targeting by language is the profile's `tsp.language`. The plan
for one campaign is four steps, in order:

- **Creatives** — one request per file, `ad_script` the campaign's script,
  in a single step: one list of the topic's videos before all the uploads,
  one after, and the new entries paired with the files by
  `original_filename`. A run that fell over after six of twelve leaves six
  on the platform; the next plan finds them by name and uploads the six
  that are missing. The same name in two campaigns of one plan is refused
  before anything goes up — the pairing is by name. Each file's hash goes
  into the state beside its id, so a creative re-exported under the same
  name is uploaded again, whether or not the campaign is built.
- **Headline** — one per text per topic, wrapped as the admin wraps it,
  matched by its words; two campaigns with one headline share the entry.
- **TSP** — the profile as the admin's form sends it. Profiles are shared by
  every campaign of the topic whose fields agree, so a profile the topic
  already has is used, and one this plan makes is referenced by the
  campaigns after it. A changed budget or bid is an update in place while
  the campaign is unbuilt; after, a warning — the live campaign keeps what
  it was published with.
- **Builder** — the campaign, from the post, the term group, the creatives
  and the profile, with the pixel, ad account and theme filled from the
  directories read before the plan; the step says what it took from them.
  Create-only: found again on the platform by its post and creative set,
  never updated. The campaign the platform makes from it — id and composed
  name — is picked up by a later plan and written down.

Each campaign has its own `state.json` beside its manifest: file name → id
and hash, the headline, the profile with the name the platform composed,
the builder with its campaign, and the history of every campaign the folder
ran before. The read-back pairing and the create-or-share decisions are
`core/campaign-plan.ts` and tested there.

### A relaunch

A built campaign cannot be edited, only replaced. When the creatives in the
folder no longer match what the builder was built with — a file remade
under its name after a reject, a new one added, one taken out — the plan is
a relaunch: the changed files go up, a new builder is made from the same
post and term group with the new creative ids, and the old campaign retires
into the state's `history` with its ids and a fate. The plan says what the
relaunch costs — a new link, and Google's keys on it from half an hour to a
day — and what happens to the old campaign, which is one of three things.
Rejected before it was published, or taken down by the provider: nothing to
pause. Live: paused through the admin's bulk update, by campaign id and
never builder id, but only once it is in the analytics — the campaign list
shows no spend, so until it does the first cent is read off its revenue,
and a campaign spending without a conversion yet is left running — because the
vault's stop rule says a status changed before that point stops the
platform tracking it. A live campaign that has not spent is left alone and
named, and asked about again on every later plan until it settles. The
verdict is `judgeRetired` in `core/campaign-plan.ts`, and the pause is
planned after the new builder, never before it. The campaign list is read
with the admin's own query and a ninety-day range; whether the platform
honours the range or its own week is a thing the first live relaunch has to
show — a campaign the list does not show is named and left alone.

### Autorules

A preset is a file under `rules/` — conditions, an action, when the platform
rechecks it, and optional limits — and `topic.yaml`'s `rules: [stop-loss]`
names the ones a topic turns on. `plan` waits for the topic to exist, because
the buyer the rule must carry — the platform's own field for it is named
`ad_account_id` but actually takes a `user_id`, the trap the vault warns
about — is read back off the topic rather than typed anywhere; a rule with no
buyer fires for every buyer on the platform. Once the topic is known, `plan`
creates what is missing, adopts a rule already on the topic whose conditions
and action match the preset instead of making a twin, and — because the
platform's create call refuses limits — follows a create with a `PUT` that
adds them. An existing rule with no topic at all is named as a warning: it
already applies to everything this buyer runs and will stack onto the
topic's own. The preset-to-request-body conversion and all of this is
`core/rules.ts`, tested there and in `core/plan.ts`.

### A batch in its topic folder

The panel's first group binds the project to `launches/<key>/batches/<batch>/`.
Pick a topic, open a batch or save the one on screen under a new name, and
from then on ⌘S and the header's Save write there: `project.json` with the
pictures beside it in `photos/`, referenced by name rather than embedded. The
split happens on the server, in `core/batch-folder.ts`; the editor sends and
receives the same file it would download, so a `creatives.json` saved through
the browser opens from the folder chooser too and comes out as files on the
next save. A photo whose file has gone is left out on open and named, rather
than opened blank. Pictures are only ever written, never removed: a photo
taken out of the batch leaves its file in `photos/` until the buyer deletes it.

Two stores, one source. The autosave in IndexedDB is the browser's memory of
the session; the folder is the batch. The header says which it is looking at
— `key/batch · у теці` or `· не збережено в теку` — and after a reload it
reads the folder back and compares before saying either. The `.json` button
beside Save is the old path and stays as the fallback.

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
  `core/plan.ts` decides what the platform is asked for — the steps, their
  bodies, create against update — from the folder, a snapshot and the state,
  and narrows that to one campaign for the tab and `--campaign`;
  `core/launches-tree.ts` turns the folder structure into the tree the tab
  draws;
  `core/campaign-plan.ts` does the same for a campaign — creatives,
  headline, profile, builder — and pairs uploads with read-backs;
  `core/article.ts` turns `article.md` into the HTML that is sent;
  `core/queue.ts` decides what happens to a call that went wrong.
  `server/platform.ts` is the digifor client, thin, answering outcomes rather
  than throwing; `server/apply.ts` runs a plan as a job and is the one writer
  of `state.json`.
- **`src/server`** — Express, Puppeteer, ffmpeg. Bundles the render target from
  source at startup, so the headless page can never drift from the editor. An
  export is a job in memory: the editor posts a plan, gets an id, and watches it.
  `jobs.ts` is the registry — state, progress, cancel, sweep — and `batch.ts`
  and `subs.ts` are two kinds of work on it, so a subtitle run and an export
  are watched through the same routes. `batches.ts` is the launch folder as
  the editor reads and writes it. ElevenLabs and the translators sit behind
  two thin modules; a missing key is a state each of them explains rather than
  an error the server starts with. `subs.ts` runs `../subs` as a subprocess
  and knows nothing about styles beyond what the pipeline prints — for a
  dropped video with Whisper, for an exported creative with the words the
  export already has (`--words`), the burn being `render → mux → burn` on
  each file in `batch.ts`.

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
