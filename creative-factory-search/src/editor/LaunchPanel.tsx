import { useEffect, useMemo, useRef, useState } from 'react';
import { batchNames, keepItems, planBatch } from '../core/batch.ts';
import { LOCALE_NAMES, voiceCheck } from '../core/locales.ts';
import { FLAGS } from '../core/phrasebook.ts';
import { FB_AGE_MAX, FB_AGE_MIN, hasCap, type FacebookSettings } from '../core/platform-model.ts';
import {
  boundElsewhere, campaignWarnings, choiceOf, creativesCount, elsewhereWarning, forCabinet, mediaOf, nextCampaign, pixelChoices, ratioWarning, startText,
  TEAM_DEFAULTS, TIKTOK_IMAGE_WARNING, uncheckedOnFacebook,
  type FormDefaults, type LaunchCampaign, type LaunchForm,
} from '../core/quick-launch.ts';
import type { LocaleId, Project } from '../core/types.ts';
import { FilePicker } from './FilePicker.tsx';
import { useLaunch } from './launch.ts';
import { fetchLaunchTopic, fetchLaunchTopics, stageLaunchFile, transcribeLaunchFile, translate, type LaunchTopic, type StagedFile } from './server.ts';
import type { Translator } from './translate.ts';
import { VoiceLines } from './VoiceCheck.tsx';

interface Props {
  project: Project;
  translator: Translator;
}

const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);

/** The set select's value for a term group and article with no campaign yet. */
const NEW_SET = ' new';
const setValue = (termGroupId: number, postId: number): string => `${termGroupId}|${postId}`;

/**
 * What was read off the platform this session, kept while the editor is open:
 * going back to a topic shows it at once, and «Оновити з платформи» reads it
 * again when something was changed in the admin. Keyed by topic and source.
 */
const topicCache = new Map<string, LaunchTopic>();
let topicsCache: { id: number; name: string }[] | null = null;
const cacheKey = (topicId: number, source: string): string => `${topicId}|${source}`;

/** A topic as the search box shows it: its name, with the id when two of the buyer's share one. */
const topicLabel = (t: { id: number; name: string }, all: readonly { id: number; name: string }[]): string =>
  all.filter(x => x.name === t.name).length > 1 ? `${t.name} · ${t.id}` : t.name;

/**
 * A designer's file in the form. A video with the words it speaks: transcribed
 * when added, then the buyer's to read over. An image with its preview and
 * size, going up as it is — no words, nothing to wait for.
 */
interface DiskFile extends StagedFile {
  script: string;
  /** `busy` while Whisper listens; `failed` leaves the script for the buyer to type. An image is `done` at once. */
  words: 'busy' | 'done' | 'failed';
  note: string;
  /** An image's preview, off the buyer's own file. */
  preview?: string;
  width?: number;
  height?: number;
}

/** An image's pixels, read off the file in the browser. */
const imageSize = (url: string): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => reject(new Error('картинка не відкривається'));
  img.src = url;
});

const GOALS: [FacebookSettings['performance_goal'], string][] = [['MAXIMIZE_NUMBER_OF_CONVERSIONS', 'Maximize Number of Conversions'], ['MAXIMIZE_VALUE_OF_CONVERSIONS', 'Maximize Value of Conversions']];
const STRATEGIES: [FacebookSettings['bid_strategy'], string][] = [
  ['LOWEST_COST_WITH_BID_CAP', 'Bid Cap'], ['COST_CAP', 'Cost per result goal'], ['LOWEST_COST_WITHOUT_CAP', 'Lowest cost (без капу)'],
];
const PLACEMENT_NAMES: [FacebookSettings['placements'], string][] = [['advantage', 'Advantage+'], ['facebook', 'Facebook Only']];
const label = <T extends string>(list: [T, string][], value: T): string => list.find(([v]) => v === value)?.[1] ?? value;
const AGES = Array.from({ length: FB_AGE_MAX - FB_AGE_MIN + 1 }, (_, i) => FB_AGE_MIN + i);
const ageName = (n: number): string => (n === FB_AGE_MAX ? `${n}+` : String(n));

/**
 * A campaign in the form: a cabinet with its budget and bid, and the pixel and
 * identity fitted to its business. `made` once a launch built it and another
 * row of the same launch failed: it is not sent again, so «Спробувати ще» makes
 * only what is missing.
 */
interface Row extends LaunchCampaign {
  key: number;
  made: boolean;
}

const campaignOf = (row: Row): LaunchCampaign => ({ account: row.account, budget: row.budget, bid: row.bid, pixel: row.pixel, page: row.page });
/** A number as the buyer types it, with a comma or a point. */
const typed = (text: string): number => Number(text.replace(',', '.'));

/** A list typed as one line: `All`, or `18-24, 25-34`. */
const listText = (list: readonly string[]): string => list.join(', ');
const textList = (text: string): string[] => text.split(',').map(s => s.trim()).filter(s => s !== '');

/**
 * The launch: a topic off the platform, a set — a term group and an article —
 * and the fields, filled from the set's latest campaign; a row per campaign —
 * a cabinet, its budget and bid, the bids a ladder; one press, a modal to read
 * it all again, and the new campaigns. Nothing is kept anywhere: the next
 * press reads the platform again. The form stays as it is after a launch, so
 * the same set to a second country is one select and one press.
 */
export function LaunchPanel({ project, translator }: Props) {
  const run = useLaunch();
  // The creatives: every render the export would make, ticked unless unticked — a new language arrives ticked —
  // and the designer's files, sent to the server as they are added.
  const renders = useMemo(() => batchNames(project), [project]);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [disk, setDisk] = useState<DiskFile[]>([]);
  const known = useRef(new Set<string>());
  const [staging, setStaging] = useState<string[]>([]);
  const [diskNote, setDiskNote] = useState('');
  const [dropping, setDropping] = useState(false);
  const ticked = renders.filter(r => !off.has(r.name));
  const total = ticked.length + disk.length;
  const diskImages = disk.filter(d => d.kind === 'image').length;

  const addFiles = (list: FileList | null): void => {
    const files = Array.from(list ?? []);
    const wrong = files.filter(f => mediaOf(f.name) === null);
    setDiskNote(wrong.length === 0 ? '' : `Не mp4 і не jpg, png чи webp, пропущено: ${wrong.map(f => f.name).join(', ')}`);
    for (const file of files.filter(f => mediaOf(f.name) !== null)) {
      setStaging(s => [...s, file.name]);
      stageLaunchFile(file)
        .then(staged => {
          // The same file dropped twice is in the form once, and listened to once.
          if (known.current.has(staged.id)) return;
          known.current.add(staged.id);
          const patchFile = (change: Partial<DiskFile>): void => setDisk(d => d.map(x => (x.id === staged.id ? { ...x, ...change } : x)));
          if (staged.kind === 'image') {
            const preview = URL.createObjectURL(file);
            setDisk(d => [...d, { ...staged, script: '', words: 'done', note: '', preview }]);
            imageSize(preview).then(size => patchFile(size)).catch(e => patchFile({ note: (e as Error).message }));
            return;
          }
          setDisk(d => [...d, { ...staged, script: '', words: 'busy', note: '' }]);
          transcribeLaunchFile(staged.id)
            .then(text => patchFile({ script: text, words: 'done' }))
            .catch(e => patchFile({ words: 'failed', note: (e as Error).message }));
        })
        .catch(e => setDiskNote((e as Error).message))
        .finally(() => setStaging(s => { const i = s.indexOf(file.name); return i < 0 ? s : [...s.slice(0, i), ...s.slice(i + 1)]; }));
    }
  };
  const [topics, setTopics] = useState<{ id: number; name: string }[] | null>(topicsCache);
  const [topicsNote, setTopicsNote] = useState('');
  const [topicId, setTopicId] = useState<number | null>(null);
  const [topicQuery, setTopicQuery] = useState('');
  /** Bumped by «Оновити з платформи»: the topic is read again whatever the cache holds. */
  const [refresh, setRefresh] = useState(0);
  const [source, setSource] = useState('');
  const [data, setData] = useState<LaunchTopic | null>(null);
  const [dataNote, setDataNote] = useState('');
  const [chosen, setChosen] = useState('');
  const [newGroup, setNewGroup] = useState<number | null>(null);
  const [newPost, setNewPost] = useState<number | null>(null);
  const [form, setForm] = useState<FormDefaults | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const nextKey = useRef(0);
  /** How much a row added bids over the last: the team's, until the buyer types another. */
  const [step, setStep] = useState(String(TEAM_DEFAULTS.bid_step));
  /** The buyer chose the cabinet's default identity: a cabinet picked after keeps it, not the team's. */
  const [plainPage, setPlainPage] = useState(false);
  /** The rows the last press sent, by key, in the order the server numbers them. */
  const sent = useRef<number[]>([]);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** The modal's answer for languages with no script: translated into, or left silent. */
  const [fillEmpty, setFillEmpty] = useState(true);
  const voice = voiceCheck(project);
  /**
   * The `ad_script` a language's renders go up with, where the buyer wrote one over the voice's
   * script. A language not here follows the script as it is now; one here stays as written until
   * «↺ як в озвучці». For this launch only: the voice and the project keep their words.
   */
  const [adScripts, setAdScripts] = useState<Partial<Record<LocaleId, string>>>({});
  const [adNote, setAdNote] = useState('');
  const [adBusy, setAdBusy] = useState(false);
  const going = [...new Set(ticked.map(r => r.locale))];
  const voiceScript = (id: LocaleId): string => project.locales.find(l => l.id === id)?.script ?? '';
  const adScript = (id: LocaleId): string => adScripts[id] ?? voiceScript(id);
  const handWritten = going.filter(id => adScripts[id] !== undefined);
  /** One language's `ad_script` into every other going out — each of them then the buyer's, as if typed. */
  const translateAd = (from: LocaleId): void => {
    const text = adScript(from).trim();
    const targets = going.filter(id => id !== from);
    if (text === '' || targets.length === 0) return;
    setAdBusy(true);
    setAdNote('Переклад…');
    translate([text], targets)
      .then(result => {
        const out = targets.flatMap(id => { const t = result.out[id]?.[0]; return t === undefined || t.trim() === '' ? [] : [[id, t] as const]; });
        setAdScripts(a => ({ ...a, ...Object.fromEntries(out) }));
        const lost = targets.filter(id => !out.some(([o]) => o === id));
        setAdNote(lost.length === 0 ? '' : `Переклад не повернувся для: ${lost.map(id => LOCALE_NAMES[id]).join(', ')}`);
      })
      .catch(e => setAdNote((e as Error).message))
      .finally(() => setAdBusy(false));
  };

  const loadTopics = (): void => {
    fetchLaunchTopics()
      .then(list => { topicsCache = list; setTopics(list); setTopicsNote(''); })
      .catch(e => { if (topicsCache === null) setTopics([]); setTopicsNote((e as Error).message); });
  };
  useEffect(() => { if (topicsCache === null) loadTopics(); }, []);

  // The topic: from what this session already read, or off the platform — on a first visit, a new
  // source (the cabinets and pixels are the source's), or «Оновити з платформи». The first read asks
  // for no source and learns the team's; saying so back is not a reason to read again.
  const loaded = useRef('');
  const refreshed = useRef(0);
  useEffect(() => {
    const forced = refresh !== refreshed.current;
    refreshed.current = refresh;
    if (!forced && topicId !== null && loaded.current === cacheKey(topicId, source)) return;
    setDataNote('');
    if (topicId === null) { setData(null); return; }
    const held = forced ? undefined : topicCache.get(cacheKey(topicId, source));
    if (held !== undefined) {
      loaded.current = cacheKey(topicId, held.source);
      setData(held);
      if (source === '') setSource(held.source);
      return;
    }
    if (!forced) setData(null);
    let stale = false;
    fetchLaunchTopic(topicId, source)
      .then(next => {
        if (stale) return;
        topicCache.set(cacheKey(topicId, next.source), next);
        if (source === '') topicCache.set(cacheKey(topicId, ''), next);
        loaded.current = cacheKey(topicId, next.source);
        setData(next);
        if (source === '') setSource(next.source);
      })
      .catch(e => { if (!stale) setDataNote((e as Error).message); });
    return () => { stale = true; };
  }, [topicId, source, refresh]);
  const reading = topicId !== null && dataNote === '' && (data === null || data.topic.id !== topicId);

  // A new topic, a new source or a new set starts the form from that set's defaults, and one row with no cabinet.
  // The same one read again — «Оновити з платформи», a launch — keeps the rows: a row already made stays made,
  // and is not sent a second time.
  const rowsFor = useRef('');
  useEffect(() => {
    if (data === null) { setForm(null); setRows([]); rowsFor.current = ''; return; }
    const set = data.sets.find(s => setValue(s.termGroup.id, s.article.id) === chosen);
    const defaults = set?.defaults ?? (chosen === NEW_SET ? data.newSet : null);
    setForm(defaults === null ? null : { ...defaults, source: data.source, theme: themeId(data, defaults.theme) });
    const same = `${data.topic.id}|${data.source}|${chosen}`;
    if (defaults !== null && rowsFor.current === same) return;
    rowsFor.current = defaults === null ? '' : same;
    setRows(defaults === null ? [] : [{ key: nextKey.current++, account: null, budget: defaults.budget, bid: defaults.bid, pixel: defaults.pixel, page: defaults.page, made: false }]);
    setStep(String(data.bidStep));
    setPlainPage(false);
  }, [data, chosen]);

  // A launch made campaigns: what this session read of the topic is behind the platform now — read it
  // again next time it is opened. The form on screen stays, so a second country is one select and one press.
  useEffect(() => {
    if ((run.phase !== 'done' && run.phase !== 'failed') || topicId === null || run.launch?.result == null) return;
    for (const key of [...topicCache.keys()]) if (key.startsWith(`${topicId}|`)) topicCache.delete(key);
  }, [run.phase, run.launch, topicId]);

  // A launch that made some campaigns and not others: the made rows are not sent again. One that made them
  // all leaves every row to send again — the same rows to another country, say.
  useEffect(() => {
    if (run.phase === 'done') { setRows(list => list.map(r => (r.made ? { ...r, made: false } : r))); return; }
    if (run.phase !== 'failed' || run.launch === null) return;
    const finished = new Set(run.launch.finished);
    const made = new Set(run.lines.filter(l => l.campaign !== undefined && finished.has(l.label)).map(l => sent.current[l.campaign!]));
    setRows(list => list.map(r => (made.has(r.key) ? { ...r, made: true } : r)));
  }, [run.phase, run.launch, run.lines]);

  /** A row's pixel and identity: the form's, fitted to its cabinet's business. */
  const fit = (row: Row, shared: Pick<FormDefaults, 'pixel' | 'page'>, plain: boolean): Row =>
    data === null ? row : {
      ...row,
      ...forCabinet(shared, row.account, data, plain ? '' : data.identity, data.source === 'facebook' ? { recentPages: data.recentPages } : undefined),
    };
  const patchRow = (key: number, change: (row: Row) => Row): void => setRows(list => list.map(r => (r.key === key ? change(r) : r)));
  /** A row at the end, its bid a step over the last row's. */
  const addRow = (account: string | null): void => {
    if (form === null) return;
    setRows(list => [...list, fit({
      key: nextKey.current++, account, ...nextCampaign(list, form, typed(step) || 0), pixel: form.pixel, page: form.page, made: false,
    }, form, plainPage)]);
  };
  /** The pixel or identity of every campaign: the one picked, or the same name in each cabinet's business. */
  const pickShared = (change: Partial<Pick<FormDefaults, 'pixel' | 'page'>>, plain = plainPage): void => {
    if (form === null) return;
    const shared = { pixel: form.pixel, page: form.page, ...change };
    setForm({ ...form, ...change });
    setPlainPage(plain);
    setRows(list => list.map(r => (r.made ? r : fit(r, shared, plain))));
  };
  const pending = rows.filter(r => !r.made);
  /** Why a row's campaign was not made by the last press, when it was sent and failed. */
  const rowFailure = (key: number): string | undefined => {
    if (run.phase !== 'failed' || run.launch === null) return undefined;
    const line = run.lines.find(l => l.campaign !== undefined && sent.current[l.campaign] === key);
    return line === undefined ? undefined : run.launch.errors.find(e => e.name === line.label)?.message;
  };
  const onFacebook = form?.source === 'facebook';
  /** Whether the rows' bids mean anything: always on TikTok, under Bid Cap on Facebook. */
  const capped = !onFacebook || form === null || hasCap(form.facebook);
  /** What a row still lacks, said on the row. */
  const rowNeeds = (row: Row): string | null =>
    row.account === null ? 'оберіть кабінет' : !(row.budget > 0) ? 'бюджет має бути більшим за нуль' : capped && !(row.bid > 0) ? 'бід має бути більшим за нуль'
      : onFacebook && row.page === null ? 'оберіть FP — на Facebook без сторінки оголошення немає' : null;
  /** On Facebook, a row whose pixel is another cabinet's row of the same business: it may go, or not — said, not stopped. */
  const pixelElsewhere = (c: Pick<LaunchCampaign, 'account' | 'pixel'>): string | null => {
    if (!onFacebook || data === null) return null;
    const cabinet = data.accounts.find(a => a.id === c.account);
    const pixel = data.pixels.find(p => p.id === c.pixel);
    return cabinet === undefined || pixel === undefined || !boundElsewhere(cabinet, pixel) ? null : elsewhereWarning(pixel, cabinet);
  };
  const patchFb = (change: Partial<FacebookSettings>): void => setForm(f => (f === null ? f : { ...f, facebook: { ...f.facebook, ...change } }));

  const set = data?.sets.find(s => setValue(s.termGroup.id, s.article.id) === chosen) ?? null;
  const pair = set !== null ? { termGroupId: set.termGroup.id, postId: set.article.id }
    : chosen === NEW_SET && newGroup !== null && newPost !== null ? { termGroupId: newGroup, postId: newPost } : null;
  // The form's own budget, bid, pixel and identity are where rows start from; what goes is the rows'.
  const { budget: _budget, bid: _bid, pixel: _pixel, page: _page, ...shared } = form ?? { budget: 0, bid: 0, pixel: null, page: null };
  const full: LaunchForm | null = form === null || pair === null ? null : { ...(shared as Omit<FormDefaults, 'budget' | 'bid' | 'pixel' | 'page'>), ...pair, campaigns: pending.map(campaignOf) };

  const missing = useMemo(() => {
    const out: string[] = [];
    if (full === null) return ['сет'];
    if (full.campaigns.length === 0 || full.campaigns.some(c => c.account === null)) out.push('кабінет');
    if (full.countries.length === 0) out.push('країну');
    if (full.campaigns.some(c => c.pixel === null)) out.push('піксель');
    if (full.source === 'facebook' && full.campaigns.some(c => c.page === null)) out.push('FP');
    if (full.campaigns.some(c => !(c.budget > 0) || (capped && !(c.bid > 0)))) out.push(capped ? 'бюджет і бід' : 'бюджет');
    return out;
  }, [full, capped]);
  const warnings = full === null ? [] : [
    ...campaignWarnings(full.campaigns, capped),
    ...full.campaigns.flatMap((c, i) => { const w = pixelElsewhere(c); return w === null ? [] : [full.campaigns.length === 1 ? w : `кампанія ${i + 1}: ${w}`]; }),
  ];
  /** An image whose proportion is unusual for the source, said under it. */
  const ratioOf = (d: DiskFile): string | null => (d.width === undefined || d.height === undefined || form === null ? null : ratioWarning(d.width, d.height, form.source));

  const patch = (change: Partial<FormDefaults>): void => setForm(f => (f === null ? f : { ...f, ...change }));

  const go = (): void => {
    setConfirming(false);
    if (full === null || topicId === null) return;
    sent.current = pending.map(r => r.key);
    const names = new Set(ticked.map(r => r.name));
    const photos = new Set(ticked.map(r => r.photoId));
    const launch = (plan: ReturnType<typeof planBatch> | null, from: Project): void => run.start({
      plan, duration: from.duration, fitToVoice: from.fitToVoice, topicId, form: full, adScripts,
      disk: disk.map(d => ({ id: d.id, name: d.name, size: d.size, kind: d.kind, script: d.kind === 'image' ? '' : d.script })),
      sources: from.photos.filter(p => photos.has(p.id)).map(p => ({ name: p.name, image: p.image })),
    });
    // Only files from disk: nothing to translate or render.
    if (names.size === 0) {
      launch(null, project);
      return;
    }
    void translator.beforeExport({ fillEmpty }).then(translated => {
      if (translated === null) return;
      launch(keepItems(planBatch(translated), names), translated);
    }).catch(() => undefined);
  };

  const busy = run.running || translator.busy || adBusy;
  const listening = disk.some(d => d.words === 'busy');
  const canLaunch = !busy && staging.length === 0 && !listening && data?.missing == null && missing.length === 0 && total > 0;
  const name = (list: { id: string; name?: string; title?: string }[] | undefined, id: string | null): string =>
    id === null ? '—' : list?.find(x => x.id === id)?.name ?? list?.find(x => x.id === id)?.title ?? id;
  const countryName = (code: string): string => (code.toLowerCase() === 'all' ? 'All' : data?.countries.find(c => c.code === code)?.name ?? code);
  const geo = (codes: readonly string[]): string => (codes.length === 0 ? '—' : codes.map(countryName).join(', '));
  const pageName = (id: string | null): string => (id === null ? (onFacebook ? '—' : 'default') : name(data?.pages, id));
  const accountName = (id: string | null): string => (id === null ? '—' : name(data?.accounts, id));
  const budgets = full?.campaigns.reduce((sum, c) => sum + c.budget, 0) ?? 0;
  // A topic the search box names exactly is the topic; anything else is still being typed.
  const pickTopic = (text: string): void => {
    setTopicQuery(text);
    const hit = topics?.find(t => topicLabel(t, topics) === text.trim());
    if (hit === undefined || hit.id === topicId) return;
    setTopicId(hit.id);
    setChosen('');
  };

  return (
    <>
      <div className="group">
        <div className="lab">Джерело</div>
        <select value={source} disabled={busy} onChange={e => setSource(e.target.value)}>
          {source === '' ? <option value="">за замовчуванням команди</option> : null}
          <option value="tiktok">TikTok</option>
          <option value="facebook">Facebook</option>
        </select>
      </div>

      <div className="group">
        <div className="lab">Топік</div>
        <input
          type="search" list="launch-topics" value={topicQuery} disabled={busy}
          placeholder={topics === null ? 'Читаю топіки…' : 'почніть вводити назву топіка'}
          onChange={e => pickTopic(e.target.value)}
        />
        <datalist id="launch-topics">
          {topics?.map(t => <option key={t.id} value={topicLabel(t, topics)} />)}
        </datalist>
        {topicsNote !== '' ? <div className="error">{topicsNote}</div> : null}
        {reading ? <div className="note">Читаю топік з платформи…</div> : null}
        {topicId !== null && !reading ? (
          <button type="button" className="link launch-refresh" disabled={busy} title="Прочитати топік з платформи ще раз — якщо щось змінили в адмінці"
            onClick={() => { loadTopics(); setRefresh(n => n + 1); }}>
            ↻ Оновити з платформи
          </button>
        ) : null}
        {dataNote !== '' ? <div className="error">{dataNote}</div> : null}
        {data?.missing != null ? <div className="warn">{data.missing} або через Claude.</div> : null}
      </div>

      {data === null || data.missing != null ? null : (
        <div className="group">
          <div className="lab">Сет<span className="val">термгрупа + стаття</span></div>
          <select value={chosen} disabled={busy} onChange={e => setChosen(e.target.value)}>
            <option value="" disabled>— оберіть сет —</option>
            {data.sets.map(s => (
              <option key={setValue(s.termGroup.id, s.article.id)} value={setValue(s.termGroup.id, s.article.id)}>
                {s.termGroup.name} + {s.article.title} · {s.campaigns}
              </option>
            ))}
            <option value={NEW_SET}>+ Новий сет</option>
          </select>
          {chosen !== NEW_SET ? null : (
            <div className="launch-new-set">
              <select value={newGroup ?? ''} disabled={busy} onChange={e => setNewGroup(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="" disabled>— термгрупа —</option>
                {data.termGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select value={newPost ?? ''} disabled={busy} onChange={e => setNewPost(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="" disabled>— стаття —</option>
                {data.articles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {data === null || form === null ? null : (
        <>
          <div className="group">
            <div className="lab">Кампанії<span className="val">{rows.length > 1 ? `${rows.length} · по кабінету й біду на кожну` : 'кабінет, бюджет, бід'}</span></div>
            {rows.map((row, i) => (
              <div className={'launch-campaign' + (row.made ? ' made' : '')} key={row.key}>
                <div className="launch-campaign-row">
                  <span className="launch-campaign-n">{i + 1}</span>
                  <select className={row.account === null ? 'launch-needed' : ''} value={row.account ?? ''} disabled={busy || row.made}
                    onChange={e => { const account = e.target.value === '' ? null : e.target.value; patchRow(row.key, r => fit({ ...r, account }, form, plainPage)); }}>
                    <option value="">— кабінет —</option>
                    {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <label>$<input type="text" inputMode="decimal" title="Бюджет на день" value={String(row.budget)} disabled={busy || row.made}
                    onChange={e => patchRow(row.key, r => ({ ...r, budget: typed(e.target.value) }))} /></label>
                  {capped ? (
                    <label>бід<input type="text" inputMode="decimal" value={String(row.bid)} disabled={busy || row.made}
                      onChange={e => patchRow(row.key, r => ({ ...r, bid: typed(e.target.value) }))} /></label>
                  ) : null}
                  <button type="button" className="link" title={capped ? 'Ще кампанія в цьому кабінеті, бід на крок вище' : 'Ще кампанія в цьому кабінеті'} disabled={busy || row.account === null}
                    onClick={() => addRow(row.account)}>+</button>
                  <button type="button" className="link" title="Прибрати кампанію" disabled={busy}
                    onClick={() => setRows(list => list.filter(r => r.key !== row.key))}>✕</button>
                </div>
                <div className="launch-campaign-note">
                  {row.made ? '✓ створено — повторно не піде' : rowNeeds(row) !== null ? <span className="warn">{rowNeeds(row)}</span> : row.pixel === null
                    ? <span className="warn">у бізнесі кабінету немає пікселя «{name(data.pixels, form.pixel)}» — оберіть інший піксель або приберіть кампанію</span>
                    : <>піксель {name(data.pixels, row.pixel)} · {row.pixel} · FP {pageName(row.page)}</>}
                  {rowFailure(row.key) === undefined ? null : <div className="error">✕ не створено: {rowFailure(row.key)}</div>}
                </div>
              </div>
            ))}
            <div className="row launch-ladder">
              <button type="button" className="launch-add" disabled={busy} onClick={() => addRow(null)}>+ кабінет</button>
              {capped ? <label>крок біда<input type="text" inputMode="decimal" value={step} disabled={busy} onChange={e => setStep(e.target.value)} /></label> : null}
            </div>
            {onFacebook ? (
              <label className="launch-fb-field">Стратегія
                <select value={form.facebook.bid_strategy} disabled={busy} onChange={e => patchFb({ bid_strategy: e.target.value as FacebookSettings['bid_strategy'] })}>
                  {STRATEGIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            ) : null}
            {warnings.map(w => <div className="warn" key={w}>{w}</div>)}
          </div>
          <div className="group">
            <div className="lab">Країни<span className="val">{form.countries.length > 1 ? 'мультигео' : ''}</span></div>
            {form.countries.length === 0 ? null : (
              <div className="launch-chips">
                {form.countries.map(code => (
                  <span className="launch-chip" key={code}>
                    {countryName(code)}
                    <button type="button" className="link" title="Прибрати країну" disabled={busy}
                      onClick={() => patch({ countries: form.countries.filter(c => c !== code) })}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <select value="" disabled={busy} onChange={e => {
              const code = e.target.value;
              if (code === '') return;
              // All is every country: it replaces the list, and a country after it replaces All.
              patch({ countries: code === 'All' ? ['All'] : [...form.countries.filter(c => c !== 'All' && c !== code), code] });
            }}>
              <option value="">{form.countries.length === 0 ? '— оберіть країну —' : '+ ще країна'}</option>
              <option value="All">All — усі країни</option>
              {data.countries.filter(c => !form.countries.includes(c.code)).map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          {onFacebook ? (
            <div className="group launch-start">
              <div className="lab">Старт<span className="val">за часом акаунта</span></div>
              <label className="check">
                <input type="radio" name="launch-start" checked={form.facebook.launch_time === null} disabled={busy} onChange={() => patchFb({ launch_time: null })} />
                Одразу
              </label>
              <label className="check">
                <input type="radio" name="launch-start" checked={form.facebook.launch_time !== null} disabled={busy}
                  onChange={() => patchFb({ launch_time: form.facebook.launch_time ?? '00:00' })} />
                Завтра о
                <input type="time" value={form.facebook.launch_time ?? '00:00'} disabled={busy || form.facebook.launch_time === null}
                  onChange={e => patchFb({ launch_time: e.target.value === '' ? '00:00' : e.target.value })} />
              </label>
            </div>
          ) : (
            <div className="group">
              <label className="check launch-tomorrow">
                <input type="checkbox" checked={form.launch_tomorrow} disabled={busy} onChange={e => patch({ launch_tomorrow: e.target.checked })} />
                Launch tomorrow
              </label>
            </div>
          )}
          <div className="group">
            <div className="lab">Піксель<span className="val">{onFacebook ? 'кожна кампанія — рядок свого кабінету' : 'кожна кампанія — однойменний свого бізнесу'}</span></div>
            <select className={form.pixel === null ? 'launch-needed' : ''} value={choiceOf(data.pixels, data.source, form.pixel) ?? ''} disabled={busy}
              onChange={e => pickShared({ pixel: e.target.value === '' ? null : e.target.value })}>
              <option value="">— оберіть піксель —</option>
              {pixelChoices(data.pixels, data.source).map(p => <option key={p.id} value={p.id}>{p.name} · {onFacebook && (p.pixel ?? '') !== '' ? p.pixel : p.id}</option>)}
            </select>
            {form.pixel === null ? <div className="warn">Пікселя немає — оберіть його самі.</div> : null}
          </div>

          {onFacebook ? (
            <div className="group launch-texts">
              <label>Headline<input type="text" value={form.headline} disabled={busy} onChange={e => patch({ headline: e.target.value })} /></label>
              <label>Primary text
                <textarea rows={3} value={form.primary_text} disabled={busy} placeholder="основний текст оголошення — його видно найбільше"
                  onChange={e => patch({ primary_text: e.target.value })} />
              </label>
              <div className="note">Primary text модерують Facebook і review bot платформи — перевірте його за правилами CMP-* (попросіть Claude: «перевір на комплаєнс»).</div>
            </div>
          ) : null}

          <div className="group launch-rest">
            <div className="lab">Решта</div>
            {!editing ? (
              <div className="launch-compact">
                {onFacebook ? (
                  <>
                    Facebook · FP {pageName(form.page)} · language {form.language} · RSOC {form.rsoc_count} · тема {name(data.themes, form.theme)} ·
                    ротація {form.keyword_rotation ? 'on' : 'off'} · {label(GOALS, form.facebook.performance_goal)} · {label(PLACEMENT_NAMES, form.facebook.placements)} ·
                    вік {ageName(form.facebook.age_from)}–{ageName(form.facebook.age_to)} · стать {form.gender} · атрибуція 7-1-1 ·
                    {form.end_date === null ? ' без end date' : ` end date ${form.end_date}`} · розклад: завжди
                  </>
                ) : (
                  <>
                    TikTok · FP {plainPage ? 'default' : form.page === null ? (data.identity || 'default') : pageName(form.page)} · language {form.language} · RSOC {form.rsoc_count} ·
                    тема {name(data.themes, form.theme)} · headline «{form.headline}» · ротація {form.keyword_rotation ? 'on' : 'off'} ·
                    вік {listText(form.age)} · стать {form.gender} · пристрої {listText(form.devices)} · ОС {listText(form.os)} ·
                    {form.end_date === null ? ' без end date' : ` end date ${form.end_date}`} · розклад: завжди
                  </>
                )}
                {handWritten.length === 0 ? null : <> · ad_script вручну: {handWritten.map(id => FLAGS[id]).join(' ')}</>}
              </div>
            ) : (
              <div className="launch-edit">
                <label>Language<input type="text" value={form.language} disabled={busy} onChange={e => patch({ language: e.target.value })} /></label>
                <label>RSOC
                  <select value={form.rsoc_count} disabled={busy} onChange={e => patch({ rsoc_count: Number(e.target.value) })}>
                    {data.rsocCounts.includes(form.rsoc_count) ? null : <option value={form.rsoc_count}>{form.rsoc_count}</option>}
                    {data.rsocCounts.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label>{onFacebook ? 'FP (сторінка) — кожна кампанія бере сторінку свого бізнесу' : 'FP (identity) — кожна кампанія бере FP свого бізнесу'}
                  <select value={form.page ?? ''} disabled={busy} onChange={e => { const page = e.target.value === '' ? null : e.target.value; pickShared({ page }, page === null && !onFacebook); }}>
                    <option value="">{onFacebook ? '— оберіть сторінку —' : 'default'}</option>
                    {data.pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label>Тема
                  <select value={form.theme} disabled={busy} onChange={e => patch({ theme: e.target.value })}>
                    {data.themes.some(t => t.id === form.theme) ? null : <option value={form.theme}>{form.theme}</option>}
                    {data.themes.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </label>
                {onFacebook ? null : <label>Headline<input type="text" value={form.headline} disabled={busy} onChange={e => patch({ headline: e.target.value })} /></label>}
                <label className="check"><input type="checkbox" checked={form.keyword_rotation} disabled={busy} onChange={e => patch({ keyword_rotation: e.target.checked })} />Ротація ключів</label>
                {onFacebook ? (
                  <>
                    <label>Ціль
                      <select value={form.facebook.performance_goal} disabled={busy} onChange={e => patchFb({ performance_goal: e.target.value as FacebookSettings['performance_goal'] })}>
                        {GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                    <label>Плейсменти
                      <select value={form.facebook.placements} disabled={busy} onChange={e => patchFb({ placements: e.target.value as FacebookSettings['placements'] })}>
                        {PLACEMENT_NAMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                    <label>Вік від
                      <select value={form.facebook.age_from} disabled={busy} onChange={e => patchFb({ age_from: Number(e.target.value) })}>
                        {AGES.filter(a => a <= form.facebook.age_to).map(a => <option key={a} value={a}>{ageName(a)}</option>)}
                      </select>
                    </label>
                    <label>Вік до
                      <select value={form.facebook.age_to} disabled={busy} onChange={e => patchFb({ age_to: Number(e.target.value) })}>
                        {AGES.filter(a => a >= form.facebook.age_from).map(a => <option key={a} value={a}>{ageName(a)}</option>)}
                      </select>
                    </label>
                  </>
                ) : <label>Вік<input type="text" value={listText(form.age)} disabled={busy} onChange={e => patch({ age: textList(e.target.value) })} /></label>}
                <label>Стать
                  <select value={form.gender} disabled={busy} onChange={e => patch({ gender: e.target.value })}>
                    {['All', 'Male', 'Female'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
                {onFacebook ? null : (
                  <>
                    <label>Пристрої<input type="text" value={listText(form.devices)} disabled={busy} onChange={e => patch({ devices: textList(e.target.value) })} /></label>
                    <label>ОС<input type="text" value={listText(form.os)} disabled={busy} onChange={e => patch({ os: textList(e.target.value) })} /></label>
                  </>
                )}
                <label>End date<input type="text" placeholder="без end date" value={form.end_date ?? ''} disabled={busy} onChange={e => patch({ end_date: e.target.value.trim() === '' ? null : e.target.value.trim() })} /></label>
                {going.length === 0 ? null : (
                  <div className="launch-ad-scripts">
                    <div className="lab">ad_script<span className="val">текст креативу в Creative Repository</span></div>
                    {going.map(id => (
                      <div className="launch-ad-script" key={id}>
                        <label><span>{FLAGS[id]} {LOCALE_NAMES[id]}{adScripts[id] === undefined ? ' · як в озвучці' : ' · змінено вручну'}</span>
                          <textarea className="launch-script" rows={3} value={adScript(id)} disabled={busy}
                            placeholder={voiceScript(id).trim() === '' ? 'скрипту немає — перекладеться з іншої мови при заливі, або впишіть свій' : ''}
                            onChange={e => setAdScripts(a => ({ ...a, [id]: e.target.value }))} />
                        </label>
                        <div className="row">
                          {adScripts[id] === undefined ? null : (
                            <button type="button" className="link" disabled={busy} title="Повернути скрипт озвучки"
                              onClick={() => setAdScripts(a => { const { [id]: _gone, ...rest } = a; return rest; })}>↺ як в озвучці</button>
                          )}
                          {going.length > 1 ? (
                            <button type="button" className="link" disabled={busy || adScript(id).trim() === ''}
                              title="Перекласти цей текст на решту мов заливу — їхні поля стануть вашими" onClick={() => translateAd(id)}>перекласти на всі мови</button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {adNote !== '' ? <div className={adBusy ? 'note' : 'error'}>{adNote}</div> : null}
                    <div className="note">Озвучка й проєкт не змінюються. Поле, якого не торкались, повторює скрипт озвучки.</div>
                  </div>
                )}
                <div className="note">Правки діють лише на цей залив; наступний сет почнеться з командних значень.</div>
              </div>
            )}
            <button type="button" className="wide launch-edit-toggle" disabled={busy} onClick={() => setEditing(v => !v)}>
              {editing ? 'Згорнути' : 'Редагувати решту полів'}
            </button>
          </div>
        </>
      )}

      <div
        className={'group launch-creatives' + (dropping ? ' dropping' : '')}
        onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDropping(true); }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
        onDragLeave={e => { e.stopPropagation(); if (e.currentTarget === e.target) setDropping(false); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDropping(false); if (!busy) addFiles(e.dataTransfer.files); }}
      >
        <div className="lab">Креативи<span className="val">{total} у кампанію</span></div>
        {renders.map(r => (
          <label className="check" key={r.name}>
            <input
              type="checkbox" checked={!off.has(r.name)} disabled={busy}
              onChange={e => setOff(o => { const next = new Set(o); if (e.target.checked) next.delete(r.name); else next.add(r.name); return next; })}
            />
            {FLAGS[r.locale]} {r.name}
          </label>
        ))}
        {disk.map(d => (
          <div className="launch-disk" key={d.id}>
            <div className="launch-file">
              {d.preview === undefined ? null : <img className="launch-thumb" src={d.preview} alt="" />}
              <span>{d.kind === 'image' ? '🖼' : '💾'} {d.name} <span className="muted">· {mb(d.size)} МБ{d.width === undefined ? '' : ` · ${d.width}×${d.height}`}</span></span>
              <button type="button" className="link" title="Прибрати з кампанії" disabled={busy}
                onClick={() => { known.current.delete(d.id); if (d.preview !== undefined) URL.revokeObjectURL(d.preview); setDisk(list => list.filter(x => x.id !== d.id)); }}>✕</button>
            </div>
            {d.kind === 'image' ? (
              <>
                {ratioOf(d) === null ? null : <div className="warn">{ratioOf(d)}</div>}
                {d.note === '' ? null : <div className="warn">{d.note}</div>}
              </>
            ) : d.words === 'busy' ? <div className="note">Розпізнаю текст…</div> : (
              <>
                <textarea
                  className="launch-script" rows={3} value={d.script} disabled={busy} placeholder="Текст креативу (ad_script)"
                  onChange={e => setDisk(list => list.map(x => (x.id === d.id ? { ...x, script: e.target.value } : x)))}
                />
                {d.words === 'failed' ? <div className="warn">Текст не розпізнався — впишіть самі. {d.note}</div> : null}
              </>
            )}
          </div>
        ))}
        {staging.map((name, i) => <div className="note" key={name + i}>Беру {name}…</div>)}
        <FilePicker className="wide launch-add" accept="video/mp4,.mp4,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onPick={addFiles}>+ файли з диска</FilePicker>
        <div className="note">
          або перетягніть сюди mp4 чи картинки (jpg, png, webp). Текст кожного відео розпізнається сам — перевірте його; картинка йде як є, без кропу й тексту.
          Кожен креатив — окреме оголошення. Мови в одній кампанії можуть бути різні.
        </div>
        {form?.source === 'tiktok' && diskImages > 0 ? <div className="warn">{TIKTOK_IMAGE_WARNING}</div> : null}
        {diskNote !== '' ? <div className="error">{diskNote}</div> : null}
      </div>

      <div className="group">
        <button className="primary" disabled={!canLaunch} onClick={() => {
          setFillEmpty(true);
          setConfirming(true);
        }}
          title={missing.length > 0 ? `Оберіть ${missing.join(', ')}` : ''}>
          Залити
        </button>
        {data !== null && form !== null && missing.length > 0 ? <div className="note">Щоб залити, оберіть {missing.join(', ')}.</div> : null}
        {total === 0 ? <div className="note">Відмітьте хоча б один рендер або додайте mp4 чи картинку з диска.</div> : null}
        {listening ? <div className="note">Чекаю, поки розпізнається текст креативів з диска.</div> : null}
        {translator.busy || translator.failed ? <div className={translator.failed ? 'error' : 'note'}>{translator.note}</div> : null}
      </div>

      <Progress run={run} onRetry={go} />

      {!confirming || full === null || data === null ? null : (
        <div className="modal-back" onClick={() => setConfirming(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h3>{full.campaigns.length === 1 ? 'Залити нову кампанію?' : `Залити ${full.campaigns.length} нові кампанії?`}</h3>
            <dl className="launch-summary">
              <dt>Топік</dt><dd>{data.topic.name}</dd>
              <dt>Сет</dt><dd>{data.termGroups.find(g => g.id === full.termGroupId)?.name} + {data.articles.find(a => a.id === full.postId)?.title}</dd>
              <dt>{full.countries.length > 1 ? 'Країни' : 'Країна'}</dt><dd>{geo(full.countries)}</dd>
              <dt>Старт</dt>
              <dd>{full.source === 'facebook'
                ? `${startText(full).replace(/^старт /, '')}${full.facebook.launch_time === null ? '' : ' за часом акаунта'}`
                : full.launch_tomorrow ? 'завтра' : 'одразу після апруву'}</dd>
              <dt>Креативи</dt>
              <dd>
                {total} · {[...new Set(ticked.map(r => r.locale))].map(l => `${FLAGS[l]} ${LOCALE_NAMES[l]}`).join(', ')}
                {disk.length > 0 ? `${ticked.length > 0 ? ' + ' : ''}з диска: ${creativesCount(disk.length - diskImages, diskImages)}` : ''}
                <div className="muted">кожен креатив — окреме оголошення в кожній кампанії</div>
                {ticked.length > 0 ? <div className="muted">рендер — лише того, що змінилося з останнього рендеру</div> : null}
              </dd>
              {full.source === 'facebook' ? (
                <>
                  <dt>Headline</dt><dd>«{full.headline}»</dd>
                  <dt>Primary text</dt><dd>{full.primary_text.trim() === '' ? <span className="muted">порожній</span> : `«${full.primary_text.trim()}»`}</dd>
                  <dt>Решта</dt>
                  <dd className="launch-compact">
                    Facebook · {label(STRATEGIES, full.facebook.bid_strategy)} · {label(GOALS, full.facebook.performance_goal)} · {label(PLACEMENT_NAMES, full.facebook.placements)} ·
                    вік {ageName(full.facebook.age_from)}–{ageName(full.facebook.age_to)} · стать {full.gender} · атрибуція 7-1-1 · language {full.language} · RSOC {full.rsoc_count} ·
                    тема {name(data.themes, full.theme)} · ротація {full.keyword_rotation ? 'on' : 'off'}{full.end_date === null ? ' · без end date' : ` · end date ${full.end_date}`}
                  </dd>
                </>
              ) : (
                <>
                  <dt>Решта</dt>
                  <dd className="launch-compact">
                    TikTok · language {full.language} · RSOC {full.rsoc_count} · тема {name(data.themes, full.theme)} ·
                    headline «{full.headline}» · ротація {full.keyword_rotation ? 'on' : 'off'} · вік {listText(full.age)} · стать {full.gender} ·
                    пристрої {listText(full.devices)} · ОС {listText(full.os)}{full.end_date === null ? ' · без end date' : ` · end date ${full.end_date}`}
                  </dd>
                </>
              )}
              {handWritten.length === 0 ? null : (
                <>
                  <dt>ad_script</dt>
                  <dd>
                    <div className="muted">змінено вручну — в Creative Repository піде цей текст, не скрипт озвучки</div>
                    {handWritten.map(id => (
                      <div key={id}>{FLAGS[id]} {adScript(id).trim() === '' ? <span className="muted">порожній</span> : `«${adScript(id).trim()}»`}</div>
                    ))}
                  </dd>
                </>
              )}
            </dl>
            {ticked.length === 0 ? null : (() => {
              // Only the languages this launch renders: the summary speaks for what goes up.
              const going = new Set(ticked.map(r => r.locale));
              const shown = { ...voice, lines: voice.lines.filter(l => going.has(l.id)), empty: voice.empty.filter(id => going.has(id)) };
              return (
                <div className="launch-voice">
                  <div className="lab">{project.voiceOn ? 'Озвучка' : 'Скрипти — лише в ad_script, озвучку вимкнено'}</div>
                  <VoiceLines check={shown} fillEmpty={fillEmpty} onFillEmpty={setFillEmpty} />
                </div>
              );
            })()}
            <table className="launch-campaigns">
              <thead><tr><th>#</th><th>Кабінет</th><th>Піксель</th><th>FP</th><th>Бюджет</th>{capped ? <th>Бід</th> : null}</tr></thead>
              <tbody>
                {full.campaigns.map((c, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td><td>{accountName(c.account)}</td><td>{name(data.pixels, c.pixel)} · {c.pixel}</td>
                    <td>{pageName(c.page)}</td><td>${c.budget}</td>{capped ? <td>{c.bid}</td> : null}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={4}>{full.campaigns.length === 1 ? '1 кампанія' : `${full.campaigns.length} кампаній`}, разом</td><td colSpan={capped ? 2 : 1}>${Math.round(budgets * 100) / 100}/день</td></tr></tfoot>
            </table>
            {warnings.map(w => <div className="warn" key={w}>{w}</div>)}
            {full.source === 'facebook' ? (
              <>
                <div className="warn">Перевірте primary text за правилами CMP-* перед підтвердженням — його модерують Facebook і review bot платформи; Claude перевірить скілом compliance.</div>
                <div className="note">{uncheckedOnFacebook(full.facebook, false)}. Перший FB-залив — один топік, один кабінет, «Завтра о 00:00».</div>
              </>
            ) : diskImages > 0 ? <div className="warn">{TIKTOK_IMAGE_WARNING}</div> : null}
            {rows.some(r => r.made) ? <div className="note">Кампанії, уже створені минулим заливом, повторно не підуть.</div> : null}
            <div className="modal-actions">
              <button onClick={() => setConfirming(false)}>Скасувати</button>
              <button className="primary" onClick={go}>Підтвердити</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The team's theme as the platform's id, when a theme's key or title answers to it. */
function themeId(data: LaunchTopic, wanted: string): string {
  const fold = wanted.trim().toLowerCase();
  const found = data.themes.find(t => t.id === wanted) ?? data.themes.find(t => t.title.toLowerCase() === fold)
    ?? data.themes.find(t => t.title.toLowerCase().includes(fold));
  return found?.id ?? wanted;
}

/** The render, a line per language with how far along it is; then every line of the launch with where it stands, and the new campaign. */
function Progress({ run, onRetry }: { run: ReturnType<typeof useLaunch>; onRetry: () => void }) {
  // The server names its steps only once it has read the topic and matched the files against what the
  // platform holds — on a big topic, with files from disk, that is a while. Until then the wait is a step
  // of its own, ticking, so a press that is working does not look like one that did nothing.
  const preparing = run.phase === 'launch' && run.lines.length === 0;
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (!preparing) return;
    const since = Date.now();
    setWaited(0);
    const timer = setInterval(() => setWaited(Math.floor((Date.now() - since) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [preparing]);
  // A launch starts from the foot of a long form: bring its progress into view rather than leave it below.
  const box = useRef<HTMLDivElement>(null);
  const started = run.phase === 'render' || run.phase === 'launch';
  useEffect(() => {
    if (started) box.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [started]);

  if (run.phase === 'idle') return null;
  const render = run.render;
  const launch = run.launch;
  const failed = launch?.errors[0];
  const errorOf = (label: string) => launch?.errors.find(e => e.name === label);
  const locales = [...new Set(run.rendering.map(r => r.locale))];
  /** How far one language's files are, 0 to 1: a finished file is whole, one in flight is its frames. */
  const share = (locale: LocaleId): number => {
    const files = run.rendering.filter(r => r.locale === locale);
    const parts = files.map(f => (render?.finished.includes(f.name) ? 1 : render?.progress[f.name] ? render.progress[f.name]!.done / render.progress[f.name]!.total : 0));
    return files.length === 0 ? 0 : parts.reduce((a, b) => a + b, 0) / files.length;
  };
  return (
    <div className="group export-progress" ref={box}>
      {render === null && run.phase !== 'render' ? null : (
        <>
          <div className="lab">Рендер<span className="val">{render?.done ?? 0} / {render?.total ?? run.rendering.length}</span></div>
          <ul className="launch-steps">
            {locales.map(locale => {
              const pct = Math.round(share(locale) * 100);
              const lost = run.rendering.some(r => r.locale === locale && render?.errors.some(e => e.name === r.name));
              return (
                <li key={locale} className={lost ? 'failed' : pct === 100 ? 'done' : pct > 0 ? 'active' : ''}>
                  <span className="step-mark">{lost ? '✕' : pct === 100 ? '✓' : pct > 0 ? '…' : '·'}</span>
                  {FLAGS[locale]} {LOCALE_NAMES[locale]} — {pct}%
                </li>
              );
            })}
          </ul>
        </>
      )}
      {!preparing ? null : (
        <ul className="launch-steps">
          <li className="active">
            <span className="step-mark">…</span>
            Готую залив: читаю топік з платформи, звіряю файли з уже залитими
            <span className="muted">{waited} с</span>
          </li>
        </ul>
      )}
      {run.lines.length === 0 ? null : (
        <ul className="launch-steps">
          {run.lines.map(line => {
            const done = line.reused || (launch?.finished.includes(line.label) ?? false);
            const lost = errorOf(line.label) !== undefined;
            const active = !done && !lost && launch?.state === 'running' && launch.current === line.label;
            const bytes = launch?.progress[line.label];
            return (
              <li key={line.label} className={done ? 'done' : lost ? 'failed' : active ? 'active' : ''}>
                <span className="step-mark">{done ? '✓' : lost ? '✕' : active ? '…' : '·'}</span>
                {line.label}
                {active && bytes !== undefined ? <span className="muted">{mb(bytes.done)} / {mb(bytes.total)} МБ · {Math.round((bytes.done / bytes.total) * 100)}%</span> : null}
                {lost ? <div className="error">{errorOf(line.label)!.message}</div> : null}
              </li>
            );
          })}
        </ul>
      )}
      {run.warnings.map(w => <div className="warn" key={w}>{w}</div>)}
      {launch?.result == null ? null : (
        <div className="note launch-result">
          {launch.result.label} · <a href={launch.result.url} target="_blank" rel="noreferrer">відкрити на платформі</a>
        </div>
      )}
      {run.phase === 'failed' ? (
        <>
          {failed === undefined ? <div className="error">{run.error}</div> : null}
          <button className="wide" style={{ marginTop: 8 }} onClick={onRetry}>
            {launch?.result == null ? 'Спробувати ще' : 'Спробувати ще — лише те, що не створилося'}
          </button>
        </>
      ) : null}
    </div>
  );
}
