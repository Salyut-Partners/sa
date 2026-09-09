import { useState } from 'react';
import type { TopicBatch } from './topic-batch.ts';

interface Props {
  topic: TopicBatch;
  /** Whether there is anything on screen worth saving. */
  hasPhotos: boolean;
}

/**
 * Where the batch lives: the topic folder and the batch inside it.
 *
 * The chooser is the smallest one that works before the launches tab exists —
 * a topic, a batch, open, save. Saving into a new name binds the project to it,
 * so the next ⌘S knows where to go; opening one replaces what is on screen the
 * way opening a file does, with one undo step back.
 */
export function BatchPanel({ topic, hasPhotos }: Props) {
  const [newName, setNewName] = useState('');
  const [picked, setPicked] = useState('');
  const chosen = picked !== '' && topic.batches.includes(picked)
    ? picked
    : topic.batches[0] ?? '';
  const where = topic.location === null ? null : `${topic.location.launchKey}/${topic.location.batch}`;

  return (
    <div className="group">
      <div className="lab">
        Пачка
        <span className="val">{where ?? 'не в теці'}</span>
      </div>
      {topic.offline !== '' ? <div className="warn">{topic.offline}</div> : null}

      <div className="row" style={{ marginBottom: 8 }}>
        <select
          value={topic.launchKey}
          onChange={e => topic.browse(e.target.value)}
          disabled={topic.busy}
        >
          <option value="">— топік —</option>
          {topic.launches.map(key => <option key={key} value={key}>{key}</option>)}
        </select>
      </div>

      {topic.launchKey === '' ? (
        <div className="note">Оберіть топік — його теку створює <code>sa new</code>.</div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <select
              value={chosen}
              onChange={e => setPicked(e.target.value)}
              disabled={topic.busy || topic.batches.length === 0}
            >
              {topic.batches.length === 0
                ? <option value="">пачок ще немає</option>
                : topic.batches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <button
              type="button"
              disabled={topic.busy || chosen === ''}
              onClick={() => topic.open(chosen)}
            >
              Відкрити
            </button>
          </div>
          <div className="row">
            <input
              type="text"
              placeholder="нова пачка, напр. batch-1"
              value={newName}
              spellCheck={false}
              onChange={e => setNewName(e.target.value)}
            />
            <button
              type="button"
              disabled={topic.busy || !hasPhotos || newName.trim() === ''}
              onClick={() => { topic.save(newName); setNewName(''); }}
            >
              Зберегти як
            </button>
          </div>
        </>
      )}

      {topic.location === null ? null : (
        <div className="row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="wide"
            disabled={topic.busy || !topic.dirty || !hasPhotos}
            onClick={() => topic.save()}
            title="⌘S"
          >
            {topic.dirty ? 'Зберегти в теку' : 'Збережено в теку'}
          </button>
          <button type="button" onClick={topic.unbind} title="Далі працювати без теки">
            Відв'язати
          </button>
        </div>
      )}

      {topic.note === '' ? null : (
        <div className={topic.failed ? 'error' : 'note'}>{topic.note}</div>
      )}
    </div>
  );
}
