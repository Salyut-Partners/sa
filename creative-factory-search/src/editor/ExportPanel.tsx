import { useEffect, useState } from 'react';
import { batchSize, planBatch, subtitleCount, type BatchPlan } from '../core/batch.ts';
import { LOCALE_NAMES, releaseLocales, voiceCheck } from '../core/locales.ts';
import { FLAGS } from '../core/phrasebook.ts';
import type { Command } from '../core/project.ts';
import type { Project } from '../core/types.ts';
import type { ExportRun } from './export.ts';
import type { Translator } from './translate.ts';
import { LaunchPanel } from './LaunchPanel.tsx';
import { fetchPlatform, fetchSubtitles, type PlatformState, type SubsState } from './server.ts';
import { VoiceConfirm } from './VoiceCheck.tsx';

interface Props {
  project: Project;
  dispatch: (command: Command) => void;
  run: ExportRun;
  /** The plan for one creative of the project given — the quick check, before committing to a batch. */
  onExportOne: (project: Project) => BatchPlan | null;
  /** Translates the script into the languages going out before anything renders. */
  translator: Translator;
}

/** The style select's value for "no subtitles" — a select cannot hold null. */
const NO_STYLE = ' none';
/** «Куди»'s value for a download; an empty value is nothing chosen yet, and nothing exports until something is. */
const DOWNLOAD = 'download';
/** «Куди»'s value for a launch: a new campaign on the platform, straight from the render. */
const LAUNCH = 'launch';

/**
 * The export, and what it is doing.
 *
 * Two buttons rather than one: checking a single creative and shipping the
 * release are different acts with different costs, and a batch of twelve photos
 * across seven languages is not something to start by accident.
 *
 * «Куди» has to be said before anything exports: the download, or a launch —
 * a new campaign on the platform, from the form below. Without a token in the
 * config there is no launch to offer, and the download is chosen for the buyer.
 */
export function ExportPanel({ project, dispatch, run, onExportOne, translator }: Props) {
  // Counted, not planned: the plan is built at the press. See `batchSize`.
  const { total } = batchSize(project);
  const { status } = run;
  const [where, setWhere] = useState('');
  const whereChosen = where !== '';
  const launching = where === LAUNCH;

  const release = releaseLocales(project).map(l => l.id);

  // What the machine says about subtitles: the styles to offer, and whether a
  // file with its words in hand would come out. Asked once; the answer only
  // changes when someone runs setup.sh, and the export says so again if it did.
  const [subs, setSubs] = useState<SubsState | null>(null);
  const [subsNote, setSubsNote] = useState('');
  useEffect(() => {
    fetchSubtitles().then(setSubs).catch(e => setSubsNote((e as Error).message));
  }, []);
  const burned = subtitleCount(project);

  // Asked once, like the subtitles: a token pasted in mid-session shows after a
  // reload. Only the config is read — a token the platform refuses is said by
  // the launch form itself, and a platform that is merely down is no reason to
  // hide the launch. A config that cannot be read hides nothing either.
  const [platform, setPlatform] = useState<PlatformState | null>(null);
  useEffect(() => {
    fetchPlatform().then(state => {
      setPlatform(state);
      if (!state.ready) setWhere(DOWNLOAD);
    }).catch(() => undefined);
  }, []);
  const noPlatform = platform !== null && !platform.ready ? platform.note : null;

  const [asking, setAsking] = useState<((project: Project) => BatchPlan | null) | null>(null);
  const [fillEmpty, setFillEmpty] = useState(true);
  const check = voiceCheck(project);

  /** Asked first when what the languages will say is not what the panel shows — see `voiceCheck`. */
  const go = (planOf: (project: Project) => BatchPlan | null): void => {
    // Nobody speaks with the voice off: nothing to check, nothing to translate for the export.
    if (!project.voiceOn) {
      const plan = planOf(project);
      if (plan !== null) run.start(plan, project.duration, project.fitToVoice);
      return;
    }
    if (check.ask) {
      setFillEmpty(true);
      setAsking(() => planOf);
      return;
    }
    render(planOf, true);
  };

  /**
   * Start a download: the script translated first into every language going
   * out whose translation is stale, and into the empty ones when the buyer
   * said so — then the plan, made from the project as the translation left it.
   */
  const render = (planOf: (project: Project) => BatchPlan | null, fill: boolean): void => {
    void translator.beforeExport({ fillEmpty: fill }).then(translated => {
      if (translated === null) return;
      const plan = planOf(translated);
      if (plan === null) return;
      run.start(plan, translated.duration, translated.fitToVoice);
    }).catch(() => undefined);
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
        {project.subtitles !== null && !project.voiceOn ? (
          <div className="warn">Озвучку вимкнено — без озвучки субтитрів немає: слова нема по чому розставити в часі.</div>
        ) : null}
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
          <span className="val">{!whereChosen ? 'не обрано' : launching ? 'на платформу' : 'у завантаження'}</span>
        </div>
        <select value={where} onChange={e => setWhere(e.target.value)} disabled={run.running}>
          <option value="" disabled>— оберіть, куди —</option>
          {noPlatform === null ? <option value={LAUNCH}>Залити на платформу — нова кампанія</option> : null}
          <option value={DOWNLOAD}>Завантаження — файлом</option>
        </select>
        {!whereChosen ? <div className="warn">Оберіть, куди: залити на платформу новою кампанією або «Завантаження».</div> : null}
        {noPlatform === null ? null : <div className="note">Лише завантаження: {noPlatform}.</div>}
      </div>

      {launching ? <LaunchPanel project={project} translator={translator} /> : (
      <div className="group">
        <button
          className="wide"
          disabled={run.running || translator.busy || !whereChosen || project.activeId === null}
          title={whereChosen ? 'Креатив, на якому стоїть курсор, — мовою, що зараз на екрані' : 'Спершу оберіть, куди'}
          onClick={() => go(onExportOne)}
        >
          Лише цей креатив
        </button>

        <button
          className="primary"
          style={{ marginTop: 8 }}
          disabled={run.running || translator.busy || !whereChosen || total === 0}
          title={whereChosen ? '' : 'Спершу оберіть, куди'}
          onClick={() => go(planBatch)}
        >
          {`Експортувати всі (${total} ${creativesWord(total)} → ${total} ${filesWord(total)})`}
        </button>

        {/* The translation's progress and failure by the button that started it; its success is said by the voice panel. */}
        {translator.busy || translator.failed ? (
          <div className={translator.failed ? 'error' : 'note'}>{translator.note}</div>
        ) : null}
        <div className="note">
          {total === 0 ? 'Оберіть фото і хоча б одну мову в експорт.' : 'Однакові відеоряди рендеряться один раз.'}
        </div>
      </div>
      )}

      {asking === null ? null : (
        <VoiceConfirm
          check={check}
          fillEmpty={fillEmpty}
          onFillEmpty={setFillEmpty}
          onCancel={() => setAsking(null)}
          onClear={() => {
            translator.clearScripts();
            setAsking(null);
          }}
          onGo={() => {
            const planOf = asking;
            setAsking(null);
            render(planOf, fillEmpty);
          }}
        />
      )}

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

/** «креатив», «креативи», «креативів» after a number. */
function creativesWord(n: number): string {
  return plural(n, 'креатив', 'креативи', 'креативів');
}

/** «файл», «файли», «файлів» after a number. */
function filesWord(n: number): string {
  return plural(n, 'файл', 'файли', 'файлів');
}

function plural(n: number, one: string, few: string, many: string): string {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
