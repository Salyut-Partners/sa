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

The header's third tab is the buyer's launches as a table. On the left the
topics, grouped by niche — the `vertical` in `topic.yaml`, which `sa new
--vertical` writes; a topic without one sits under «без ніші» — and for the
chosen topic, source → cabinet → campaigns, grouped from the same
`topic.yaml` and `campaign.yaml` files the plan reads, with a totals line per
cabinet, per source and for the topic: campaigns, built, active, rejected,
without creatives. Every campaign is in exactly three states and nothing
more. **The disk:** how many mp4 files at the top of `creatives/`, the
rejected ones beside, whether `script.md` has words, whether the manifest
reads. **The launch:** not built, built, or «є різниця — треба перезалив»,
from `state.json` and the plan. **The platform:** the builder's status and
the campaign's — on review, rejected with the reason in a line, approved,
active, paused, taken down — with a link into the admin's campaign builder
page. Spend, ROI and clicks are deliberately not there: the platform has
them, and two versions of that truth would be one too many.

Names, not ids. The buyer reads the topic's name, the cabinet's name as the
platform lists it (off the buyer's builders, `ad_account_name`), and a
launched campaign's platform name; the launch key, the folder names and every
id are in the tooltips and in what «Копіювати» copies. That button is on the
topic and on every campaign: a block of text for a chat with Claude — topic
name, key and id, the folder's full path, the creatives, the platform's
state, builder and campaign ids, budget and bid — enough to find the thing
without asking (`campaignClipboard` and `topicClipboard` in
`core/topic-table.ts`). The address keeps the place: `#/launches/<key>`,
`#/creatives`, `#/subtitles` (`core/route.ts`), so a reload opens the same
topic and Back walks between tabs; the plan panel is not in it.

The platform's side is read once per buyer, never per topic:
`GET /campaign-builder?user_id=` gives every builder of the buyer across all
their topics with `status`, `rejection_reasons`, the review bot's verdict per
creative and the campaigns made, and `GET /v2/campaigns?user_id=` the
campaigns' statuses (the list honours `user_id`, verified 2026-09-11). The
server reads both when it starts, every five minutes, after every apply, and
when a topic is opened — waiting a few seconds for that read and no longer,
since a slow platform must not hold the table. What is read is matched to
the folders by the builder id in each campaign's `state.json`, never by
name; the rule is `platformColumn` in `core/topic-table.ts`. Whose builders
to read is `platform.user_id` in the config, or, when that is not set, the
buyer the first topic on the platform belongs to. Below the table are the
topic's sources, each with «відкрити в редакторі».

Opening a topic is the disk and those two buyer-wide reads, and no plan —
the plan is a dozen and a half reads per topic, and switching topics must
not pay for it. Without the plan the launch column says what the disk and
the state can: «не залита», «залита», or «файли змінились після заливу» when
the mp4 files under `creatives/` are not the ones the state recorded, by
name and hash (`launchColumn`). The table is read again by itself: the tab
polls the disk every few seconds and the tree's answer carries the platform
status's version, so a folder, an export's files, or a rejection that just
landed each make the table read again.

Two steps, two buttons. «**Оновити план**» on the topic reads the platform
again and counts the topic's plan; the panel beside the table opens under
«Нічого ще не зроблено. Ось що станеться:» with a box per campaign the plan
would launch or relaunch — new launches ticked, relaunches not, since a
relaunch pauses the old campaign — and a click on a row ticks it too. While
the panel is open the table is read with the plan. Ticking changes the steps
shown, and the number on the one button at the bottom, «**Залити N кампаній —
за живі гроші**», which is the only thing that sends anything. The panel
speaks the buyer's words: the plan's lines go through `core/wording.ts`,
which turns `campaign.yaml`, `sa plan` and the like into what they are; the
CLI, Claude and the copied text keep the technical line.

**Import from the platform.** «Імпортувати з платформи» at the top of the
topic list lists the buyer's topics that no folder has yet — read off the
buyer's builders, each of which names its topic — with the set-ups each runs,
how many are live and rejected, and a launch key to start from. The ticked
ones are imported as `sa adopt` imports: topic, keys, articles, and every
campaign. Builders are grouped by set-up — article, term group, source,
cabinet, pixel, country — since a relaunch is a new builder of the same
set-up and a buyer never runs two live campaigns on one; the newest builder
is the folder's current one, the older ones its history with the fate the
platform shows, and a set-up whose newest campaign was taken down is not
imported. The manifest comes from the newest builder and its profile (read
off `GET /campaign-builder/<id>`), the script from its videos. Videos are not
downloaded: the state names them without a hash, so the plan leaves the
folder alone until the buyer puts files into it, and then it is a relaunch.
Whose topics to list is the token's own answer: the platform's Bearer is a
JWT whose `sub` is the buyer it was issued to, which `core/platform-token.ts`
reads, so a fresh install with nothing but a token in the config already knows
its buyer. The order is `platform.user_id`, the token, then a topic of a launch
folder; a buyer none of the three answers for is still asked for the id of one
topic of theirs, and the buyer is learned from it. Each row also carries the
niche the topic goes in under — the platform has no such field, so without one
an import would sit under «без ніші». The words offered are the ClickUp list's
`vertical` dropdown and nothing else, since a niche the ticket cannot carry
fails on the first sync; `core/niche.ts` guesses one from the topic's name
(`NewEraVadimJobsEU` is jobs), answers only an option it was given, and leaves
a name that says two niches to the buyer. The rule is `core/adopt.ts`, tested
there. The apply is then a bar,
the step in flight and a cancel, watched from any tab, and narrowed on the
server to the ticked campaigns: `narrowPlan` in `core/plan.ts` takes a list
and keeps the topic's steps, the campaigns' own, and the steps of other
campaigns they lean on for a shared profile or headline, and
`campaignOutline` says per campaign which indexes of the whole plan that is,
so the panel shows exactly what a tick adds.

Rejects, the minimum. A rejected builder shows «реджект» and the reason in
its row. The review bot names the creatives it turned down, and the plan
reads that off the builder (`review_bot_result`, one verdict per creative,
its id being `<builder>-<creative>-<headline>`): on a relaunch of a rejected
campaign, a file the bot marked `non_compliant` that is still in the folder
unchanged is cut — left out of the new builder and named in the plan with
the bot's reason, so the buyer sees which file to replace rather than
rebuilding the same rejection; a replaced file is a new upload and is not
cut; a folder whose every file is cut is refused until something is
replaced; a rejection the bot put on no file plans nothing and says so.
Files on disk are not moved and the ticket is not commented — the full
reject flow is a later ticket. The rule is in `core/campaign-plan.ts`, tested
there; the table in `core/topic-table.ts`, tested there.

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
bin/sa adopt 107567 --key ai-jobs-de-wh --vertical jobs
echo '{"termgroups": {...}, "articles": {...}, "geos": [...], "defaults": {...}}' | bin/sa expand ai-vadim-sperm-it
bin/sa expand ai-vadim-sperm-it --file matrix.json
bin/sa new campaign ai-vadim-sperm-it --termgroup tg-wh --article a-wh --language de --country DE --account main
bin/sa launches
bin/sa tickets
bin/sa config
bin/sa plan ai-vadim-sperm-it
bin/sa plan ai-vadim-sperm-it --campaign de-a
bin/sa apply ai-vadim-sperm-it --confirm
bin/sa apply ai-vadim-sperm-it --confirm --campaign de-a
bin/sa budget ai-vadim-sperm-it/de-a 40
bin/sa bid ai-vadim-sperm-it --all --country DE --status active 0.55 --confirm
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

`sa expand` is the launch matrix as folders. The JSON names the axes — term
groups (with their keys, or `null` for a folder that exists), articles (with a
title, or `null`), `geos` as language+country pairs, `accounts` as cabinet
aliases from `topic.yaml` (every cabinet when left out) — plus `defaults` for
every cell (`theme`, `headline`, `rsoc_count`, `keyword_rotation`, `tsp`) and
`overrides`, each a `where` over the axes and a `set` of fields, a `name`
among them. The cells are the product; each becomes `campaigns/<name>/` with a
manifest the plan reads and an empty `script.md`. The name is the rule
`<language>-<country>-<account>-<termgroup>-<article>` unless the cell says
otherwise. The matrix is a generator, not a file: nothing of it is kept, a
folder that exists is skipped and never rewritten, and a second run with the
same JSON makes nothing. `sa new campaign` is the one-cell version over folders
that already exist, and refuses a name that is taken. The rule for all of it
is `core/matrix.ts`.

`sa adopt <topic-id> --key <launch-key>` is the folder for a topic that was
made by hand in the admin: the site, topic, keys and articles are there, and
the campaigns are to start from a matrix. It reads the topic, its
configurations, term groups, posts and builders — nothing is written to the
platform — and lays out `topic.yaml` with the name, the internal name, the
site off the posts, and one cabinet per distinct source, ad account and
pixel the topic's builders were launched from (`tk-1`, `fb-1`…, the pixel's
name in a comment; placeholders and a note when the topic has no builders
yet); `termgroups/<name>/keywords.txt` with the live keys, and a
`termgroup.yaml` beside it where the platform's name is not a folder name
(`name: tgHR` in a folder `tghr`), or the weights are not equal shares, or a
country or language is set; `articles/<slug>/article.md` from each post's
HTML — the converter in `core/html-markdown.ts` is the inverse of the one in
`core/article.ts`, small for the same reason — with the pictures fetched into
`images/`; and `state.json` with the topic, configuration, term group and
post ids. The launch key is the buyer's to name: it cannot be read off
`AImobNLtrap`. Existing campaigns of the topic are not taken. The state
carries a **fingerprint** of each adopted article — the hash the plan
computes from the converted file with the pictures as they lie on disk — so
the plan compares the file with that rather than with the platform, and the
first plan after an adopt is empty; a key edited afterwards is an update of
the term group, not a twin. A key that is taken, a folder that exists, or a
topic another folder already names is a refusal in words; what still needs a
hand — a site the topic's posts disagree on, a group without keys — comes
back as notes. The ticket is filed by the usual sync. The rule is
`core/adopt.ts`, tested there.

A topic has no traffic source of its own — the platform's does not either.
Each cabinet in `topic.yaml` carries `source: tiktok|facebook` beside its
`ad_account` and `pixel`, a campaign's source is its cabinet's, and the plan
makes one topic configuration per source the cabinets span. The directories
are read per source — `/pixels?traffic_source=`,
`/facebook/ad-accounts?site_id=&traffic_source=` — and a Facebook campaign's
creatives, headline, profile and builder all carry `facebook`. What the chain
does not have yet is the admin's own Facebook forms: every request body was
taken from TikTok dumps, and a Facebook profile or builder may want fields
TikTok's do not, so the plan for a campaign on a Facebook cabinet says so in
a warning and shows the TikTok-shaped bodies for the buyer to read before an
apply. The forms go in once the dumps of a Facebook profile and builder made
in the admin are taken (`core/campaign-plan.ts`, where the bodies are built).

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
making a twin — with `topic`, `vertical` and `geo` filled from the manifest
and the buyer themselves on it: the token that files the task is the buyer's
own, so `GET /user` says who to assign it to, asked once for the server's life
and skipped without complaint when it will not answer — an unassigned ticket
beats no ticket. A folder with a built campaign has its ticket raised to
«in progress». The
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

### A budget or a bid on a live campaign

`sa budget <key>/<campaign> 40` and `sa bid <key>/<campaign> 0.55` are the
one pointed change a launched campaign gets, and only when the buyer asks
for it — «підніми DE до 40». They go through the same gate as a launch:
without `--confirm` the answer is the plan, a line per campaign saying what
it stands at now — off the platform's own campaign list, which carries the
budget and the bid — and what it would stand at, by campaign id and never
builder id; with `--confirm` the change goes out, and the campaign's
`state.json` keeps the new value and the time under `live`, the manifest
keeping what it was built with. `<key> --all` takes every campaign of the
topic the platform has made and not taken down, narrowed by `--country DE`
(the manifest's country) and `--status active` (the platform's), and says
why each other one was left. A campaign that is not launched, has no
campaign on the platform yet, or was taken down by the provider is a
refusal in words; one already at the value is skipped. Nothing of this is
on the table: changing a live campaign from a table would be the admin
twice. The rule is `core/adjust.ts`, tested there; `~/sa/.claude/settings.json`
denies the `--confirm` form to Claude, the flag-less plan is Claude's to run.

The write is the admin's campaign management, one multipart per campaign
to `POST /v2/campaign/<id>` carrying the id, the bid, the budget and the
status all at once — the admin never sends one of them alone, so a change
of the bid carries the budget and the status as the platform's list shows
them, and a campaign the list does not show yet cannot be changed: a named
one is a refusal, `--all` skips it. Under `--confirm` `server/adjust.ts`
reads the platform again first, so the numbers it sends back are minutes
fresh and not a cached list's, then sends the forms in the plan's order
under the queue policy — an update is safe to send twice, so an uncertain
answer is read back off the list and sent again when the new value is not
there; a `success: false` stops with the platform's words — writes each
success into the campaign's state at once, keeps each failure for the
answer and tries the next campaign anyway. The answer lists `applied` and
`failed`; exit code 3 when there are both, 5 when nothing went through.
The folder is claimed for the while, as an apply claims it, so neither
runs while the other does.

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

### Sources in the topic folder

Nothing is chosen up front and nothing is saved into a folder by hand: the
buyer drops photos and works, and the autosave keeps the session. The export
panel's «Куди» picks the topic — or none, for a download as before — and an
export into its campaigns writes the sources under
`launches/<key>/sources/<MMDD-HHmm>/`, named by the server's clock. A second
export of the session into the same topic writes into the same batch; an
export into another topic starts that topic's own; «Новий» forgets the
binding (`batchForExport` in `core/batch-folder.ts`). The header's Save and
⌘S save the project file through the browser. `project.json`
lies beside the pictures, flat, referenced by name rather than embedded. The
split happens on the server, in `core/batch-folder.ts`; the editor sends and
receives the same file it would download, so a `creatives.json` saved through
the browser opens from the sources chooser too and comes out as files on the
next save. A photo whose file has gone is left out on open and named, rather
than opened blank. Pictures are only ever written, never removed. An older
batch is opened again from the topic's table in the launches tab.

Since the matrix, one language is several campaigns. The «Куди» rows show a
box per campaign that speaks the language, all ticked, with the rest of the
topic's campaigns folded under «інші кампанії» for the split by place rather
than tongue; the file is copied into every ticked folder, rendered once. A
partial selection gets a second set of boxes for those photos alone, and
«як мова» hands them back to the row. The rule is `core/placement.ts`; the
plan pays for the copies once — the same bytes under one name in two
campaigns of a topic is one creative, uploaded by the first campaign and
referenced by the rest (`core/campaign-plan.ts`).

The editor's tools — undo, open, save, new, the photo count — are in the
header of the creatives tab only; the launches and subtitles tabs keep the
theme switch and nothing else.

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
  and narrows that to some campaigns for the tab's ticks and `--campaign`;
  `core/adjust.ts` decides what `sa budget` and `sa bid` would change —
  which campaigns, from what, to what — and what refuses;
  `core/adopt.ts` turns a topic read off the platform — with its campaigns,
  grouped by set-up — into the folder `sa adopt` and the import write and the
  state it starts from, and lists the topics an import can take;
  `core/html-markdown.ts`
  the platform's article HTML back into `article.md`;
  `core/launches-tree.ts` turns the folder structure into the topic list the
  tab draws, and `core/topic-table.ts` one topic's folders, state files and
  the buyer's platform status into the table's three states per campaign
  and the text «Копіювати» copies; `core/wording.ts` the plan's lines into
  the buyer's words; `core/route.ts` the address into a tab and a topic;
  `core/matrix.ts` turns a launch matrix into the folders `sa expand`
  and `sa new campaign` write, and decides their names;
  `core/campaign-plan.ts` does the same for a campaign — creatives,
  headline, profile, builder — and pairs uploads with read-backs;
  `core/article.ts` turns `article.md` into the HTML that is sent;
  `core/queue.ts` decides what happens to a call that went wrong.
  `server/platform.ts` is the digifor client, thin, answering outcomes rather
  than throwing; `server/policy.ts` is the one loop that sends a write the
  way the queue policy says; `server/apply.ts` runs a plan as a job and owns
  the writing of `state.json` — `adjust.ts`, `launches.ts` and `tickets.ts`
  write it through its `writeState`, and a folder being applied or adjusted
  is claimed so two writers never meet; `server/platform-status.ts` keeps the buyer's builders and
  campaigns as the platform last showed them, on a timer, and hands the
  table a version number; `server/plans.ts` counts a topic's plan in the
  background, so «Оновити план» outlives the tab that pressed it.
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
