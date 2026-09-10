// The launches folder against the ClickUp list, one pass at a time. What to
// do about each folder is `core/ticket-sync`'s decision; this module reads
// the folders, asks the list, carries the decisions out, writes the ticket
// into the folder's state, and remembers a sentence per folder for the tab.
// It runs on a timer, after every apply, and for the folder `sa new` just
// made — never for a folder whose apply is in flight, that job being the
// state file's writer until it stops.
import fs from 'node:fs';
import path from 'node:path';
import { NAME_PLACEHOLDER, parseTopicManifest, resolveTicketFields, type TopicManifest } from '../core/launch.ts';
import { builtOf, checkStatuses, planTicketSync, type FolderTicketFacts, type TicketRef } from '../core/ticket-sync.ts';
import { isApplying, readState, writeState } from './apply.ts';
import { ClickUpError, clickupState, createTask, listFields, listStatuses, listTasks, setTaskStatus } from './clickup.ts';
import type { SaConfig } from './config.ts';
import { existingLaunchKeys, RefusedError } from './launches.ts';

/** What the last pass had to say about a folder's ticket. */
export type TicketReport = { ok: true; id: string; url: string } | { ok: false; note: string };

/** How often the folders are looked at when nothing else asks. */
export const TICKET_SYNC_MS = 10 * 60 * 1000;

const reports = new Map<string, TicketReport>();
export const ticketReport = (launchKey: string): TicketReport | null => reports.get(launchKey) ?? null;

/** Said once per wording, not once per pass: a missing token is the same news ten minutes later. */
let lastSaid = '';
function say(note: string): void {
  if (note === lastSaid) return;
  lastSaid = note;
  console.log(`тікети: ${note}`);
}

interface Folder extends FolderTicketFacts {
  folder: string;
  topic: TopicManifest;
}

/** The folders as facts, and a note for each one that cannot be a fact yet. */
function readFolders(config: SaConfig, keys: readonly string[]): { folders: Folder[]; notes: Record<string, string> } {
  const folders: Folder[] = [];
  const notes: Record<string, string> = {};
  for (const key of keys) {
    const folder = path.join(config.launches_root, key);
    const manifest = path.join(folder, 'topic.yaml');
    if (!fs.existsSync(manifest)) { notes[key] = 'немає topic.yaml — тікета не буде, поки не з\'явиться'; continue; }
    const parsed = parseTopicManifest(fs.readFileSync(manifest, 'utf8'));
    if (!parsed.ok) { notes[key] = `topic.yaml: ${parsed.errors[0]}`; continue; }
    if (isApplying(key)) continue;
    try {
      const state = readState(folder);
      folders.push({ launchKey: key, folder, topic: parsed.value, built: builtOf(state), ticket: state.ticket });
    } catch (e) {
      notes[key] = e instanceof RefusedError ? e.message : (e as Error).message;
    }
  }
  return { folders, notes };
}

function rememberTicket(folder: Folder, ticket: TicketRef): void {
  const state = readState(folder.folder);
  writeState(folder.folder, { ...state, ticket });
}

let inFlight: Promise<void> | null = null;

/**
 * One pass over every folder, or over the one named. Two passes never run at
 * once: a second call waits for the first, then goes, so a `sa new` in the
 * middle of the timer's pass still gets its own answer.
 */
export async function syncTickets(config: SaConfig, only: string | null = null): Promise<Record<string, TicketReport>> {
  while (inFlight !== null) await inFlight.catch(() => undefined);
  const pass = run(config, only);
  inFlight = pass.then(() => undefined, () => undefined);
  try {
    return await pass;
  } finally {
    inFlight = null;
  }
}

async function run(config: SaConfig, only: string | null): Promise<Record<string, TicketReport>> {
  const keys = only === null ? existingLaunchKeys(config.launches_root) : [only];
  const { folders, notes } = readFolders(config, keys);
  for (const [key, note] of Object.entries(notes)) reports.set(key, { ok: false, note });

  const clickup = clickupState(config);
  if (!clickup.ready) {
    say(clickup.note);
    for (const f of folders) reports.set(f.launchKey, { ok: false, note: clickup.note });
    return pick(keys);
  }

  try {
    const [list, statuses] = await Promise.all([listTasks(clickup), listStatuses(clickup)]);
    const statusNote = checkStatuses(statuses, config.clickup.statuses);
    if (statusNote !== null) say(statusNote);
    const planned = planTicketSync(folders, list, config.clickup.statuses);
    for (const [key, note] of Object.entries(planned.notes)) reports.set(key, { ok: false, note });
    const byKey = new Map(folders.map(f => [f.launchKey, f]));
    let defs: Awaited<ReturnType<typeof listFields>> | null = null;

    for (const action of planned.actions) {
      const folder = byKey.get(action.launchKey)!;
      try {
        if (action.kind === 'create') {
          defs ??= await listFields(clickup);
          const fields = resolveTicketFields(defs, {
            launchKey: folder.launchKey,
            ...(folder.topic.name !== NAME_PLACEHOLDER ? { name: folder.topic.name } : {}),
            ...(folder.topic.vertical !== null ? { vertical: folder.topic.vertical } : {}),
            ...(folder.topic.geo.length > 0 ? { geo: folder.topic.geo } : {}),
          });
          if (!fields.ok) { reports.set(folder.launchKey, { ok: false, note: fields.errors.join('; ') + ' — тікет не створено' }); continue; }
          const ticket = await createTask(clickup, folder.launchKey, fields.value);
          rememberTicket(folder, ticket);
          if (folder.built && statusNote === null) await setTaskStatus(clickup, ticket.id, config.clickup.statuses.inProgress);
          reports.set(folder.launchKey, { ok: true, ...ticket });
          console.log(`тікети: ${folder.launchKey} → ${ticket.url}`);
        } else if (action.kind === 'adopt') {
          rememberTicket(folder, action.ticket);
          reports.set(folder.launchKey, { ok: true, ...action.ticket });
        } else {
          if (statusNote !== null) { reports.set(folder.launchKey, { ok: false, note: statusNote }); continue; }
          await setTaskStatus(clickup, action.ticket.id, action.to);
          reports.set(folder.launchKey, { ok: true, ...action.ticket });
          console.log(`тікети: ${folder.launchKey} «${action.from}» → «${action.to}»`);
        }
      } catch (e) {
        const why = e instanceof ClickUpError ? e.message : (e as Error).message;
        reports.set(folder.launchKey, { ok: false, note: why });
        console.error(`тікети: ${folder.launchKey}: ${why}`);
      }
    }
    // A folder the plan had nothing to say about is in step: its ticket stands as the state names it.
    for (const folder of folders) {
      if (!reports.has(folder.launchKey) || planned.actions.every(a => a.launchKey !== folder.launchKey)) {
        if (folder.ticket !== null) reports.set(folder.launchKey, { ok: true, ...folder.ticket });
      }
    }
  } catch (e) {
    const why = e instanceof ClickUpError ? e.message : `ClickUp недоступний: ${(e as Error).message}`;
    say(why);
    for (const f of folders) reports.set(f.launchKey, { ok: false, note: why });
  }
  return pick(keys);
}

function pick(keys: readonly string[]): Record<string, TicketReport> {
  const out: Record<string, TicketReport> = {};
  for (const key of keys) {
    const report = reports.get(key);
    if (report !== undefined) out[key] = report;
  }
  return out;
}

/** The timer: a pass now, and one every ten minutes after, for as long as the server lives. */
export function startTicketSync(load: () => SaConfig, everyMs = TICKET_SYNC_MS): void {
  const tick = (): void => {
    let config: SaConfig;
    try { config = load(); } catch (e) { console.error('тікети:', (e as Error).message); return; }
    syncTickets(config).catch(e => console.error('тікети:', (e as Error).message));
  };
  tick();
  setInterval(tick, everyMs).unref();
}

