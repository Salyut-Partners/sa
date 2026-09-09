import { useEffect, useState } from 'react';
import { batchSize, planBatch, type BatchPlan } from '../core/batch.ts';
import { LOCALE_NAMES, releaseLocales } from '../core/locales.ts';
import { FLAGS } from '../core/phrasebook.ts';
import {
  defaultLayout, placementSize, placePlan, rowSummary, setLocaleTarget, setPhotoTarget,
  type CampaignInfo, type ExportLayout, type Target,
} from '../core/placement.ts';
import type { LocaleId, Project } from '../core/types.ts';
import type { ExportRun } from './export.ts';
import { fetchCampaigns, type BatchOutput } from './server.ts';
import type { TopicBatch } from './topic-batch.ts';

interface Props {
  project: Project;
  run: ExportRun;
  /** The plan for one creative — the quick check, before committing to a batch. */
  onExportOne: () => BatchPlan | null;
  topic: TopicBatch;
}

/** The select's value for "not exported" — a select cannot hold null. */
const NOWHERE = ' none';
/** The photo row's value for "wherever the language goes". */
const AS_ROW = ' row';

const toValue = (target: Target): string => target ?? NOWHERE;
const fromValue = (value: string): Target => (value === NOWHERE ? null : value);

/**
 * The export, and what it is doing.
 *
 * Two buttons rather than one: checking a single creative and shipping the
 * release are different acts with different costs, and a batch of twelve photos
 * across seven languages is not something to start by accident.
 *
 * Bound to a topic, the files go to campaign folders and the panel shows a row
 * per language saying which. Unbound, the export is a download, as it was.
 */
export function ExportPanel({ project, run, onExportOne, topic }: Props) {
  // Counted, not planned: the plan is built at the press. See `batchSize`.
  const { photos, locales, total } = batchSize(project);
  const { status } = run;
  const launchKey = topic.location?.launchKey ?? null;

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
    setLayout(current => {
      const fresh = defaultLayout(project, campaigns);
      const merged: ExportLayout['locales'] = {};
      for (const id of release) {
        merged[id] = id in current.locales ? current.locales[id] ?? null : fresh.locales[id] ?? null;
      }
      return { ...current, locales: merged };
    });
    // The release list is read off the project; its key is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, releaseKey]);

  const selectedAll = project.selection.length === project.photos.length;
  // Counted, not planned, like `batchSize`: this runs on every keystroke.
  const placed = launchKey === null ? null : placementSize(project, layout);

  /** Start a plan: laid into folders when bound, as a download when not. */
  const go = (plan: BatchPlan): void => {
    if (launchKey === null) {
      run.start(plan, project.duration, project.fitToVoice);
      return;
    }
    const laid = placePlan(plan, layout);
    const output: BatchOutput = { launchKey, destinations: laid.destinations };
    run.start(laid.plan, project.duration, project.fitToVoice, output);
  };

  const options = (campaigns ?? []).map(c => ({
    id: c.name,
    label: c.language === null ? c.name : `${c.name} · ${c.language}${c.country ? '/' + c.country : ''}`,
  }));

  return (
    <>
      {launchKey === null ? null : (
        <div className="group">
          <div className="lab">
            Куди
            <span className="val">{launchKey}</span>
          </div>
          {campaigns === null ? <div className="note">Читаю кампанії…</div> : null}
          {campaignsNote !== '' ? <div className="error">{campaignsNote}</div> : null}
          {campaigns !== null && campaigns.length === 0 && campaignsNote === '' ? (
            <div className="warn">У {launchKey}/campaigns немає жодної кампанії — файли нікуди класти.</div>
          ) : null}
          {campaigns === null || campaigns.length === 0 ? null : release.map(id => (
            <LocaleRow
              key={id}
              id={id}
              project={project}
              layout={layout}
              options={options}
              selectedAll={selectedAll}
              onRow={target => setLayout(l => setLocaleTarget(l, id, target))}
              onPhotos={target => setLayout(l => setPhotoTarget(l, project.selection, id, target))}
            />
          ))}
          {placed !== null && placed.skipped > 0 ? (
            <div className="note">Не експортується: {placed.skipped} файлів.</div>
          ) : null}
        </div>
      )}

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
            : `Експортувати в теки: ${placed.total}`}
        </button>

        <div className="note">
          {total === 0
            ? 'Оберіть фото і хоча б одну мову в експорт.'
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
    </>
  );
}

interface RowProps {
  id: LocaleId;
  project: Project;
  layout: ExportLayout;
  options: readonly { id: string; label: string }[];
  selectedAll: boolean;
  onRow: (target: Target) => void;
  onPhotos: (target: Target | 'inherit') => void;
}

/**
 * One language: where it goes, and — when only some photos are selected —
 * where those go instead. The photo select shows what the selection agrees
 * on, or "as the row" when it follows the row or disagrees; choosing anything
 * writes it onto the whole selection, as every control in the panel does.
 */
function LocaleRow({ id, project, layout, options, selectedAll, onRow, onPhotos }: RowProps) {
  const shares = rowSummary(project, layout, id);
  const home = layout.locales[id] ?? null;
  const overridden = project.selection.map(pid => layout.overrides[pid]?.[id]);
  const first = overridden[0];
  const agree = overridden.length > 0 && overridden.every(t => t === first);
  const photosValue = agree && first !== undefined ? toValue(first) : AS_ROW;
  const label = (target: Target): string => target ?? 'не експортувати';

  return (
    <div className="dest-row">
      <div className="row">
        <span className="dest-lang">{FLAGS[id]} {LOCALE_NAMES[id]}</span>
        <select value={toValue(home)} onChange={e => onRow(fromValue(e.target.value))}>
          <option value={NOWHERE}>— не експортувати —</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      {selectedAll || project.selection.length === 0 ? null : (
        <div className="row dest-photos">
          <span className="dest-lang">виділені {project.selection.length} →</span>
          <select
            value={photosValue}
            onChange={e => onPhotos(e.target.value === AS_ROW ? 'inherit' : fromValue(e.target.value))}
          >
            <option value={AS_ROW}>як мова</option>
            <option value={NOWHERE}>— не експортувати —</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      )}
      {shares.length > 1 || (shares.length === 1 && shares[0]!.campaign !== home) ? (
        <div className="note dest-note">
          {shares.map(s => `${s.count} → ${label(s.campaign)}`).join(' · ')}
        </div>
      ) : null}
    </div>
  );
}
