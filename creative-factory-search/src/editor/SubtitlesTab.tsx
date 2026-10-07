import { useEffect, useState } from 'react';
import { LOCALE_IDS, LOCALE_NAMES } from '../core/locales.ts';
import { FilePicker } from './FilePicker.tsx';
import { fetchSubtitles, type SubsState, type SubtitleTarget } from './server.ts';
import type { QueuedFile, SubtitleQueue } from './subtitles.ts';

interface Props {
  queue: SubtitleQueue;
}

/** Languages Whisper is asked for by name; anything else it guesses. */
const LANGS: readonly { id: string; label: string }[] = [
  { id: 'auto', label: 'визначити автоматично' },
  ...LOCALE_IDS.map(id => ({ id, label: LOCALE_NAMES[id] })),
  { id: 'uk', label: 'Українська' },
  { id: 'ru', label: 'Русский' },
];

/**
 * The watcher, in a window. Drop a video, pick a style and a language, and
 * watch it go through the same pipeline `inbox/<style>/` feeds — one job per
 * file, on the same board as an export, into `subs/output/`.
 */
export function SubtitlesTab({ queue }: Props) {
  const [state, setState] = useState<SubsState | null>(null);
  const [stateNote, setStateNote] = useState('');
  const [style, setStyle] = useState('');
  const [lang, setLang] = useState('auto');
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    fetchSubtitles()
      .then(s => {
        setState(s);
        setStyle(current => (current !== '' ? current : s.styles?.default ?? ''));
      })
      .catch(e => setStateNote((e as Error).message));
  }, []);

  const ready = state?.ready === true && style !== '';
  const target = (): SubtitleTarget => ({ style, lang });
  const take = (list: FileList | null): void => {
    const files = Array.from(list ?? []).filter(f => f.type.startsWith('video/') || /\.(mp4|mov|m4v|mkv|webm|avi)$/i.test(f.name));
    if (files.length > 0 && ready) queue.add(files, target());
  };

  return (
    <main className="subs">
      <section
        className={'subs-stage' + (dropping ? ' dropping' : '')}
        onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDropping(true); }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
        onDragLeave={e => { e.stopPropagation(); if (e.currentTarget === e.target) setDropping(false); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDropping(false); take(e.dataTransfer.files); }}
      >
        {queue.files.length === 0 ? (
          <div className="empty">
            <b>{ready ? 'Перетягніть відео' : 'Субтитри поки не готові'}</b>
            <span>{ready ? 'mp4, mov — можна декілька; стиль і мову виберіть праворуч' : 'дивіться панель праворуч'}</span>
          </div>
        ) : (
          <div className="subs-list">
            {queue.files.map(file => <FileRow key={file.key} file={file} onCancel={() => queue.cancel(file.key)} />)}
          </div>
        )}
      </section>

      <aside className="side">
        <div className="group">
          <div className="lab">Оточення</div>
          {state === null && stateNote === '' ? <div className="note">Питаю пайплайн…</div> : null}
          {stateNote !== '' ? <div className="error">{stateNote}</div> : null}
          {state?.ready ? <div className="note">Пайплайн subs на місці: Whisper, ffmpeg-full, шрифт.</div> : null}
          {state?.notes.map(line => <div className="error" key={line}>{line}</div>)}
        </div>

        <div className="group">
          <div className="lab">Стиль</div>
          <select value={style} onChange={e => setStyle(e.target.value)} disabled={state?.styles == null}>
            {state?.styles === null || state === null
              ? <option value="">стилі не прочитались</option>
              : state.styles.styles.map(s => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.wordsPerChunk === 1 ? 'по слову' : `${s.wordsPerChunk} слів`}{s.highlight ? '' : ', без підсвітки'}
                </option>
              ))}
          </select>
          <div className="note">Той самий словник, що у вотчера: тека <code>inbox/{style || '…'}/</code> дає те саме.</div>
        </div>

        <div className="group">
          <div className="lab">Мова</div>
          <select value={lang} onChange={e => setLang(e.target.value)}>
            {LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <div className="note">Явна мова точніша за автовизначення на коротких роликах.</div>
        </div>

        <div className="group">
          <div className="note">Файл ляже в subs/output/, як у вотчера; для заливу додайте його у «Креативах» кнопкою «+ mp4 з диска».</div>
        </div>

        <div className="group">
          <FilePicker className="drop" accept="video/*,.mp4,.mov,.m4v,.mkv,.webm,.avi" multiple onPick={take}>
            <span className="t">{ready ? 'Вибрати відео' : 'Спершу полагодьте оточення'}</span>
            <span className="s">або перетягніть у вікно</span>
          </FilePicker>
          {queue.files.length > 0 && !queue.busy ? (
            <button className="wide" style={{ marginTop: 8 }} onClick={queue.clear}>Очистити список</button>
          ) : null}
        </div>
      </aside>
    </main>
  );
}

function FileRow({ file, onCancel }: { file: QueuedFile; onCancel: () => void }) {
  const status = file.status;
  const running = file.id === '' ? file.note === '' : status === null || status.state === 'running';
  const line = file.note !== '' ? file.note
    : file.id === '' ? 'завантаження…'
    : status === null ? 'у черзі'
    : status.state === 'running' ? (status.current === '' ? 'у черзі' : status.current.replace(/^[^:]*:\s*/, ''))
    : status.state === 'done' ? `готово · ${status.folders.join(', ')} · ${status.elapsed.toFixed(0)} с`
    : status.state === 'cancelled' ? 'скасовано'
    : status.errors.map(e => e.message).join(' · ') || 'не вийшло';
  const bad = file.note !== '' || status?.state === 'failed';

  return (
    <div className={'subs-row' + (running ? ' running' : '') + (bad ? ' bad' : '')}>
      <div className="nm">{file.name}</div>
      <div className={bad ? 'error' : 'note'}>{line}</div>
      {running && file.id !== '' ? <button onClick={onCancel}>Скасувати</button> : null}
    </div>
  );
}
