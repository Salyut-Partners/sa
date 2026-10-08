import { useEffect, useMemo, useRef, useState } from 'react';
import { batchNames, keepItems, planBatch } from '../core/batch.ts';
import { LOCALE_NAMES } from '../core/locales.ts';
import { FLAGS } from '../core/phrasebook.ts';
import { forCabinet, type FormDefaults, type LaunchForm } from '../core/quick-launch.ts';
import type { LocaleId, Project } from '../core/types.ts';
import { FilePicker } from './FilePicker.tsx';
import { useLaunch } from './launch.ts';
import { fetchLaunchTopic, fetchLaunchTopics, stageLaunchFile, transcribeLaunchFile, type LaunchTopic, type StagedFile } from './server.ts';
import type { Translator } from './translate.ts';

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

/** A designer's file in the form, with the words it speaks: transcribed when added, then the buyer's to read over. */
interface DiskFile extends StagedFile {
  script: string;
  /** `busy` while Whisper listens; `failed` leaves the script for the buyer to type. */
  words: 'busy' | 'done' | 'failed';
  note: string;
}

/** A list typed as one line: `All`, or `18-24, 25-34`. */
const listText = (list: readonly string[]): string => list.join(', ');
const textList = (text: string): string[] => text.split(',').map(s => s.trim()).filter(s => s !== '');

/**
 * The launch: a topic off the platform, a set — a term group and an article —
 * and the fields, filled from the set's latest campaign; one press, a modal to
 * read it all again, and a new campaign. Nothing is kept anywhere: the next
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

  const addFiles = (list: FileList | null): void => {
    const files = Array.from(list ?? []);
    const wrong = files.filter(f => !/\.mp4$/i.test(f.name));
    setDiskNote(wrong.length === 0 ? '' : `Не mp4, пропущено: ${wrong.map(f => f.name).join(', ')}`);
    for (const file of files.filter(f => /\.mp4$/i.test(f.name))) {
      setStaging(s => [...s, file.name]);
      stageLaunchFile(file)
        .then(staged => {
          // The same file dropped twice is in the form once, and listened to once.
          if (known.current.has(staged.id)) return;
          known.current.add(staged.id);
          setDisk(d => [...d, { ...staged, script: '', words: 'busy', note: '' }]);
          const patchFile = (change: Partial<DiskFile>): void => setDisk(d => d.map(x => (x.id === staged.id ? { ...x, ...change } : x)));
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
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

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

  // A new topic, a new source or a new set starts the form from that set's defaults.
  useEffect(() => {
    if (data === null) { setForm(null); return; }
    const set = data.sets.find(s => setValue(s.termGroup.id, s.article.id) === chosen);
    const defaults = set?.defaults ?? (chosen === NEW_SET ? data.newSet : null);
    setForm(defaults === null ? null : { ...defaults, source: data.source, theme: themeId(data, defaults.theme) });
  }, [data, chosen]);

  // A launch made a campaign: what this session read of the topic is behind the platform now — read it
  // again next time it is opened. The form on screen stays, so a second country is one select and one press.
  useEffect(() => {
    if (run.phase !== 'done' || topicId === null) return;
    for (const key of [...topicCache.keys()]) if (key.startsWith(`${topicId}|`)) topicCache.delete(key);
  }, [run.phase, topicId]);

  /** The cabinet, and with it the pixel and identity of its business. */
  const pickAccount = (account: string | null): void => {
    if (data === null) return;
    setForm(f => (f === null ? f : { ...f, account, ...forCabinet(f, account, data, data.identity) }));
  };
  const business = data?.accounts.find(a => a.id === form?.account)?.business ?? '';
  /** The pixels and identities the picked cabinet sees: its business's, or every one before a cabinet is picked. */
  const ownBusiness = <T extends { business: string }>(list: readonly T[]): T[] =>
    business === '' ? [...list] : list.filter(x => x.business === '' || x.business === business);

  const set = data?.sets.find(s => setValue(s.termGroup.id, s.article.id) === chosen) ?? null;
  const pair = set !== null ? { termGroupId: set.termGroup.id, postId: set.article.id }
    : chosen === NEW_SET && newGroup !== null && newPost !== null ? { termGroupId: newGroup, postId: newPost } : null;
  const full: LaunchForm | null = form === null || pair === null ? null : { ...form, ...pair };

  const missing = useMemo(() => {
    const out: string[] = [];
    if (full === null) return ['сет'];
    if (full.account === null) out.push('кабінет');
    if (full.countries.length === 0) out.push('країну');
    if (full.pixel === null) out.push('піксель');
    return out;
  }, [full]);

  const patch = (change: Partial<FormDefaults>): void => setForm(f => (f === null ? f : { ...f, ...change }));

  const go = (): void => {
    setConfirming(false);
    if (full === null || topicId === null) return;
    const names = new Set(ticked.map(r => r.name));
    const photos = new Set(ticked.map(r => r.photoId));
    const launch = (plan: ReturnType<typeof planBatch> | null, from: Project): void => run.start({
      plan, duration: from.duration, fitToVoice: from.fitToVoice, topicId, form: full, disk: disk.map(d => ({ id: d.id, name: d.name, size: d.size, script: d.script })),
      sources: from.photos.filter(p => photos.has(p.id)).map(p => ({ name: p.name, image: p.image })),
    });
    // Only files from disk: nothing to translate or render.
    if (names.size === 0) {
      launch(null, project);
      return;
    }
    void translator.beforeExport().then(translated => {
      if (translated === null) return;
      launch(keepItems(planBatch(translated), names), translated);
    }).catch(() => undefined);
  };

  const busy = run.running || translator.busy;
  const listening = disk.some(d => d.words === 'busy');
  const canLaunch = !busy && staging.length === 0 && !listening && data?.missing == null && missing.length === 0 && total > 0;
  const name = (list: { id: string; name?: string; title?: string }[] | undefined, id: string | null): string =>
    id === null ? '—' : list?.find(x => x.id === id)?.name ?? list?.find(x => x.id === id)?.title ?? id;
  const countryName = (code: string): string => (code.toLowerCase() === 'all' ? 'All' : data?.countries.find(c => c.code === code)?.name ?? code);
  const geo = (codes: readonly string[]): string => (codes.length === 0 ? '—' : codes.map(countryName).join(', '));
  const pageName = (id: string | null): string => (id === null ? 'default' : name(data?.pages, id));
  // A topic the search box names exactly is the topic; anything else is still being typed.
  const pickTopic = (text: string): void => {
    setTopicQuery(text);
    const hit = topics?.find(t => topicLabel(t, topics) === text.trim());
    if (hit === undefined || hit.id === topicId) return;
    setTopicId(hit.id);
    setChosen('');
    setSource('');
  };

  return (
    <>
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
            <div className="lab">Кабінет</div>
            <select value={form.account ?? ''} disabled={busy} onChange={e => pickAccount(e.target.value === '' ? null : e.target.value)}>
              <option value="">— оберіть кабінет —</option>
              {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
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
          <div className="group">
            <div className="row launch-money">
              <label>Бюджет<input type="text" inputMode="decimal" value={String(form.budget)} disabled={busy} onChange={e => patch({ budget: Number(e.target.value.replace(',', '.')) })} /></label>
              <label>Бід<input type="text" inputMode="decimal" value={String(form.bid)} disabled={busy} onChange={e => patch({ bid: Number(e.target.value.replace(',', '.')) })} /></label>
              <label className="check launch-tomorrow">
                <input type="checkbox" checked={form.launch_tomorrow} disabled={busy} onChange={e => patch({ launch_tomorrow: e.target.checked })} />
                Launch tomorrow
              </label>
            </div>
          </div>
          <div className="group">
            <div className="lab">Піксель{business === '' ? null : <span className="val">пікселі бізнесу кабінету</span>}</div>
            <select className={form.pixel === null ? 'launch-needed' : ''} value={form.pixel ?? ''} disabled={busy}
              onChange={e => patch({ pixel: e.target.value === '' ? null : e.target.value })}>
              <option value="">— оберіть піксель —</option>
              {form.pixel !== null && !ownBusiness(data.pixels).some(p => p.id === form.pixel)
                ? <option value={form.pixel}>{name(data.pixels, form.pixel)} · інший бізнес</option> : null}
              {ownBusiness(data.pixels).map(p => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}
            </select>
            {form.pixel === null ? <div className="warn">Пікселя немає — оберіть його самі.</div> : null}
          </div>

          <div className="group launch-rest">
            <div className="lab">Решта</div>
            {!editing ? (
              <div className="launch-compact">
                {form.source === 'tiktok' ? 'TikTok' : 'Facebook'} · FP {pageName(form.page)} · language {form.language} · RSOC {form.rsoc_count} ·
                тема {name(data.themes, form.theme)} · headline «{form.headline}» · ротація {form.keyword_rotation ? 'on' : 'off'} ·
                вік {listText(form.age)} · стать {form.gender} · пристрої {listText(form.devices)} · ОС {listText(form.os)} ·
                {form.end_date === null ? ' без end date' : ` end date ${form.end_date}`} · розклад: завжди
              </div>
            ) : (
              <div className="launch-edit">
                <label>Джерело
                  <select value={form.source} disabled={busy} onChange={e => setSource(e.target.value)}>
                    <option value="tiktok">TikTok</option>
                    <option value="facebook">Facebook</option>
                  </select>
                </label>
                <label>Language<input type="text" value={form.language} disabled={busy} onChange={e => patch({ language: e.target.value })} /></label>
                <label>RSOC
                  <select value={form.rsoc_count} disabled={busy} onChange={e => patch({ rsoc_count: Number(e.target.value) })}>
                    {data.rsocCounts.includes(form.rsoc_count) ? null : <option value={form.rsoc_count}>{form.rsoc_count}</option>}
                    {data.rsocCounts.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label>FP (identity)
                  <select value={form.page ?? ''} disabled={busy} onChange={e => patch({ page: e.target.value === '' ? null : e.target.value })}>
                    <option value="">default</option>
                    {form.page !== null && !ownBusiness(data.pages).some(p => p.id === form.page)
                      ? <option value={form.page}>{pageName(form.page)} · інший бізнес</option> : null}
                    {ownBusiness(data.pages).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label>Тема
                  <select value={form.theme} disabled={busy} onChange={e => patch({ theme: e.target.value })}>
                    {data.themes.some(t => t.id === form.theme) ? null : <option value={form.theme}>{form.theme}</option>}
                    {data.themes.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </label>
                <label>Headline<input type="text" value={form.headline} disabled={busy} onChange={e => patch({ headline: e.target.value })} /></label>
                <label className="check"><input type="checkbox" checked={form.keyword_rotation} disabled={busy} onChange={e => patch({ keyword_rotation: e.target.checked })} />Ротація ключів</label>
                <label>Вік<input type="text" value={listText(form.age)} disabled={busy} onChange={e => patch({ age: textList(e.target.value) })} /></label>
                <label>Стать
                  <select value={form.gender} disabled={busy} onChange={e => patch({ gender: e.target.value })}>
                    {['All', 'Male', 'Female'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
                <label>Пристрої<input type="text" value={listText(form.devices)} disabled={busy} onChange={e => patch({ devices: textList(e.target.value) })} /></label>
                <label>ОС<input type="text" value={listText(form.os)} disabled={busy} onChange={e => patch({ os: textList(e.target.value) })} /></label>
                <label>End date<input type="text" placeholder="без end date" value={form.end_date ?? ''} disabled={busy} onChange={e => patch({ end_date: e.target.value.trim() === '' ? null : e.target.value.trim() })} /></label>
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
              <span>💾 {d.name} <span className="muted">· {mb(d.size)} МБ</span></span>
              <button type="button" className="link" title="Прибрати з кампанії" disabled={busy}
                onClick={() => { known.current.delete(d.id); setDisk(list => list.filter(x => x.id !== d.id)); }}>✕</button>
            </div>
            {d.words === 'busy' ? <div className="note">Розпізнаю текст…</div> : (
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
        <FilePicker className="wide launch-add" accept="video/mp4,.mp4" multiple onPick={addFiles}>+ mp4 з диска</FilePicker>
        <div className="note">або перетягніть mp4 сюди — текст кожного розпізнається сам, перевірте його. Мови в одній кампанії можуть бути різні.</div>
        {diskNote !== '' ? <div className="error">{diskNote}</div> : null}
      </div>

      <div className="group">
        <button className="primary" disabled={!canLaunch} onClick={() => setConfirming(true)}
          title={missing.length > 0 ? `Оберіть ${missing.join(', ')}` : ''}>
          Залити
        </button>
        {data !== null && form !== null && missing.length > 0 ? <div className="note">Щоб залити, оберіть {missing.join(', ')}.</div> : null}
        {total === 0 ? <div className="note">Відмітьте хоча б один рендер або додайте mp4 з диска.</div> : null}
        {listening ? <div className="note">Чекаю, поки розпізнається текст креативів з диска.</div> : null}
        {translator.busy || translator.failed ? <div className={translator.failed ? 'error' : 'note'}>{translator.note}</div> : null}
      </div>

      <Progress run={run} onRetry={go} />

      {!confirming || full === null || data === null ? null : (
        <div className="modal-back" onClick={() => setConfirming(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h3>Залити нову кампанію?</h3>
            <dl className="launch-summary">
              <dt>Топік</dt><dd>{data.topic.name}</dd>
              <dt>Сет</dt><dd>{data.termGroups.find(g => g.id === full.termGroupId)?.name} + {data.articles.find(a => a.id === full.postId)?.title}</dd>
              <dt>Кабінет</dt><dd>{name(data.accounts, full.account)}</dd>
              <dt>{full.countries.length > 1 ? 'Країни' : 'Країна'}</dt><dd>{geo(full.countries)}</dd>
              <dt>Бюджет · бід</dt><dd>${full.budget}/день · {full.bid}</dd>
              <dt>Старт</dt><dd>{full.launch_tomorrow ? 'завтра' : 'одразу після апруву'}</dd>
              <dt>Креативи</dt>
              <dd>
                {total} · {[...new Set(ticked.map(r => r.locale))].map(l => `${FLAGS[l]} ${LOCALE_NAMES[l]}`).join(', ')}
                {disk.length > 0 ? `${ticked.length > 0 ? ' + ' : ''}${disk.length} з диска` : ''}
                {ticked.length > 0 ? <div className="muted">рендер — лише того, що змінилося з останнього рендеру</div> : null}
              </dd>
              <dt>Піксель</dt><dd>{name(data.pixels, full.pixel)} · {full.pixel}</dd>
              <dt>FP</dt><dd>{pageName(full.page)}</dd>
              <dt>Решта</dt>
              <dd className="launch-compact">
                {full.source === 'tiktok' ? 'TikTok' : 'Facebook'} · language {full.language} · RSOC {full.rsoc_count} · тема {name(data.themes, full.theme)} ·
                headline «{full.headline}» · ротація {full.keyword_rotation ? 'on' : 'off'} · вік {listText(full.age)} · стать {full.gender} ·
                пристрої {listText(full.devices)} · ОС {listText(full.os)}{full.end_date === null ? ' · без end date' : ` · end date ${full.end_date}`}
              </dd>
            </dl>
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
  if (run.phase === 'idle') return null;
  const render = run.render;
  const launch = run.launch;
  const failed = launch?.errors[0];
  const locales = [...new Set(run.rendering.map(r => r.locale))];
  /** How far one language's files are, 0 to 1: a finished file is whole, one in flight is its frames. */
  const share = (locale: LocaleId): number => {
    const files = run.rendering.filter(r => r.locale === locale);
    const parts = files.map(f => (render?.finished.includes(f.name) ? 1 : render?.progress[f.name] ? render.progress[f.name]!.done / render.progress[f.name]!.total : 0));
    return files.length === 0 ? 0 : parts.reduce((a, b) => a + b, 0) / files.length;
  };
  return (
    <div className="group export-progress">
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
      {run.lines.length === 0 ? null : (
        <ul className="launch-steps">
          {run.lines.map(line => {
            const done = line.reused || (launch?.finished.includes(line.label) ?? false);
            const lost = failed?.name === line.label;
            const active = !done && !lost && launch?.state === 'running' && launch.current === line.label;
            const bytes = launch?.progress[line.label];
            return (
              <li key={line.label} className={done ? 'done' : lost ? 'failed' : active ? 'active' : ''}>
                <span className="step-mark">{done ? '✓' : lost ? '✕' : active ? '…' : '·'}</span>
                {line.label}
                {active && bytes !== undefined ? <span className="muted">{mb(bytes.done)} / {mb(bytes.total)} МБ · {Math.round((bytes.done / bytes.total) * 100)}%</span> : null}
                {lost ? <div className="error">{failed!.message}</div> : null}
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
          <button className="wide" style={{ marginTop: 8 }} onClick={onRetry}>Спробувати ще</button>
        </>
      ) : null}
    </div>
  );
}
