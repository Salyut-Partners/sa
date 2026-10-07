import { useEffect, useRef, useState } from 'react';
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

/**
 * The voice-over, for the language on screen.
 *
 * The script is the locale's; the voice and the model are the project's. One
 * voice, because a multilingual model speaks every language in it and a second
 * select per language read as the same choice twice. One model, because the
 * model is a price, and paying two prices in one export is not a thing anybody
 * asks for.
 */
export function VoicePanel({ project, dispatch, catalogue, translator }: Props) {
  const locale = activeLocale(project);
  const estimate = voiceEstimate(project.locales.filter(l => l.include), project.modelId);
  const voices = catalogue?.voices ?? [];
  const models = catalogue?.models ?? [];
  const source = catalogue === null ? '' : describeVoiceSource(catalogue);
  const noTranslator = describeTranslator(catalogue);

  // A project from before the editor picked a voice holds none, which means
  // the first on the list — the one synthesis falls back to. Shown by name, so
  // the select and the play button say what the export will speak with.
  const voiceId = project.voiceId || voices[0]?.voiceId || '';
  const voice = voices.find(v => v.voiceId === voiceId) ?? null;
  const voiceOptions = voices.map(v => ({
    id: v.voiceId,
    label: [v.name, v.labels['accent'], v.labels['gender']].filter(Boolean).join(' · '),
  }));
  // A voice the project names but this account does not list — a file from
  // another buyer — stays shown rather than reading as the first one.
  if (voiceId !== '' && voice === null) voiceOptions.push({ id: voiceId, label: 'голос не з цього акаунта' });

  const sample = useSample(voice?.previewUrl ?? null);

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
        <div className="lab">Голос</div>
        <div className="row">
          <SelectField
            value={just(voiceId)}
            options={voiceOptions}
            onChange={id => dispatch({ type: 'project/patch', patch: { voiceId: id } })}
          />
          <button
            disabled={voice?.previewUrl == null}
            title={voice?.previewUrl == null ? 'Для цього голосу немає семплу' : sample.playing ? 'Зупинити' : 'Прослухати семпл ElevenLabs'}
            onClick={sample.toggle}
          >
            {sample.playing ? '■' : '▶'}
          </button>
        </div>
        <div className="note">Один голос на всі мови. Семпл — англійська фраза від ElevenLabs, безкоштовно.</div>
        {sample.failed ? <div className="error">Семпл не відтворився — перевірте з'єднання.</div> : null}
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

/**
 * A voice's sample, played and stopped from one button. Changing the voice
 * stops whatever was playing: the button now stands for another voice, and a
 * sample running on under it would be the wrong one.
 */
function useSample(url: string | null): { playing: boolean; failed: boolean; toggle: () => void } {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    return () => {
      audio.current?.pause();
      audio.current = null;
      setPlaying(false);
    };
  }, [url]);

  const toggle = (): void => {
    if (url === null) return;
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    const player = audio.current ?? new Audio(url);
    audio.current = player;
    player.currentTime = 0;
    player.onended = () => setPlaying(false);
    setFailed(false);
    setPlaying(true);
    player.play().catch(() => {
      setPlaying(false);
      setFailed(true);
    });
  };

  return { playing, failed, toggle };
}
