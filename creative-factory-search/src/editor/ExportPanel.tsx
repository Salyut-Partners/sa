import { batchSize, planBatch, type BatchPlan } from '../core/batch.ts';
import type { Project } from '../core/types.ts';
import type { ExportRun } from './export.ts';

interface Props {
  project: Project;
  run: ExportRun;
  /** The plan for one creative — the quick check, before committing to a batch. */
  onExportOne: () => BatchPlan | null;
}

/**
 * The export, and what it is doing.
 *
 * Two buttons rather than one: checking a single creative and shipping the
 * release are different acts with different costs, and a batch of twelve photos
 * across seven languages is not something to start by accident.
 */
export function ExportPanel({ project, run, onExportOne }: Props) {
  // Counted, not planned: the plan is built at the press. See `batchSize`.
  const { photos, locales, total } = batchSize(project);
  const { status } = run;

  return (
    <>
      <div className="group">
        <button
          className="wide"
          disabled={run.running || project.activeId === null}
          onClick={() => {
            const one = onExportOne();
            if (one !== null) run.start(one, project.duration, project.fitToVoice);
          }}
        >
          Експортувати цей креатив
        </button>

        <button
          className="primary"
          style={{ marginTop: 8 }}
          disabled={run.running || total === 0}
          onClick={() => run.start(planBatch(project), project.duration, project.fitToVoice)}
        >
          Експортувати {photos} × {locales} = {total}
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
