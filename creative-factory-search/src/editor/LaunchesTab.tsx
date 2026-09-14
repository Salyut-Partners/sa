import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TreeTopic } from '../core/launches-tree.ts';
import { campaignOfLine, type CampaignOutline } from '../core/plan.ts';
import { launchable, type TableCampaign, type Totals } from '../core/topic-table.ts';
import type { ApplyRun } from './launches.ts';
import { fetchLaunchesTree, fetchTopicTable, type LaunchesTree, type PlanDescription, type TopicTableRead } from './server.ts';

interface Props {
  run: ApplyRun;
  /** Open a batch of a topic in the editor — the table lists the topic's sources. */
  onOpenBatch: (launchKey: string, batch: string) => void;
}

/** How often the disk is looked at again while the tab is open: a folder `sa new` made, or an export's files, show up within this. */
const TREE_POLL_MS = 3000;

/** A topic's table, as fetched when it is opened: on its way, read, or why it could not be. */
type TableState =
  | { kind: 'reading'; previous: TopicTableRead | null }
  | { kind: 'read'; read: TopicTableRead }
  | { kind: 'failed'; note: string; previous: TopicTableRead | null };

/** What the side panel is showing: the plan for a set of campaigns of the chosen topic, ticked by the buyer. */
interface Panel {
  launchKey: string;
  /** Whether the plan was opened as a relaunch — the words on the button. */
  relaunch: boolean;
  ticked: Set<string>;
}

/**
 * The launches as a table the buyer works from instead of a terminal. On the
 * left the topics; for the chosen one, source → cabinet → campaigns, each in
 * three states — the folder, the launch, the platform — and a totals row.
 * «Що буде залито» opens the plan with a box per campaign; only «Залити N»
 * at the bottom of it, under the words «за живі гроші», sends anything. The
 * table is read again by itself when the folder changed or the platform
 * answered anew; there is no button for it.
 */
export function LaunchesTab({ run, onOpenBatch }: Props) {
  const [tree, setTree] = useState<LaunchesTree | null>(null);
  const [treeNote, setTreeNote] = useState('');
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [table, setTable] = useState<TableState | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  /** What the table was last read for: the topic's disk listing and the platform's version. A change is a reason to read again. */
  const readFor = useRef<{ key: string; fingerprint: string } | null>(null);

  useEffect(() => {
    let stale = false;
    const look = (): void => {
      fetchLaunchesTree()
        .then(next => { if (!stale) { setTree(next); setTreeNote(''); } })
        .catch(e => { if (!stale) setTreeNote((e as Error).message); });
    };
    look();
    const timer = setInterval(look, TREE_POLL_MS);
    return () => { stale = true; clearInterval(timer); };
  }, []);

  const readTable = useCallback((key: string, fingerprint: string) => {
    readFor.current = { key, fingerprint };
    setTable(t => ({ kind: 'reading', previous: t === null ? null : t.kind === 'read' ? t.read : t.previous }));
    fetchTopicTable(key)
      .then(read => { if (readFor.current?.key === key) setTable({ kind: 'read', read }); })
      .catch(e => { if (readFor.current?.key === key) setTable(t => ({ kind: 'failed', note: (e as Error).message, previous: t?.kind === 'read' ? t.read : t?.previous ?? null })); });
  }, []);

  const topics = useMemo(() => tree?.niches.flatMap(n => n.topics) ?? [], [tree]);
  const chosen = topics.find(t => t.key === chosenKey) ?? null;
  const busy = run.running && run.target?.launchKey === chosenKey;

  // The table follows the disk and the platform: the tree's listing of the
  // chosen topic and the platform's version make a fingerprint, and a new one
  // is a new read — except while this topic's apply runs, whose end is its own read.
  useEffect(() => {
    if (chosen === null || tree === null || busy) return;
    const fingerprint = JSON.stringify([chosen.campaigns, chosen.problem, tree.platform.version]);
    if (readFor.current?.key === chosen.key && readFor.current.fingerprint === fingerprint) return;
    readTable(chosen.key, fingerprint);
  }, [chosen, tree, busy, readTable]);

  // When the run stops, what was to be created now exists: read again.
  useEffect(() => {
    run.onSettled(() => {
      const target = run.target;
      if (target === null) return;
      readFor.current = null;
      if (chosenKey === target.launchKey) readTable(target.launchKey, '');
    });
    return () => run.onSettled(null);
  }, [run, chosenKey, readTable]);

  const choose = (key: string): void => {
    if (key === chosenKey) return;
    setChosenKey(key);
    setTable(null);
    setPanel(null);
    readFor.current = null;
  };

  const read = table?.kind === 'read' ? table.read : table?.kind === 'reading' || table?.kind === 'failed' ? table.previous : null;
  const outlines = useMemo(() => new Map((read?.plan?.outline ?? []).map(o => [o.name, o])), [read]);

  /** Open the plan panel with these campaigns ticked. */
  const show = (launchKey: string, campaigns: readonly string[], relaunch: boolean): void => {
    setPanel({ launchKey, relaunch, ticked: new Set(campaigns) });
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

  const apply = (): void => {
    if (panel === null || panel.ticked.size === 0) return;
    run.start(panel.launchKey, [...panel.ticked]);
  };

  return (
    <main className="launches">
      <section className="topics">
        {tree === null && treeNote === '' ? <div className="note">Читаю теку заливів…</div> : null}
        {treeNote !== '' ? <div className="error">{treeNote}</div> : null}
        {tree !== null && tree.niches.length === 0 ? (
          <div className="empty">
            <b>Заливів ще немає</b>
            <span>Створіть перший: <code>sa new &lt;launch-key&gt;</code> — тека з'явиться тут сама</span>
          </div>
        ) : null}
        {tree?.niches.map(niche => (
          <div className="niche" key={niche.name}>
            <div className="niche-name">{niche.name}</div>
            {niche.topics.map(topic => (
              <TopicItem key={topic.key} topic={topic} chosen={topic.key === chosenKey} onChoose={() => choose(topic.key)} />
            ))}
          </div>
        ))}
        {tree !== null ? (
          <div className="platform-line">
            {tree.platform.note !== null ? <span className="why">платформа: {tree.platform.note}</span>
              : tree.platform.at !== null ? <span className="why">платформа опитана о {clock(tree.platform.at)}</span> : null}
          </div>
        ) : null}
      </section>

      <section className="table-area">
        {chosen === null ? (
          <div className="empty wide">
            <b>Оберіть топік</b>
            <span>Зліва — топіки за нішами; тут — його кампанії по джерелах і кабінетах, у трьох станах</span>
          </div>
        ) : (
          <TopicView
            topic={chosen}
            table={table}
            read={read}
            outlines={outlines}
            busy={busy}
            panel={panel}
            onShowTopic={() => read !== null && show(chosen.key, launchable(read.table), false)}
            onShowCampaign={(name, relaunch) => show(chosen.key, [name], relaunch)}
            onOpenBatch={batch => onOpenBatch(chosen.key, batch)}
          />
        )}
      </section>

      <aside className="side">
        {panel === null || panel.launchKey !== chosenKey || read === null ? (
          <div className="group">
            <div className="lab">План</div>
            <div className="note">Натисніть «Що буде залито» на топіку або на кампанії — тут з'явиться план, той самий, що друкує <code>sa plan</code>, з галочками. Нічого не робиться без «Залити N».</div>
          </div>
        ) : (
          <PlanPanel panel={panel} read={read} outlines={outlines} run={run} onTick={tick} onApply={apply} />
        )}
      </aside>
    </main>
  );
}

const clock = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ------------------------------------------------------------- topics --

interface TopicItemProps {
  topic: TreeTopic;
  chosen: boolean;
  onChoose: () => void;
}

function TopicItem({ topic, chosen, onChoose }: TopicItemProps) {
  const total = topic.campaigns.reduce((n, c) => n + c.creatives, 0);
  return (
    <button className={'topic-item' + (chosen ? ' chosen' : '')} onClick={onChoose} title={topic.key}>
      <span className="nm">{topic.name}</span>
      <span className="key">{topic.key}</span>
      <span className="cnt">{topic.campaigns.length} камп. · {total} крео</span>
      {topic.problem !== null ? <span className="bad">{topic.problem}</span> : null}
    </button>
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
  onShowTopic: () => void;
  onShowCampaign: (name: string, relaunch: boolean) => void;
  onOpenBatch: (batch: string) => void;
}

function TopicView({ topic, table, read, outlines, busy, panel, onShowTopic, onShowCampaign, onOpenBatch }: TopicViewProps) {
  const t = read?.table ?? null;
  const ready = t !== null ? launchable(t).length : 0;
  return (
    <>
      <div className="table-head">
        <div className="nm">{topic.name} <span className="key">{topic.key}</span></div>
        {topic.ticket !== undefined ? (
          <div className="ticket-line">
            {topic.ticket.url !== null
              ? <a href={topic.ticket.url} target="_blank" rel="noreferrer">тікет у ClickUp ↗</a>
              : <span className="why">тікет: {topic.ticket.note}</span>}
          </div>
        ) : null}
        <button className="show" disabled={busy || ready === 0 || read === null} onClick={onShowTopic} title={ready === 0 ? 'немає незібраних кампаній із планом' : ''}>
          Що буде залито{ready > 0 ? ` (${ready})` : ''}
        </button>
      </div>
      {table === null || table.kind === 'reading' ? <div className="note">{read === null ? 'Читаю теку й питаю платформу…' : 'Перечитую…'}</div> : null}
      {table?.kind === 'failed' ? <div className="error">{table.note}</div> : null}
      {read !== null && read.planNote !== '' ? <div className="error">план не прочитався: {read.planNote}</div> : null}
      {read !== null && read.stateNote !== '' ? <div className="error">{read.stateNote}</div> : null}
      {read !== null && read.plan !== null && read.plan.errors.length > 0 ? <div className="warn">{read.plan.errors.length} помилок у плані топіка — кампанії з помилками підписані в таблиці</div> : null}
      {t !== null && t.problem !== null ? <div className="error">{t.problem}</div> : null}
      {t !== null && t.platformNote !== null ? <div className="warn">платформа: {t.platformNote}</div> : null}
      {busy ? <div className="note">Іде залив цього топіка — таблиця перечитається, коли він зупиниться.</div> : null}

      {t !== null ? (
        <table className="topic-table">
          <thead>
            <tr><th>Кампанія</th><th>Диск</th><th>Залив</th><th>Платформа</th><th /></tr>
          </thead>
          {t.sources.map(source => (
            <tbody key={source.source}>
              <tr className="source-row"><td colSpan={4}>{source.source}</td><td className="tot">{totalsLine(source.totals)}</td></tr>
              {source.accounts.map(account => (
                <AccountRows
                  key={account.alias}
                  alias={account.alias}
                  adAccount={account.adAccount}
                  campaigns={account.campaigns}
                  totals={account.totals}
                  outlines={outlines}
                  busy={busy}
                  ticked={panel?.ticked ?? null}
                  onShow={onShowCampaign}
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
              <code>sources/{batch}</code>
              <button className="link" onClick={() => onOpenBatch(batch)}>відкрити в редакторі</button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

const totalsLine = (t: Totals): string =>
  `${t.campaigns} камп. · зібрано ${t.built} · активних ${t.active} · реджектів ${t.rejected} · без креативів ${t.withoutCreatives}`;

interface AccountRowsProps {
  alias: string;
  adAccount: string | null;
  campaigns: TableCampaign[];
  totals: Totals;
  outlines: Map<string, CampaignOutline>;
  busy: boolean;
  ticked: Set<string> | null;
  onShow: (name: string, relaunch: boolean) => void;
}

function AccountRows({ alias, adAccount, campaigns, totals, busy, ticked, onShow }: AccountRowsProps) {
  return (
    <>
      <tr className="account-row">
        <td colSpan={4}>{alias}{adAccount !== null ? <span className="key"> · кабінет {adAccount}</span> : null}</td>
        <td className="tot">{totalsLine(totals)}</td>
      </tr>
      {campaigns.length === 0 ? <tr className="campaign-row"><td colSpan={5} className="note">жодної кампанії на цьому кабінеті</td></tr> : null}
      {campaigns.map(c => <CampaignRow key={c.name} campaign={c} busy={busy} ticked={ticked?.has(c.name) === true} onShow={onShow} />)}
    </>
  );
}

interface CampaignRowProps {
  campaign: TableCampaign;
  busy: boolean;
  ticked: boolean;
  onShow: (name: string, relaunch: boolean) => void;
}

/** One campaign in three states, and the one button its launch state allows — «Що буде перезалито» only where the plan sees a difference. */
function CampaignRow({ campaign: c, busy, ticked, onShow }: CampaignRowProps) {
  const disk = `${c.disk.creatives} крео` + (c.disk.rejected > 0 ? ` · ${c.disk.rejected} у rejected` : '') + (c.disk.script ? ' · скрипт' : ' · без скрипта');
  const offer = c.launch.kind === 'unbuilt' && c.launch.steps > 0 ? 'launch' : c.launch.kind === 'relaunch' ? 'relaunch' : null;
  return (
    <tr className={'campaign-row' + (ticked ? ' ticked' : '')}>
      <td>
        <span className="nm">{c.name}</span>
        {c.language !== null || c.country !== null ? <span className="key"> {c.language ?? '?'}-{c.country ?? '?'}</span> : null}
      </td>
      <td className={'disk' + (c.disk.problem !== null ? ' bad' : '')} title={c.disk.problem ?? ''}>
        {disk}{c.disk.problem !== null ? <span className="bad"> · {c.disk.problem}</span> : null}
      </td>
      <td className={'launch ' + c.launch.kind}>{c.launch.label}</td>
      <td className={'platform ' + c.platform.kind}>
        <span>{c.platform.label}</span>
        {c.platform.reason !== null ? <span className="reason" title={c.platform.reason}> · {c.platform.reason}</span> : null}
        {c.platform.budget !== null || c.platform.bid !== null ? (
          <span className="key"> · бюджет {c.platform.budget ?? '?'} · бід {c.platform.bid ?? '?'}</span>
        ) : null}
        {c.platform.url !== null ? (
          <span className="key"> · builder {c.platform.builderId}{c.platform.campaignId !== null ? ` · кампанія ${c.platform.campaignId}` : ''} <a href={c.platform.url} target="_blank" rel="noreferrer">адмінка ↗</a></span>
        ) : null}
      </td>
      <td className="act">
        {offer !== null ? (
          <button className={offer} disabled={busy} onClick={() => onShow(c.name, offer === 'relaunch')}>
            {offer === 'relaunch' ? 'Що буде перезалито' : 'Що буде залито'}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

// --------------------------------------------------------------- plan --

interface PlanPanelProps {
  panel: Panel;
  read: TopicTableRead;
  outlines: Map<string, CampaignOutline>;
  run: ApplyRun;
  onTick: (campaign: string, on: boolean) => void;
  onApply: () => void;
}

/** The plan with a box per campaign, the steps the ticked ones add up to, and the one button that sends them. */
function PlanPanel({ panel, read, outlines, run, onTick, onApply }: PlanPanelProps) {
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
        <div className="lab">{panel.relaunch ? 'Перезалив' : 'Залив'} <span className="val">{panel.launchKey}</span></div>
        <div className="note nothing-yet">Нічого ще не зроблено. Ось що станеться:</div>
      </div>

      <div className="group">
        <div className="lab">Кампанії <span className="val">{n} з {offered.length}</span></div>
        {offered.length === 0 ? <div className="note">План не пропонує жодної кампанії: усе вже на платформі, або теки з помилками.</div> : null}
        {offered.map(o => (
          <label className="check" key={o.name}>
            <input type="checkbox" checked={panel.ticked.has(o.name)} disabled={running} onChange={e => onTick(o.name, e.target.checked)} />
            <span>{o.name}</span>
            <span className="why">{o.relaunch ? 'перезалив · ' : ''}{o.steps} кроків</span>
          </label>
        ))}
      </div>

      {plan !== null ? (
        <>
          <div className="group">
            <div className="lab">Кроки <span className="val">{steps.length}</span></div>
            {steps.length === 0 ? <div className="note">Нічого робити: поставте галочку на кампанії.</div> : null}
            <ol className="steps">
              {steps.map(({ step, index }) => (
                <li key={index} className={step.kind === 'campaign.pause' ? 'pause' : ''}>
                  {step.label}
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
              {lines(plan.warnings).map((line, i) => <div className="warn" key={i}>{line}</div>)}
            </div>
          ) : null}
          {lines(plan.errors).length > 0 ? (
            <div className="group">
              <div className="lab">Помилки — apply відмовиться</div>
              {lines(plan.errors).map((line, i) => <div className="error" key={i}>{line}</div>)}
            </div>
          ) : null}
        </>
      ) : (
        <div className="group"><div className="error">План не прочитався: {read.planNote}</div></div>
      )}

      <div className="group">
        {running ? (
          <div className="export-progress">
            <div className="bar"><div className="fill" style={{ width: `${status.total === 0 ? 0 : (status.done / status.total) * 100}%` }} /></div>
            <div className="note">{status.done}/{status.total} · {status.current || 'у черзі'}</div>
            <button className="wide" style={{ marginTop: 8 }} onClick={run.cancel} disabled={status.id === ''}>Скасувати після поточного кроку</button>
          </div>
        ) : null}
        {mine && run.note !== '' && !running ? <div className={run.failed ? 'error' : 'note'}>{run.note}</div> : null}
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
