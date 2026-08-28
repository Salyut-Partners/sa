import { activeLocale, LOCALE_NAMES } from '../core/locales.ts';
import type { Command } from '../core/project.ts';
import { just } from '../core/selection.ts';
import type { Project } from '../core/types.ts';
import { voiceEstimate } from '../core/voice.ts';
import { CheckField, SelectField, TextAreaField } from './fields.tsx';
import { describeTranslator, describeVoiceSource, type VoiceCatalogue } from './server.ts';
import type { Translator } from './translate.ts';

interface Props {
  project: Project;
  dispatch: (command: Command) => void;
  /** Null until the server has answered — or for good, if it never does. */
  catalogue: VoiceCatalogue | null;
  translator: Translator;
}

/** What the project's voice means when nobody has picked one. */
const PROJECT_DEFAULT = '';

/**
 * The voice-over, for the language on screen.
 *
 * The script is the locale's, the voice may be the locale's or the project's,
 * and the model is the project's — because the model is a price, and paying two
 * prices in one export is not a thing anybody asks for.
 */
export function VoicePanel({ project, dispatch, catalogue, translator }: Props) {
  const locale = activeLocale(project);
  const estimate = voiceEstimate(project.locales.filter(l => l.include), project.modelId);
  const voices = catalogue?.voices ?? [];
  const models = catalogue?.models ?? [];
  const source = catalogue === null ? '' : describeVoiceSource(catalogue);
  const noTranslator = describeTranslator(catalogue);

  const voiceOptions = [
    { id: PROJECT_DEFAULT, label: 'голос проєкту' },
    ...voices.map(v => ({
      id: v.voiceId,
      label: [v.name, v.labels['accent'], v.labels['gender']].filter(Boolean).join(' · '),
    })),
  ];

  return (
    <>
      <div className="group">
        <div className="lab">
          Скрипт озвучки
          <span className="val">{LOCALE_NAMES[locale.id]}</span>
        </div>
        <TextAreaField
          value={just(locale.script)}
          onChange={script =>
            dispatch({ type: 'locale/patch', id: locale.id, patch: { script } })}
          rows={5}
        />
        <div className="note">Порожній скрипт — німий креатив, без ключів і без витрат.</div>
        <button
          className="wide"
          style={{ marginTop: 8 }}
          disabled={translator.busy || project.locales.length < 2 || noTranslator !== ''}
          onClick={translator.translateScript}
        >
          Перекласти скрипт на решту мов
        </button>
        {noTranslator === '' ? null : <div className="warn">{noTranslator}</div>}
      </div>

      <div className="group">
        <div className="lab">Голос цієї мови</div>
        <SelectField
          value={just(locale.voiceId ?? PROJECT_DEFAULT)}
          options={voiceOptions}
          onChange={id =>
            dispatch({
              type: 'locale/patch', id: locale.id,
              patch: { voiceId: id === PROJECT_DEFAULT ? null : id },
            })}
        />
        <div className="note">
          Німецька своїм голосом звучить природніше, ніж голосом з англійської.
        </div>
      </div>

      <div className="group">
        <div className="lab">Голос проєкту</div>
        <SelectField
          value={just(project.voiceId)}
          options={[
            { id: PROJECT_DEFAULT, label: 'перший доступний' },
            ...voiceOptions.slice(1),
          ]}
          onChange={voiceId => dispatch({ type: 'project/patch', patch: { voiceId } })}
        />
        {source === '' ? null : <div className="note">{source}</div>}
      </div>

      <div className="group">
        <div className="lab">Модель синтезу</div>
        <SelectField
          value={just(project.modelId)}
          options={models.map(m => ({ id: m.id, label: m.label }))}
          onChange={modelId => dispatch({ type: 'project/patch', patch: { modelId } })}
        />
        <div className="note">
          {/* Once per language, not once per photo: the export synthesises each
              line one time and lays it over every creative that wants it. */}
          {estimate.chars === 0
            ? 'Скриптів ще немає — експорт буде німим.'
            : `${estimate.chars} символів у ${estimate.syntheses} мов${
                estimate.syntheses === 1 ? 'і' : 'ах'} · ≈ $${estimate.usd.toFixed(2)}`}
        </div>
      </div>

      <div className="group">
        <CheckField
          label="Тягнути тривалість під озвучку"
          value={just(project.fitToVoice)}
          onChange={fitToVoice => dispatch({ type: 'project/patch', patch: { fitToVoice } })}
        />
        <div className="note">
          Вимкніть, щоб тримати жорсткий хронометраж — тоді довша фраза обріжеться.
        </div>
      </div>
    </>
  );
}
