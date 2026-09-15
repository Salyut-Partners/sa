import { useEffect, useState } from 'react';
import { batchSize, planBatch, type BatchPlan } from '../core/batch.ts';
import { LOCALE_NAMES, releaseLocales } from '../core/locales.ts';
import { FLAGS } from '../core/phrasebook.ts';
import {
  defaultLayout, mergeLayout, placementSize, placePlan, rowSummary, selectionTarget, setPhotoTarget, speakers,
  subtitleCount, toggleLocaleTarget, togglePhotoTarget, type CampaignInfo, type ExportLayout,
} from '../core/placement.ts';
import type { Command } from '../core/project.ts';
import type { LocaleId, Project } from '../core/types.ts';
import type { ExportRun } from './export.ts';
import { fetchCampaigns, fetchSubtitles, type BatchOutput, type SubsState } from './server.ts';
import type { TopicBatch } from './topic-batch.ts';

interface Props {
  project: Project;
  dispatch: (command: Command) => void;
  run: ExportRun;
  /** The plan for one creative — the quick check, before committing to a batch. */
  onExportOne: () => BatchPlan | null;
  topic: TopicBatch;
}

/** The style select's value for "no subtitles" — a select cannot hold null. */
const NO_STYLE = ' none';

/**
 * The export, and what it is doing.
 *
 * Two buttons rather than one: checking a single creative and shipping the
 * release are different acts with different costs, and a batch of twelve photos
 * across seven languages is not something to start by accident.
 *
 * With a topic chosen, the files go to its campaign folders — every campaign
 * of the language, ticked by default — and the sources are written under the
 * topic on the way: into the batch this session already has there, or a new
 * one. With none, the export is a download, as it was.
 */
export function ExportPanel({ project, dispatch, run, onExportOne, topic }: Props) {
  // Counted, not planned: the plan is built at the press. See `batchSize`.
  const { photos, locales, total } = batchSize(project);
  const { status } = run;
  const launchKey = topic.launchKey === '' ? null : topic.launchKey;

  const [campaigns, setCampaigns] = useState<CampaignInfo[] | null>(null);
  const [campaignsNote, setCampaignsNote] = useState('');
  useEffect(() => {
    setCampaigns(null);
    if (launchKey === null) return;
    let stale = false;
    fetchCampaigns(launchKey)
      .then(list => { if (!stale) { setCampaigns(list); setCampaignsNote(''); } })
      .catch(e => { if (!stale) { setCampaigns([]); setCampaignsNote((e as Error).message); } });
    return () => { stale = true; };
  }, [launchKey]);

  const release = releaseLocales(project).map(l => l.id);
  const releaseKey = release.join(',');

  // The layout starts from the languages and is the buyer's from then on. A
  // language added later gets its default row; the rows already there are
  // not second-guessed when the campaign list is fetched again.
  const [layout, setLayout] = useState<ExportLayout>({ locales: {}, overrides: {} });
  useEffect(() => {
    if (campaigns === null) return;
    setLayout(current => mergeLayout(current, defaultLayout(project, campaigns), release));
    // The release list is read off the project; its key is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, releaseKey]);

  const selectedAll = project.selection.length === project.photos.length;
  // Counted, not planned, like `batchSize`: this runs on every keystroke.
  const placed = launchKey === null ? null : placementSize(project, layout);

  // What the machine says about subtitles: the styles to offer, and whether a
  // file with its words in hand would come out. Asked once; the answer only
  // changes when someone runs setup.sh, and the export says so again if it did.
  const [subs, setSubs] = useState<SubsState | null>(null);
  const [subsNote, setSubsNote] = useState('');
  useEffect(() => {
    fetchSubtitles().then(setSubs).catch(e => setSubsNote((e as Error).message));
  }, []);
  const burned = subtitleCount(project, launchKey === null ? null : layout);

  /**
   * Start a plan: laid into folders when a topic is chosen, as a download when
   * not. The sources are saved first — the batch has to be in the topic's
   * folder before its creatives are in the topic's campaigns.
   */
  const go = (plan: BatchPlan): void => {
    if (launchKey === null) {
      run.start(plan, project.duration, project.fitToVoice);
      return;
    }
    const laid = placePlan(plan, layout);
    const output: BatchOutput = { launchKey, destinations: laid.destinations };
    topic.ensureSaved(launchKey)
      .then(() => run.start(laid.plan, project.duration, project.fitToVoice, output))
      .catch(() => undefined);
  };

  return (
    <>
      <div className="group">
        <div className="lab">
          Субтитри
          {project.subtitles === null ? null : (
            <span className="val">{burned.burned} з {burned.total} файлів</span>
          )}
        </div>
        <select
          value={project.subtitles ?? NO_STYLE}
          disabled={subs?.styles == null}
          onChange={e => dispatch({
            type: 'project/patch',
            patch: { subtitles: e.target.value === NO_STYLE ? null : e.target.value },
          })}
        >
          <option value={NO_STYLE}>— без субтитрів —</option>
          {subs?.styles?.styles.map(s => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.wordsPerChunk === 1 ? 'по слову' : `${s.wordsPerChunk} слів`}{s.highlight ? '' : ', без підсвітки'}
            </option>
          ))}
          {/* A style the pipeline no longer lists is still shown, so the
              select does not silently read as "none" for a saved batch. */}
          {project.subtitles !== null && !subs?.styles?.styles.some(s => s.id === project.subtitles)
            ? <option value={project.subtitles}>{project.subtitles} · невідомий стиль</option>
            : null}
        </select>
        {subsNote !== '' ? <div className="error">{subsNote}</div> : null}
        {subs !== null && subs.styles === null ? <div className="error">{subs.notes.join(' · ')}</div> : null}
        {project.subtitles === null ? (
          <div className="note">Слова скрипта в кадрі, синхронно з озвучкою — той самий пайплайн, що у вотчера.</div>
        ) : (
          <>
            {release.map(id => {
              const locale = project.locales.find(l => l.id === id);
              return (
                <label className="check" key={id}>
                  <input
                    type="checkbox"
                    checked={locale?.subtitles !== false}
                    onChange={e => dispatch({ type: 'locale/patch', id, patch: { subtitles: e.target.checked } })}
                  />
                  {FLAGS[id]} {LOCALE_NAMES[id]}
                  {locale !== undefined && locale.script.trim() === '' ? <span className="mixed-note"> · без скрипта — чисто</span> : null}
                </label>
              );
            })}
            <div className="note">
              Текст — слово в слово зі скрипта мови, без розпізнавання. Мова без галочки виходить чистою.
            </div>
            {subs !== null && !subs.burnReady ? (
              <div className="warn">
                Субтитри не вшиються на цій машині: {subs.notes.join('; ') || 'запустіть ./setup.sh у корені ~/sa'}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="group">
        <div className="lab">
          Куди
          <span className="val">{launchKey === null ? 'у завантаження' : topic.launches.find(l => l.key === launchKey)?.name ?? launchKey}</span>
        </div>
        <select
          value={topic.launchKey}
          onChange={e => topic.browse(e.target.value)}
          disabled={run.running || topic.busy}
        >
          <option value="">— завантажити файлом —</option>
          {topic.launches.map(l => <option key={l.key} value={l.key}>{l.name}</option>)}
        </select>
        {topic.offline !== '' ? <div className="warn">{topic.offline}</div> : null}
        {launchKey === null ? (
          <div className="note">Оберіть топік — креативи ляжуть у його кампанії, а ісходники в його теку.</div>
        ) : null}
        {launchKey !== null && campaigns === null ? <div className="note">Читаю кампанії…</div> : null}
        {campaignsNote !== '' ? <div className="error">{campaignsNote}</div> : null}
        {launchKey !== null && campaigns !== null && campaigns.length === 0 && campaignsNote === '' ? (
          <div className="warn">У цьому топіку ще немає кампаній — креативи нікуди класти. Попросіть Claude створити кампанії під цей топік.</div>
        ) : null}
        {launchKey === null || campaigns === null || campaigns.length === 0 ? null : release.map(id => (
          <LocaleRow
            key={id}
            id={id}
            project={project}
            layout={layout}
            campaigns={campaigns}
            selectedAll={selectedAll}
            onRow={(campaign, on) => setLayout(l => toggleLocaleTarget(l, id, campaign, on))}
            onPhotos={(campaign, on) => setLayout(l => togglePhotoTarget(l, project.selection, id, campaign, on))}
            onPhotosAsRow={() => setLayout(l => setPhotoTarget(l, project.selection, id, 'inherit'))}
          />
        ))}
        {placed !== null && placed.skipped > 0 ? (
          <div className="note">Не експортується: {placed.skipped} файлів.</div>
        ) : null}
      </div>

      <div className="group">
        <button
          className="wide"
          disabled={run.running || project.activeId === null}
          onClick={() => {
            const one = onExportOne();
            if (one !== null) go(one);
          }}
        >
          Експортувати цей креатив
        </button>

        <button
          className="primary"
          style={{ marginTop: 8 }}
          disabled={run.running || total === 0 || (placed !== null && placed.total === 0)}
          onClick={() => go(planBatch(project))}
        >
          {placed === null
            ? `Експортувати ${photos} × ${locales} = ${total}`
            : `Експортувати в теки: ${placed.total}${placed.copies > placed.total ? ` (${placed.copies} файлів)` : ''}`}
        </button>

        <div className="note">
          {total === 0
            ? 'Оберіть фото і хоча б одну мову в експорт.'
            : placed !== null && placed.copies > placed.total
              ? `${photos} фото × ${locales} мов; файл копіюється в кожну кампанію своєї мови. Однакові відеоряди рендеряться один раз.`
              : `${photos} фото × ${locales} мов. Однакові відеоряди рендеряться один раз.`}
        </div>
      </div>

      {status === null ? null : (
        <div className="group export-progress">
          <div className="lab">
            {run.running ? 'Рендер' : 'Останній експорт'}
            <span className="val">{status.done} / {status.total}</span>
          </div>
          <div className="bar">
            <div
              className="fill"
              style={{ width: `${status.total === 0 ? 0 : (status.done / status.total) * 100}%` }}
            />
          </div>
          {run.running ? (
            <div className="note">
              {status.current === '' ? 'Готуємось…' : status.current}
              {status.remaining === null ? '' : ` · ще ≈ ${status.remaining.toFixed(0)} с`}
            </div>
          ) : null}
          {run.running ? (
            <button className="wide" style={{ marginTop: 8 }} onClick={run.cancel}>
              Скасувати
            </button>
          ) : null}
          {!run.running && status.ready ? (
            <button className="wide" style={{ marginTop: 8 }} onClick={run.download}>
              Забрати ще раз
            </button>
          ) : null}
          {status.errors.map(failure => (
            <div className="error" key={failure.name + failure.message}>
              {failure.name}: {failure.message}
            </div>
          ))}
        </div>
      )}

      {run.note === '' ? null : (
        <div className={run.failed ? 'error' : 'note'}>{run.note}</div>
      )}
      {topic.note === '' ? null : (
        <div className={topic.failed ? 'error' : 'note'}>{topic.note}</div>
      )}
    </>
  );
}

interface RowProps {
  id: LocaleId;
  project: Project;
  layout: ExportLayout;
  campaigns: readonly CampaignInfo[];
  selectedAll: boolean;
  onRow: (campaign: string, on: boolean) => void;
  onPhotos: (campaign: string, on: boolean) => void;
  onPhotosAsRow: () => void;
}

const campaignLabel = (c: CampaignInfo): string =>
  c.language === null ? c.name : `${c.name} · ${c.language}${c.country ? '/' + c.country : ''}`;

/**
 * One language: the campaigns it goes to, a box each — the ones that speak
 * it first and ticked, the rest of the topic folded away for the campaign
 * split by place rather than tongue. When only some photos are selected, a
 * second set of boxes says where those go instead; ticking one writes onto
 * the whole selection, as every control in the panel does, and «як мова»
 * hands them back to the row.
 */
function LocaleRow({ id, project, layout, campaigns, selectedAll, onRow, onPhotos, onPhotosAsRow }: RowProps) {
  const shares = rowSummary(project, layout, id);
  const home = new Set(layout.locales[id] ?? []);
  const own = speakers(campaigns, id);
  const others = campaigns.filter(c => !own.includes(c.name));
  const said = selectionTarget(layout, project.selection, id);
  const chosen = said === 'inherit' ? null : said === 'mixed' ? 'mixed' : new Set(said);
  const label = (target: string | null): string => target ?? 'не експортувати';

  const boxes = (list: readonly CampaignInfo[], has: (name: string) => boolean, onTick: (name: string, on: boolean) => void, indeterminate = false) =>
    list.map(c => (
      <label className="check" key={c.name}>
        <input
          type="checkbox"
          checked={has(c.name)}
          ref={el => { if (el !== null) el.indeterminate = indeterminate; }}
          onChange={e => onTick(c.name, e.target.checked)}
        />
        {campaignLabel(c)}
      </label>
    ));

  return (
    <div className="dest-row">
      <div className="dest-lang">{FLAGS[id]} {LOCALE_NAMES[id]}</div>
      {own.length === 0 ? <div className="note">Жодна кампанія не говорить цією мовою.</div> : null}
      {boxes(campaigns.filter(c => own.includes(c.name)), name => home.has(name), onRow)}
      {others.length === 0 ? null : (
        <details>
          <summary className="note">інші кампанії топіка{[...home].filter(n => !own.includes(n)).length > 0 ? ` · ${[...home].filter(n => !own.includes(n)).length} обрано` : ''}</summary>
          {boxes(others, name => home.has(name), onRow)}
        </details>
      )}
      {selectedAll || project.selection.length === 0 ? null : (
        <div className="dest-photos">
          <div className="dest-lang">
            виділені {project.selection.length} →{' '}
            {chosen === null ? 'як мова' : (
              <button type="button" className="link" onClick={onPhotosAsRow}>як мова</button>
            )}
          </div>
          {boxes(
            campaigns,
            name => (chosen === null ? home.has(name) : chosen === 'mixed' ? false : chosen.has(name)),
            onPhotos,
            chosen === 'mixed',
          )}
        </div>
      )}
      {shares.length > 1 || shares.some(s => s.campaign === null || !home.has(s.campaign)) ? (
        <div className="note dest-note">
          {shares.map(s => `${s.count} → ${label(s.campaign)}`).join(' · ')}
        </div>
      ) : null}
    </div>
  );
}
