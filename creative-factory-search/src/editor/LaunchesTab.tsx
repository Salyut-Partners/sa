import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TreeTopic } from '../core/launches-tree.ts';
import { campaignOfLine, type CampaignOutline } from '../core/plan.ts';
import {
  campaignClipboard, launchable, topicClipboard, type TableAccount, type TableCampaign, type Totals,
} from '../core/topic-table.ts';
import { forBuyer } from '../core/wording.ts';
import type { ApplyRun } from './launches.ts';
import {
  fetchImportable, fetchLaunchesTree, fetchTopicTable, importTopic, type ImportableRead, type LaunchesTree, type PlanDescription, type TopicTableRead,
} from './server.ts';

interface Props {
  run: ApplyRun;
  /** The topic in the address, or null. */
  chosenKey: string | null;
  onChoose: (launchKey: string) => void;
  /** Open a batch of a topic in the editor — the table lists the topic's sources. */
  onOpenBatch: (launchKey: string, batch: string) => void;
}

/** How often the disk is looked at again while the tab is open: a new folder, or an export's files, show up within this. */
const TREE_POLL_MS = 3000;

/** A topic's table, as fetched: on its way, read, or why it could not be. */
type TableState =
  | { kind: 'reading'; previous: TopicTableRead | null }
  | { kind: 'read'; read: TopicTableRead }
  | { kind: 'failed'; note: string; previous: TopicTableRead | null };

/** The plan panel: open for a topic, the campaigns ticked in it. While it is open the table is read with the plan. */
interface Panel {
  launchKey: string;
  ticked: Set<string>;
}

/**
 * The launches as a table the buyer works from instead of a terminal. On the
 * left the topics; for the chosen one, source → cabinet → campaigns, each in
 * three states — the folder, the launch, the platform — and a totals row.
 * Opening a topic reads the disk and the buyer's platform status, never the
 * plan: «Оновити план» counts it, and the panel beside the table offers the
 * campaigns it would launch or relaunch with a box each. Only «Залити N» at
 * the bottom of it, under the words «за живі гроші», sends anything.
 */
export function LaunchesTab({ run, chosenKey, onChoose, onOpenBatch }: Props) {
  const [tree, setTree] = useState<LaunchesTree | null>(null);
  const [treeNote, setTreeNote] = useState('');
  const [table, setTable] = useState<TableState | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [importing, setImporting] = useState(false);
  /** What the table was last read for: the topic's disk listing and the platform's version. A change is a reason to read again. */
  const readFor = useRef<{ key: string; fingerprint: string } | null>(null);
  /** The latest read asked for: an answer to an older one — a table without the plan landing after one with it — is dropped. */
  const latestRead = useRef(0);

  const look = useCallback((): void => {
    fetchLaunchesTree()
      .then(next => { setTree(next); setTreeNote(''); })
      .catch(e => setTreeNote((e as Error).message));
  }, []);

  useEffect(() => {
    look();
    const timer = setInterval(look, TREE_POLL_MS);
    return () => clearInterval(timer);
  }, [look]);

  const readTable = useCallback((key: string, fingerprint: string, withPlan: boolean, refresh = false): Promise<TopicTableRead | null> => {
    readFor.current = { key, fingerprint };
    const asked = ++latestRead.current;
    setTable(t => ({ kind: 'reading', previous: t === null ? null : t.kind === 'read' ? t.read : t.previous }));
    return fetchTopicTable(key, withPlan, refresh)
      .then(read => {
        if (asked !== latestRead.current) return null;
        setTable({ kind: 'read', read });
        return read;
      })
      .catch(e => {
        if (asked === latestRead.current) setTable(t => ({ kind: 'failed', note: (e as Error).message, previous: t?.kind === 'read' ? t.read : t?.previous ?? null }));
        return null;
      });
  }, []);

  const topics = useMemo(() => tree?.niches.flatMap(n => n.topics) ?? [], [tree]);
  const chosen = topics.find(t => t.key === chosenKey) ?? null;
  const busy = run.running && run.target?.launchKey === chosenKey;
  const planOpen = panel !== null && panel.launchKey === chosenKey;

  const fingerprintOf = (topic: TreeTopic, t: LaunchesTree): string => JSON.stringify([topic.campaigns, topic.problem, t.platform.version]);

  // A new topic in the address is a new table.
  useEffect(() => {
    setTable(null);
    setPanel(null);
    readFor.current = null;
  }, [chosenKey]);

  // The table follows the disk and the platform: a new fingerprint is a new
  // read — with the plan while the panel is open, since what it offers may
  // have changed — except while this topic's apply runs, whose end is its own read.
  useEffect(() => {
    if (chosen === null || tree === null || busy) return;
    const fingerprint = fingerprintOf(chosen, tree);
    if (readFor.current?.key === chosen.key && readFor.current.fingerprint === fingerprint) return;
    void readTable(chosen.key, fingerprint, planOpen);
  }, [chosen, tree, busy, planOpen, readTable]);

  // When the run stops, what was to be created now exists: read again, plan and all.
  useEffect(() => {
    run.onSettled(() => {
      const target = run.target;
      if (target === null) return;
      readFor.current = null;
      if (chosenKey === target.launchKey) void readTable(target.launchKey, '', true);
    });
    return () => run.onSettled(null);
  }, [run, chosenKey, readTable]);

  const read = table?.kind === 'read' ? table.read : table?.kind === 'reading' || table?.kind === 'failed' ? table.previous : null;
  const outlines = useMemo(() => new Map((read?.plan?.outline ?? []).map(o => [o.name, o])), [read]);

  /** «Оновити план»: the platform read again and the topic's plan counted; the panel opens with the new launches ticked. */
  const refreshPlan = (): void => {
    if (chosen === null || tree === null) return;
    const key = chosen.key;
    setPanel(p => (p !== null && p.launchKey === key ? p : { launchKey: key, ticked: new Set() }));
    void readTable(key, fingerprintOf(chosen, tree), true, true).then(next => {
      if (next === null) return;
      setPanel(p => (p === null || p.launchKey !== key || p.ticked.size > 0 ? p : { launchKey: key, ticked: new Set(launchable(next.table)) }));
    });
  };

  const tick = (campaign: string, on: boolean): void => {
    setPanel(p => {
      if (p === null) return p;
      const ticked = new Set(p.ticked);
      if (on) ticked.add(campaign);
      else ticked.delete(campaign);
      return { ...p, ticked };
    });
  };

  /** A click on a row ticks it in the plan, where the plan offers it. */
  const toggleRow = (campaign: string): void => {
    if (!planOpen) return;
    const o = outlines.get(campaign);
    if (o === undefined || o.steps === 0 || o.errors > 0) return;
    tick(campaign, !panel!.ticked.has(campaign));
  };

  const apply = (): void => {
    if (panel === null || panel.ticked.size === 0) return;
    run.start(panel.launchKey, [...panel.ticked]);
  };

  return (
    <main className="launches">
      <section className="topics">
        <button className="wide import-open" onClick={() => setImporting(true)}>Імпортувати з платформи</button>
        {tree === null && treeNote === '' ? <div className="note">Читаю заливи…</div> : null}
        {treeNote !== '' ? <div className="error">{treeNote}</div> : null}
        {tree?.niches.map(niche => (
          <div className="niche" key={niche.name}>
            <div className="niche-name">{niche.name}</div>
            {niche.topics.map(topic => (
              <TopicItem key={topic.key} topic={topic} chosen={topic.key === chosenKey && !importing} onChoose={() => { setImporting(false); onChoose(topic.key); }} />
            ))}
          </div>
        ))}
        {tree !== null ? (
          <div className="platform-line">
            {tree.platform.note !== null ? <span className="why">платформа: {tree.platform.note}</span>
              : tree.platform.at !== null ? <span className="why">статуси з платформи на {clock(tree.platform.at)}</span> : null}
          </div>
        ) : null}
      </section>

      <section className="table-area">
        {importing ? (
          <ImportView
            onClose={() => setImporting(false)}
            onImported={key => { setImporting(false); look(); onChoose(key); }}
          />
        ) : tree !== null && tree.niches.length === 0 ? (
          <div className="empty wide">
            <b>Заливів ще немає</b>
            <span>Імпортуйте свої топіки з платформи — або попросіть Claude створити новий залив</span>
            <button className="primary" onClick={() => setImporting(true)}>Імпортувати з платформи</button>
          </div>
        ) : chosen === null ? (
          <div className="empty wide">
            <b>Оберіть топік</b>
            <span>Зліва — топіки за нішами; тут — його кампанії по джерелах і кабінетах</span>
          </div>
        ) : (
          <TopicView
            topic={chosen}
            table={table}
            read={read}
            outlines={outlines}
            busy={busy}
            panel={planOpen ? panel : null}
            onRefreshPlan={refreshPlan}
            onRow={toggleRow}
            onOpenBatch={batch => onOpenBatch(chosen.key, batch)}
          />
        )}
      </section>

      <aside className="side">
        {!planOpen || read === null || importing ? (
          <div className="group">
            <div className="lab">План</div>
            <div className="note">Натисніть «Оновити план» на топіку — тут з'явиться, що буде створено на платформі, з галочкою на кожній кампанії. Нічого не відбудеться без кнопки «Залити».</div>
          </div>
        ) : (
          <PlanPanel
            panel={panel!}
            topicName={chosen?.name ?? panel!.launchKey}
            read={read}
            reading={table?.kind === 'reading'}
            outlines={outlines}
            run={run}
            onTick={tick}
            onApply={apply}
            onClose={() => setPanel(null)}
          />
        )}
      </aside>
    </main>
  );
}

const clock = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** A button that puts text on the clipboard and says so for a moment. */
function CopyButton({ text, title }: { text: () => string | null; title: string }) {
  const [done, setDone] = useState(false);
  const copy = (e: React.MouseEvent): void => {
    e.stopPropagation();
    const value = text();
    if (value === null) return;
    navigator.clipboard.writeText(value)
      .then(() => setDone(true))
      .catch(() => setDone(false));
  };
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(timer);
  }, [done]);
  return <button className="link copy" onClick={copy} title={title}>{done ? 'скопійовано' : 'Копіювати'}</button>;
}

// ------------------------------------------------------------- topics --

interface TopicItemProps {
  topic: TreeTopic;
  chosen: boolean;
  onChoose: () => void;
}

function TopicItem({ topic, chosen, onChoose }: TopicItemProps) {
  const total = topic.campaigns.reduce((n, c) => n + c.creatives, 0);
  return (
    <button className={'topic-item' + (chosen ? ' chosen' : '')} onClick={onChoose} title={`тека ${topic.key}`}>
      <span className="nm">{topic.name}</span>
      <span className="cnt">{topic.campaigns.length} камп. · {total} крео</span>
      {topic.problem !== null ? <span className="bad">{forBuyer(topic.problem)}</span> : null}
    </button>
  );
}

// ------------------------------------------------------------- import --

interface ImportViewProps {
  onClose: () => void;
  onImported: (launchKey: string) => void;
}

/** The buyer's topics on the platform that no folder has yet: a box and a folder name each, and one button that imports the ticked. */
function ImportView({ onClose, onImported }: ImportViewProps) {
  const [list, setList] = useState<ImportableRead | null>(null);
  const [note, setNote] = useState('');
  const [topicId, setTopicId] = useState('');
  const [keys, setKeys] = useState<Record<number, string>>({});
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [working, setWorking] = useState(false);
  const [report, setReport] = useState<{ text: string; bad: boolean }[]>([]);

  const load = useCallback((id?: number): void => {
    setNote('');
    fetchImportable(id)
      .then(read => {
        setList(read);
        setKeys(Object.fromEntries(read.topics.map(t => [t.topicId, t.launchKey])));
      })
      .catch(e => setNote((e as Error).message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (): Promise<void> => {
    if (list === null) return;
    setWorking(true);
    setReport([]);
    let first: string | null = null;
    for (const topic of list.topics.filter(t => ticked.has(t.topicId))) {
      const launchKey = (keys[topic.topicId] ?? topic.launchKey).trim();
      try {
        const made = await importTopic(topic.topicId, launchKey);
        first ??= made.launchKey;
        setReport(r => [...r, {
          text: `${topic.name}: імпортовано, кампаній ${made.campaigns.length}${made.notes.length > 0 ? ` · зауваження: ${made.notes.map(forBuyer).join('; ')}` : ''}`,
          bad: false,
        }]);
      } catch (e) {
        setReport(r => [...r, { text: `${topic.name}: ${(e as Error).message}`, bad: true }]);
      }
    }
    setWorking(false);
    setTicked(new Set());
    if (first !== null) {
      load();
      onImported(first);
    }
  };

  return (
    <div className="import-view">
      <div className="table-head">
        <div className="nm">Імпорт з платформи</div>
        <button className="show" onClick={onClose} disabled={working}>Закрити</button>
      </div>
      <div className="note">
        Топік імпортується з ключами, статтями й усіма кампаніями: статуси, бюджети й біди видно одразу. Відео лишаються на платформі —
        нові креативи в кампанії означатимуть перезалив.
      </div>
      {note !== '' ? <div className="error">{note}</div> : null}
      {list === null && note === '' ? <div className="note">Питаю платформу…</div> : null}
      {list !== null && list.needsTopic ? (
        <div className="group">
          <div className="note">Платформа ще не знає, чиї топіки показувати. Впишіть id будь-якого свого топіка з адмінки — за ним знайдуться всі інші.</div>
          <div className="row">
            <input type="text" value={topicId} onChange={e => setTopicId(e.target.value)} placeholder="id топіка, напр. 107567" />
            <button onClick={() => load(Number(topicId))} disabled={!/^\d+$/.test(topicId.trim())}>Знайти мої топіки</button>
          </div>
        </div>
      ) : null}
      {list !== null && list.note ? <div className="warn">платформа: {list.note}</div> : null}
      {list !== null && !list.needsTopic && list.topics.length === 0 ? <div className="note">Усі ваші топіки вже є в заливах.</div> : null}
      {list !== null && list.topics.length > 0 ? (
        <table className="topic-table import-table">
          <thead><tr><th /><th>Топік</th><th>Кампанії</th><th>Тека</th></tr></thead>
          <tbody>
            {list.topics.map(t => (
              <tr key={t.topicId} className={'campaign-row' + (ticked.has(t.topicId) ? ' ticked' : '')}>
                <td>
                  <input
                    type="checkbox"
                    checked={ticked.has(t.topicId)}
                    disabled={working}
                    onChange={e => setTicked(s => { const next = new Set(s); if (e.target.checked) next.add(t.topicId); else next.delete(t.topicId); return next; })}
                  />
                </td>
                <td title={`topic ${t.topicId}`}><span className="nm">{t.name}</span></td>
                <td className="disk">{t.campaigns} · активних {t.active} · реджектів {t.rejected}</td>
                <td>
                  <input type="text" value={keys[t.topicId] ?? t.launchKey} disabled={working} onChange={e => setKeys(k => ({ ...k, [t.topicId]: e.target.value }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {list !== null && list.topics.length > 0 ? (
        <button className="primary import-run" onClick={() => void run()} disabled={working || ticked.size === 0}>
          {working ? 'Імпортую…' : `Імпортувати ${ticked.size}`}
        </button>
      ) : null}
      {report.map((line, i) => <div key={i} className={line.bad ? 'error' : 'note'}>{line.text}</div>)}
    </div>
  );
}

// -------------------------------------------------------------- table --

interface TopicViewProps {
  topic: TreeTopic;
  table: TableState | null;
  read: TopicTableRead | null;
  outlines: Map<string, CampaignOutline>;
  busy: boolean;
  panel: Panel | null;
  onRefreshPlan: () => void;
  onRow: (name: string) => void;
  onOpenBatch: (batch: string) => void;
}

function TopicView({ topic, table, read, outlines, busy, panel, onRefreshPlan, onRow, onOpenBatch }: TopicViewProps) {
  const t = read?.table ?? null;
  const reading = table === null || table.kind === 'reading';
  return (
    <>
      <div className="table-head">
        <div className="nm" title={`тека ${topic.key}${t?.topicId != null ? ` · topic ${t.topicId}` : ''}`}>{topic.name}</div>
        {read !== null ? <CopyButton text={() => topicClipboard(read.table, read.folder)} title="Скопіювати топік і всі кампанії — щоб вставити в чат із Claude" /> : null}
        {topic.ticket !== undefined ? (
          <div className="ticket-line">
            {topic.ticket.url !== null
              ? <a href={topic.ticket.url} target="_blank" rel="noreferrer">тікет у ClickUp ↗</a>
              : <span className="why">тікет: {topic.ticket.note}</span>}
          </div>
        ) : null}
        <button className="show" disabled={busy || read === null || (reading && panel !== null)} onClick={onRefreshPlan} title="Перечитати платформу й порахувати, що буде створено">
          {reading && panel !== null ? 'Рахую план…' : 'Оновити план'}
        </button>
      </div>
      {reading ? <div className="note">{read === null ? 'Читаю топік і статуси з платформи…' : 'Перечитую…'}</div> : null}
      {table?.kind === 'failed' ? <div className="error">{table.note}</div> : null}
      {read !== null && read.planNote !== '' ? <div className="error">план не порахувався: {forBuyer(read.planNote)}</div> : null}
      {read !== null && read.stateNote !== '' ? <div className="error">{forBuyer(read.stateNote)}</div> : null}
      {read !== null && read.plan !== null && read.plan.errors.length > 0 ? <div className="warn">{read.plan.errors.length} помилок у плані топіка — кампанії з помилками підписані в таблиці</div> : null}
      {t !== null && t.problem !== null ? <div className="error">{forBuyer(t.problem)}</div> : null}
      {t !== null && t.platformNote !== null ? <div className="warn">платформа: {t.platformNote}</div> : null}
      {busy ? <div className="note">Іде залив цього топіка — таблиця перечитається, коли він зупиниться.</div> : null}

      {t !== null && read !== null ? (
        <table className="topic-table">
          <thead>
            <tr><th>Кампанія</th><th>Тека</th><th>Залив</th><th>Платформа</th><th /></tr>
          </thead>
          {t.sources.map(source => (
            <tbody key={source.source}>
              <tr className="source-row"><td colSpan={4}>{source.source}</td><td className="tot">{totalsLine(source.totals)}</td></tr>
              {source.accounts.map(account => (
                <AccountRows
                  key={account.alias}
                  account={account}
                  read={read}
                  outlines={outlines}
                  panel={panel}
                  onRow={onRow}
                />
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr className="totals-row">
              <td>Загалом по топіку</td>
              <td colSpan={4}>{totalsLine(t.totals)}</td>
            </tr>
          </tfoot>
        </table>
      ) : null}

      {t !== null ? (
        <div className="sources">
          <div className="lab">Ісходники <span className="val">{t.batches.length}</span></div>
          {t.batches.length === 0 ? <div className="note">Ще жодного експорту в цей топік.</div> : null}
          {t.batches.map(batch => (
            <div className="source-line" key={batch}>
              <code>{batch}</code>
              <button className="link" onClick={() => onOpenBatch(batch)}>відкрити в редакторі</button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

const totalsLine = (t: Totals): string =>
  `${t.campaigns} камп. · залито ${t.built} · активних ${t.active} · реджектів ${t.rejected} · без креативів ${t.withoutCreatives}`;

/** A cabinet by its platform name; the alias and the id are in the tooltip and the copied text. */
const cabinetName = (account: TableAccount): string =>
  account.adAccountName ?? (account.adAccount !== null ? `кабінет ${account.adAccount}` : account.alias);

interface AccountRowsProps {
  account: TableAccount;
  read: TopicTableRead;
  outlines: Map<string, CampaignOutline>;
  panel: Panel | null;
  onRow: (name: string) => void;
}

function AccountRows({ account, read, outlines, panel, onRow }: AccountRowsProps) {
  return (
    <>
      <tr className="account-row">
        <td colSpan={4} title={`${account.alias}${account.adAccount !== null ? ` · кабінет ${account.adAccount}` : ''}`}>{cabinetName(account)}</td>
        <td className="tot">{totalsLine(account.totals)}</td>
      </tr>
      {account.campaigns.length === 0 ? <tr className="campaign-row"><td colSpan={5} className="note">жодної кампанії на цьому кабінеті</td></tr> : null}
      {account.campaigns.map(c => (
        <CampaignRow key={c.name} campaign={c} read={read} outline={outlines.get(c.name)} panel={panel} onRow={onRow} />
      ))}
    </>
  );
}

interface CampaignRowProps {
  campaign: TableCampaign;
  read: TopicTableRead;
  outline: CampaignOutline | undefined;
  panel: Panel | null;
  onRow: (name: string) => void;
}

/** One campaign in three states; with the plan open, a row the plan offers is ticked by a click. */
function CampaignRow({ campaign: c, read, outline, panel, onRow }: CampaignRowProps) {
  const disk = `${c.disk.creatives} крео` + (c.disk.rejected > 0 ? ` · ${c.disk.rejected} відхилених` : '') + (c.disk.script ? ' · скрипт' : ' · без скрипта');
  const offered = panel !== null && outline !== undefined && outline.steps > 0 && outline.errors === 0;
  const ticked = panel?.ticked.has(c.name) === true;
  const ids = [
    `тека ${c.name}`,
    c.platform.builderId !== null ? `builder ${c.platform.builderId}` : null,
    c.platform.campaignId !== null ? `кампанія ${c.platform.campaignId}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <tr className={'campaign-row' + (ticked ? ' ticked' : '') + (offered ? ' offered' : '')} onClick={() => onRow(c.name)}>
      <td title={ids}>
        {offered ? <input type="checkbox" className="row-tick" checked={ticked} readOnly /> : null}
        <span className="nm">{c.platform.campaignName ?? c.name}</span>
        {c.language !== null || c.country !== null ? <span className="key"> {c.language ?? '?'}-{c.country ?? '?'}</span> : null}
      </td>
      <td className={'disk' + (c.disk.problem !== null ? ' bad' : '')} title={c.disk.problem ?? ''}>
        {disk}{c.disk.problem !== null ? <span className="bad"> · {forBuyer(c.disk.problem)}</span> : null}
      </td>
      <td className={'launch ' + c.launch.kind}>{c.launch.label}</td>
      <td className={'platform ' + c.platform.kind}>
        <span>{c.platform.label}</span>
        {c.platform.reason !== null ? <span className="reason" title={c.platform.reason}> · {c.platform.reason}</span> : null}
        {c.platform.budget !== null || c.platform.bid !== null ? (
          <span className="key"> · бюджет {c.platform.budget ?? '?'} · бід {c.platform.bid ?? '?'}</span>
        ) : null}
        {c.platform.url !== null ? (
          <span className="key"> · <a href={c.platform.url} target="_blank" rel="noreferrer" title={ids} onClick={e => e.stopPropagation()}>адмінка ↗</a></span>
        ) : null}
      </td>
      <td className="act">
        <CopyButton text={() => campaignClipboard(read.table, c.name, read.folder)} title="Скопіювати кампанію з топіком і шляхом до теки — щоб вставити в чат із Claude" />
      </td>
    </tr>
  );
}

// --------------------------------------------------------------- plan --

interface PlanPanelProps {
  panel: Panel;
  topicName: string;
  read: TopicTableRead;
  reading: boolean;
  outlines: Map<string, CampaignOutline>;
  run: ApplyRun;
  onTick: (campaign: string, on: boolean) => void;
  onApply: () => void;
  onClose: () => void;
}

/** The plan with a box per campaign, the steps the ticked ones add up to, and the one button that sends them. */
function PlanPanel({ panel, topicName, read, reading, outlines, run, onTick, onApply, onClose }: PlanPanelProps) {
  const plan: PlanDescription | null = read.plan;
  const mine = run.target?.launchKey === panel.launchKey;
  const status = mine ? run.status : null;
  const running = status !== null && status.state === 'running';

  // The campaigns the plan can do anything for, boxes for each; the ticked ones decide the steps shown and the number on the button.
  const offered = [...outlines.values()].filter(o => o.steps > 0 && o.errors === 0);
  const ticked = offered.filter(o => panel.ticked.has(o.name));
  const kept = new Set(ticked.flatMap(o => o.kept));
  const steps = plan === null ? [] : plan.steps.map((step, index) => ({ step, index })).filter(({ index }) => kept.has(index));
  const relaunches = ticked.filter(o => o.relaunch).length;
  const lines = (list: readonly string[]): string[] => list.filter(line => {
    const about = campaignOfLine(line);
    return about === null || panel.ticked.has(about);
  });
  const n = ticked.length;
  const verb = relaunches === n && n > 0 ? `Перезалити ${n}` : relaunches === 0 ? `Залити ${n} ${campaignsWord(n)}` : `Залити ${n} ${campaignsWord(n)} (${relaunches} перезалив)`;

  return (
    <>
      <div className="group">
        <div className="lab">План <span className="val">{topicName}</span></div>
        {plan === null && reading ? <div className="note">Рахую план: питаю платформу…</div>
          : <div className="note nothing-yet">Нічого ще не зроблено. Ось що станеться:</div>}
        <button className="link" onClick={onClose} disabled={running}>закрити план</button>
      </div>

      {plan !== null ? (
        <>
          <div className="group">
            <div className="lab">Кампанії <span className="val">{n} з {offered.length}</span></div>
            {offered.length === 0 ? <div className="note">Заливати нічого: усе вже на платформі, або в кампаніях помилки.</div> : null}
            {offered.map(o => (
              <label className="check" key={o.name}>
                <input type="checkbox" checked={panel.ticked.has(o.name)} disabled={running} onChange={e => onTick(o.name, e.target.checked)} />
                <span>{o.name}</span>
                <span className="why">{o.relaunch ? 'перезалив · ' : ''}{o.steps} кроків</span>
              </label>
            ))}
            {offered.some(o => o.relaunch) ? <div className="note">Перезаливи без галочки за замовчуванням: стара кампанія стане на паузу.</div> : null}
          </div>
          <div className="group">
            <div className="lab">Кроки <span className="val">{steps.length}</span></div>
            {steps.length === 0 ? <div className="note">Нічого робити: поставте галочку на кампанії.</div> : null}
            <ol className="steps">
              {steps.map(({ step, index }) => (
                <li key={index} className={step.kind === 'campaign.pause' ? 'pause' : ''}>
                  {forBuyer(step.label)}
                  {Array.isArray(step['cut']) && (step['cut'] as { file: string; reasons: string[] }[]).length > 0 ? (
                    <ul className="cut">
                      {(step['cut'] as { file: string; reasons: string[] }[]).map(f => (
                        <li key={f.file}>вирізано <code>{f.file}</code>{f.reasons.length > 0 ? ` — ${f.reasons.join(' ')}` : ''}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
          {lines(plan.warnings).length > 0 ? (
            <div className="group">
              <div className="lab">Зауваження</div>
              {lines(plan.warnings).map((line, i) => <div className="warn" key={i}>{forBuyer(line)}</div>)}
            </div>
          ) : null}
          {lines(plan.errors).length > 0 ? (
            <div className="group">
              <div className="lab">Помилки — залив не почнеться</div>
              {lines(plan.errors).map((line, i) => <div className="error" key={i}>{forBuyer(line)}</div>)}
            </div>
          ) : null}
        </>
      ) : !reading ? (
        <div className="group"><div className="error">План не порахувався: {forBuyer(read.planNote)}</div></div>
      ) : null}

      <div className="group">
        {running ? (
          <div className="export-progress">
            <div className="bar"><div className="fill" style={{ width: `${status.total === 0 ? 0 : (status.done / status.total) * 100}%` }} /></div>
            <div className="note">{status.done}/{status.total} · {status.current ? forBuyer(status.current) : 'у черзі'}</div>
            <button className="wide" style={{ marginTop: 8 }} onClick={run.cancel} disabled={status.id === ''}>Скасувати після поточного кроку</button>
          </div>
        ) : null}
        {mine && run.note !== '' && !running ? <div className={run.failed ? 'error' : 'note'}>{forBuyer(run.note)}</div> : null}
        {plan !== null && !running ? (
          <>
            <button className="primary" onClick={onApply} disabled={run.running || n === 0 || steps.length === 0} title={run.running ? 'іде інший залив' : n === 0 ? 'жодної галочки' : ''}>
              {verb} — за живі гроші
            </button>
            {relaunches > 0 ? <div className="note">Нова кампанія — нове посилання: ключі Google стануть на неї від 30 хвилин до доби.</div> : null}
          </>
        ) : null}
      </div>
    </>
  );
}

/** «кампанію», «кампанії», «кампаній» after a number. */
function campaignsWord(n: number): string {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return 'кампаній';
  if (last === 1) return 'кампанію';
  if (last >= 2 && last <= 4) return 'кампанії';
  return 'кампаній';
}
