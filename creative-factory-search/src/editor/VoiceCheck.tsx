// What every language going out will say, shown before an export or a launch.
// The voice panel shows one language's script; the export speaks all of them,
// and a script left in a language off screen used to ship unseen.
import type { VoiceCheck } from '../core/locales.ts';
import { LOCALE_NAMES } from '../core/locales.ts';
import { FLAGS } from '../core/phrasebook.ts';

/** The words, cut to a line. */
const quote = (script: string): string => `«${script.length > 70 ? script.slice(0, 70).trimEnd() + '…' : script}»`;

/** A line per language: what it says and where the words came from; then, when some are empty, the choice of what they get. */
export function VoiceLines({ check, fillEmpty, onFillEmpty }: {
  check: VoiceCheck;
  fillEmpty: boolean;
  onFillEmpty: (fill: boolean) => void;
}) {
  const source = check.source === null ? '' : LOCALE_NAMES[check.source];
  return (
    <>
      <ul className="voice-lines">
        {check.lines.map(line => (
          <li key={line.id}>
            {FLAGS[line.id]} {LOCALE_NAMES[line.id]} —{' '}
            {line.kind === 'silent' ? <span className="muted">без звуку</span>
              : line.kind === 'fill' ? (fillEmpty
                ? <>{quote(line.script)} <span className="muted">· буде перекладено з {source}</span></>
                : <span className="muted">порожньо — без звуку</span>)
              : <>{quote(line.script)}{line.kind === 'translation' && line.from !== null
                ? <span className="muted"> · переклад з {LOCALE_NAMES[line.from]}</span> : null}</>}
          </li>
        ))}
      </ul>
      {check.empty.length === 0 ? null : (
        <div className="voice-choice">
          <div>Без скрипту: {check.empty.map(id => LOCALE_NAMES[id]).join(', ')}.</div>
          <label>
            <input type="radio" checked={fillEmpty} onChange={() => onFillEmpty(true)} /> перекласти з {source}
          </label>
          <label>
            <input type="radio" checked={!fillEmpty} onChange={() => onFillEmpty(false)} /> лишити без звуку
          </label>
        </div>
      )}
    </>
  );
}

/** The question before a download: what will be spoken, go on or not, or silence it all. */
export function VoiceConfirm({ check, fillEmpty, onFillEmpty, onGo, onCancel, onClear }: {
  check: VoiceCheck;
  fillEmpty: boolean;
  onFillEmpty: (fill: boolean) => void;
  onGo: () => void;
  onCancel: () => void;
  onClear: () => void;
}) {
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h3>Перевірте озвучку</h3>
        <VoiceLines check={check} fillEmpty={fillEmpty} onFillEmpty={onFillEmpty} />
        <div className="modal-actions">
          <button onClick={onCancel}>Скасувати</button>
          <button onClick={onClear} title="Порожній скрипт у кожній мові — креатив без звуку">Прибрати озвучку всюди</button>
          <button className="primary" onClick={onGo}>Експортувати</button>
        </div>
      </div>
    </div>
  );
}
