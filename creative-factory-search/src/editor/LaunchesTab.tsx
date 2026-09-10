import { useCallback, useEffect, useState } from 'react';
import type { TreeCampaign, TreeTopic } from '../core/launches-tree.ts';
import type { CampaignOutline } from '../core/plan.ts';
import type { ApplyRun } from './launches.ts';
import { fetchLaunchesTree, fetchPlan, type LaunchesTree, type PlanDescription } from './server.ts';

interface Props {
  run: ApplyRun;
}

/** How often the disk is looked at again while the tab is open: a folder `sa new` made shows up within this. */
const TREE_POLL_MS = 3000;

/** A topic's whole plan, as fetched when it is opened: on its way, read, or why it could not be. */
type TopicPlan =
  | { kind: 'reading' }
  | { kind: 'read'; outline: CampaignOutline[]; note: string }
  | { kind: 'failed'; note: string };

/** The word on the button: what the plan is going to do to the campaign. */
const verb = (relaunch: boolean, capital = true): string => (relaunch ? (capital ? 'Перезалити' : 'перезалити') : (capital ? 'Залити' : 'залити'));

/** What the side panel is showing: one campaign's plan, waiting for it, or the sentence why there is none. */
interface Chosen {
  launchKey: string;
  campaign: string;
  plan: PlanDescription | null;
  note: string;
  /** The buyer has read the plan and pressed the button once; the second press applies. */
  confirming: boolean;
}

/**
 * The launches, as a tree the buyer works from instead of a terminal. The
 * tree is the disk; opening a topic asks the server for its plan, which is
 * what says whether a campaign is to be launched or relaunched; pressing
 * the button shows that campaign's plan — the same `sa plan` prints — and
 * only a second press, on the plan, applies it.
 */
export function LaunchesTab({ run }: Props) {
  const [tree, setTree] = useState<LaunchesTree | null>(null);
  const [treeNote, setTreeNote] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [plans, setPlans] = useState<Record<string, TopicPlan>>({});
  const [chosen, setChosen] = useState<Chosen | null>(null);

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

  /** The topic's plan, fetched again from scratch: after an apply, or on request. */
  const planTopic = useCallback((key: string) => {
    setPlans(p => ({ ...p, [key]: { kind: 'reading' } }));
    fetchPlan(key, null)
      .then(plan => setPlans(p => ({
        ...p,
        [key]: { kind: 'read', outline: plan.outline, note: plan.errors.length > 0 ? `${plan.errors.length} помилок у плані топіка` : '' },
      })))
      .catch(e => setPlans(p => ({ ...p, [key]: { kind: 'failed', note: (e as Error).message } })));
  }, []);

  const toggle = (key: string): void => {
    const opening = !open.has(key);
    setOpen(set => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // The fetch is outside the updater: React may run an updater twice, and the platform should be asked once.
    if (opening && plans[key] === undefined) planTopic(key);
  };

  const choose = (launchKey: string, campaign: string): void => {
    setChosen({ launchKey, campaign, plan: null, note: '', confirming: false });
    fetchPlan(launchKey, campaign)
      .then(plan => setChosen(c => (c !== null && c.launchKey === launchKey && c.campaign === campaign ? { ...c, plan } : c)))
      .catch(e => setChosen(c => (c !== null && c.launchKey === launchKey && c.campaign === campaign ? { ...c, note: (e as Error).message } : c)));
  };

  // When the run stops, the topic's plan is stale: what was to be created now exists.
  useEffect(() => {
    run.onSettled(() => {
      const target = run.target;
      if (target === null) return;
      planTopic(target.launchKey);
      if (target.campaign !== null) choose(target.launchKey, target.campaign);
    });
    return () => run.onSettled(null);
  }, [run, planTopic]);

  const apply = (): void => {
    if (chosen === null || chosen.plan === null) return;
    if (!chosen.confirming) { setChosen({ ...chosen, confirming: true }); return; }
    setChosen({ ...chosen, confirming: false });
    run.start(chosen.launchKey, chosen.campaign);
  };

  return (
    <main className="launches">
      <section className="tree">
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
              <TopicRow
                key={topic.key}
                topic={topic}
                open={open.has(topic.key)}
                plan={plans[topic.key]}
                chosen={chosen?.launchKey === topic.key ? chosen.campaign : null}
                busy={run.running && run.target?.launchKey === topic.key}
                onToggle={() => toggle(topic.key)}
                onReplan={() => {
                  planTopic(topic.key);
                  // The side panel is a plan too: read again, or it keeps saying what was true before the button.
                  if (chosen?.launchKey === topic.key) choose(topic.key, chosen.campaign);
                }}
                onChoose={campaign => choose(topic.key, campaign)}
              />
            ))}
          </div>
        ))}
      </section>

      <aside className="side">
        {chosen === null ? (
          <div className="group">
            <div className="lab">План</div>
            <div className="note">Відкрийте топік і натисніть «Залити» або «Перезалити» на кампанії — тут з'явиться план, той самий, що друкує <code>sa plan</code>. Нічого не робиться без підтвердження.</div>
          </div>
        ) : (
          <PlanPanel chosen={chosen} run={run} onApply={apply} onBack={() => setChosen({ ...chosen, confirming: false })} />
        )}
      </aside>
    </main>
  );
}

interface TopicRowProps {
  topic: TreeTopic;
  open: boolean;
  plan: TopicPlan | undefined;
  chosen: string | null;
  busy: boolean;
  onToggle: () => void;
  onReplan: () => void;
  onChoose: (campaign: string) => void;
}

function TopicRow({ topic, open, plan, chosen, busy, onToggle, onReplan, onChoose }: TopicRowProps) {
  const total = topic.campaigns.reduce((n, c) => n + c.creatives, 0);
  return (
    <div className={'topic' + (open ? ' open' : '')}>
      <button className="topic-head" onClick={onToggle} title={topic.key}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        <span className="nm">{topic.name}</span>
        <span className="key">{topic.key}</span>
        <span className="cnt">{topic.campaigns.length} камп. · {total} крео</span>
      </button>
      {topic.problem !== null ? <div className="error">{topic.problem}</div> : null}
      {topic.ticket !== undefined ? (
        <div className="ticket-line">
          {topic.ticket.url !== null
            ? <a href={topic.ticket.url} target="_blank" rel="noreferrer">тікет у ClickUp ↗</a>
            : <span className="why">тікет: {topic.ticket.note}</span>}
        </div>
      ) : null}
      {open ? (
        <div className="campaigns">
          {plan === undefined || plan.kind === 'reading' ? <div className="note">Питаю платформу…</div> : null}
          {plan?.kind === 'failed' ? (
            <div className="error">{plan.note}<button className="link" onClick={onReplan}>спробувати ще</button></div>
          ) : null}
          {plan?.kind === 'read' && plan.note !== '' ? <div className="note">{plan.note}</div> : null}
          {topic.campaigns.length === 0 ? <div className="note">У campaigns/ ще нічого немає.</div> : null}
          {topic.campaigns.map(c => (
            <CampaignRow
              key={c.name}
              campaign={c}
              outline={plan?.kind === 'read' ? plan.outline.find(o => o.name === c.name) ?? null : null}
              waiting={plan === undefined || plan.kind === 'reading'}
              chosen={chosen === c.name}
              busy={busy}
              onChoose={() => onChoose(c.name)}
            />
          ))}
          {plan?.kind === 'read' ? <button className="link" onClick={onReplan}>оновити план</button> : null}
        </div>
      ) : null}
    </div>
  );
}

interface CampaignRowProps {
  campaign: TreeCampaign;
  outline: CampaignOutline | null;
  waiting: boolean;
  chosen: boolean;
  busy: boolean;
  onChoose: () => void;
}

/** One campaign: what is in its folder, and the one button the plan allows — «Перезалити» only where the plan sees a difference. */
function CampaignRow({ campaign, outline, waiting, chosen, busy, onChoose }: CampaignRowProps) {
  const files = `${campaign.creatives} крео` + (campaign.rejected > 0 ? ` · ${campaign.rejected} у rejected` : '');
  const label = verb(outline?.relaunch === true);
  const disabled = busy || waiting || outline === null || campaign.creatives === 0 || outline.errors > 0 || outline.steps === 0;
  const why = waiting ? 'план ще читається'
    : campaign.creatives === 0 ? 'немає жодного mp4 — нема чого заливати'
    : outline === null ? 'план не прочитався'
    : outline.errors > 0 ? `${outline.errors} помилок у плані — виправте теку`
    : outline.steps === 0 ? 'на платформі вже все є'
    : busy ? 'іде залив цього топіка'
    : '';
  return (
    <div className={'campaign' + (chosen ? ' chosen' : '')}>
      <span className="nm">{campaign.name}</span>
      <span className="files">{files}{!campaign.manifest ? ' · без campaign.yaml' : ''}</span>
      <span className="why">{why}</span>
      <button className={outline?.relaunch ? 'relaunch' : ''} disabled={disabled} onClick={onChoose} title={why}>
        {label}
      </button>
    </div>
  );
}

interface PlanPanelProps {
  chosen: Chosen;
  run: ApplyRun;
  onApply: () => void;
  onBack: () => void;
}

/** The plan of one campaign, the button under it, and the run's progress once it is pressed. */
function PlanPanel({ chosen, run, onApply, onBack }: PlanPanelProps) {
  const plan = chosen.plan;
  const mine = run.target?.launchKey === chosen.launchKey && run.target.campaign === chosen.campaign;
  const relaunch = plan?.outline.find(o => o.name === chosen.campaign)?.relaunch === true;
  const status = mine ? run.status : null;
  return (
    <>
      <div className="group">
        <div className="lab">{relaunch ? 'Перезалив' : 'Залив'} <span className="val">{chosen.launchKey} / {chosen.campaign}</span></div>
        {plan === null && chosen.note === '' ? <div className="note">Питаю платформу…</div> : null}
        {chosen.note !== '' ? <div className="error">{chosen.note}</div> : null}
      </div>

      {plan !== null ? (
        <>
          <div className="group">
            <div className="lab">Кроки <span className="val">{plan.steps.length}</span></div>
            {plan.steps.length === 0 ? <div className="note">Нічого робити: на платформі вже все є.</div> : null}
            <ol className="steps">
              {plan.steps.map((step, i) => <li key={i} className={step.kind === 'campaign.pause' ? 'pause' : ''}>{step.label}</li>)}
            </ol>
          </div>
          {plan.warnings.length > 0 ? (
            <div className="group">
              <div className="lab">Зауваження</div>
              {plan.warnings.map((line, i) => <div className="warn" key={i}>{line}</div>)}
            </div>
          ) : null}
          {plan.errors.length > 0 ? (
            <div className="group">
              <div className="lab">Помилки — apply відмовиться</div>
              {plan.errors.map((line, i) => <div className="error" key={i}>{line}</div>)}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="group">
        {status !== null && status.state === 'running' ? (
          <div className="export-progress">
            <div className="bar"><div className="fill" style={{ width: `${status.total === 0 ? 0 : (status.done / status.total) * 100}%` }} /></div>
            <div className="note">{status.done}/{status.total} · {status.current || 'у черзі'}</div>
            <button className="wide" style={{ marginTop: 8 }} onClick={run.cancel} disabled={status.id === ''}>Скасувати після поточного кроку</button>
          </div>
        ) : null}
        {mine && run.note !== '' && (status === null || status.state !== 'running') ? (
          <div className={run.failed ? 'error' : 'note'}>{run.note}</div>
        ) : null}
        {plan !== null && plan.errors.length === 0 && plan.steps.length > 0 && !(status !== null && status.state === 'running') ? (
          chosen.confirming ? (
            <>
              <button className="primary" onClick={onApply} disabled={run.running}>
                Підтверджую: {verb(relaunch, false)} — {plan.steps.length} кроків за живі гроші
              </button>
              <button className="wide" style={{ marginTop: 8 }} onClick={onBack}>Ні, ще подивлюсь</button>
            </>
          ) : (
            <button className="primary" onClick={onApply} disabled={run.running} title={run.running ? 'іде інший залив' : ''}>
              {verb(relaunch)} {chosen.campaign}
            </button>
          )
        ) : null}
        {relaunch && plan !== null ? (
          <div className="note">Нова кампанія — нове посилання: ключі Google стануть на неї від 30 хвилин до доби.</div>
        ) : null}
      </div>
    </>
  );
}
