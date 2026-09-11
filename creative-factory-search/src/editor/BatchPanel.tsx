import { useState } from 'react';
import type { TopicBatch } from './topic-batch.ts';

interface Props {
  topic: TopicBatch;
}

/**
 * Where the sources live: the topic folder and the batch inside it.
 *
 * Nothing is chosen up front. The first export into a topic's campaigns saves
 * the batch under `sources/` with a name from the clock and binds the project
 * to it; this group says where that was, lets an older batch be opened again
 * to regenerate a creative or two, and lets the binding go so the next export
 * starts a new batch — in this topic or another.
 */
export function BatchPanel({ topic }: Props) {
  const [picked, setPicked] = useState('');
  const chosen = picked !== '' && topic.batches.includes(picked)
    ? picked
    : topic.batches[0] ?? '';
  const bound = topic.location;

  return (
    <div className="group">
      <div className="lab">
        Ісходники
        <span className="val">{bound === null ? 'ще не в теці' : `${bound.launchKey}/sources/${bound.batch}`}</span>
      </div>
      {topic.offline !== '' ? <div className="warn">{topic.offline}</div> : null}

      {bound === null ? (
        <div className="note">Збережуться в теку топіка самі, при першому експорті в його кампанії.</div>
      ) : (
        <div className="row">
          <button
            type="button"
            className="wide"
            disabled={topic.busy || !topic.dirty}
            onClick={() => topic.save()}
            title="⌘S"
          >
            {topic.dirty ? 'Зберегти в теку' : 'Збережено в теку'}
          </button>
          <button type="button" onClick={topic.unbind} title="Наступний експорт почне нову пачку ісходників">
            Відв'язати
          </button>
        </div>
      )}

      <details style={{ marginTop: 8 }}>
        <summary className="note">Відкрити давніші ісходники</summary>
        <div className="row" style={{ margin: '6px 0' }}>
          <select
            value={topic.launchKey}
            onChange={e => topic.browse(e.target.value)}
            disabled={topic.busy || bound !== null}
            title={bound === null ? undefined : 'Відв\'яжіть пачку, щоб дивитись інший топік'}
          >
            <option value="">— топік —</option>
            {topic.launches.map(key => <option key={key} value={key}>{key}</option>)}
          </select>
        </div>
        {topic.launchKey === '' ? null : (
          <div className="row">
            <select
              value={chosen}
              onChange={e => setPicked(e.target.value)}
              disabled={topic.busy || topic.batches.length === 0}
            >
              {topic.batches.length === 0
                ? <option value="">ісходників ще немає</option>
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
        )}
      </details>

      {topic.note === '' ? null : (
        <div className={topic.failed ? 'error' : 'note'}>{topic.note}</div>
      )}
    </div>
  );
}
