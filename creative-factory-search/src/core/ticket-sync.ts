// The ticket of a launch, kept in step with its folder. A folder that has a
// manifest gets a ticket; a folder with a built campaign gets its ticket
// raised to «in progress». The rule only ever raises: a buyer who moved the
// ticket forward by hand is not moved back, and «complete» is theirs alone.
// Pure, so the tab can show what the sync would do and the rule is tested
// without a list in sight; the server reads the folders and talks to ClickUp.
import type { LaunchState } from './plan.ts';

/** The names the three statuses carry in the list; overridable in the config when a team names them otherwise. */
export interface TicketStatuses {
  todo: string;
  inProgress: string;
  complete: string;
}

export const DEFAULT_TICKET_STATUSES: TicketStatuses = { todo: 'to do', inProgress: 'in progress', complete: 'complete' };

/** A ticket as the list shows it. */
export interface ListTicket {
  id: string;
  name: string;
  url: string;
  status: string;
}

export interface TicketRef {
  id: string;
  url: string;
}

/** What the sync knows about one folder: its key, whether a campaign was built, and the ticket the state names. */
export interface FolderTicketFacts {
  launchKey: string;
  built: boolean;
  ticket: TicketRef | null;
}

export type TicketAction =
  /** No ticket by this name anywhere: file one. */
  | { kind: 'create'; launchKey: string }
  /** The list has it and the state does not: write the id down. */
  | { kind: 'adopt'; launchKey: string; ticket: TicketRef }
  /** The folder is further along than the ticket says. */
  | { kind: 'status'; launchKey: string; ticket: TicketRef; from: string; to: string };

export interface TicketSyncPlan {
  actions: TicketAction[];
  /** Folder → why nothing could be decided for it. */
  notes: Record<string, string>;
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A campaign that reached the builder is a launched one, whatever the platform later did to it. */
export const builtOf = (state: LaunchState): boolean =>
  Object.values(state.campaigns).some(c => c.builder !== null);

/**
 * The status the ticket should move to, or null to leave it. Raise only:
 * «to do» with a built campaign becomes «in progress»; anything the buyer
 * set beyond that — «in progress» ahead of a build, «complete» — stands.
 */
export function nextStatus(built: boolean, current: string, statuses: TicketStatuses): string | null {
  if (!built) return null;
  if (sameName(current, statuses.todo)) return statuses.inProgress;
  return null;
}

/** The names the list must carry for the rule to have anything to say, or a sentence naming the one it lacks. */
export function checkStatuses(listStatuses: readonly string[], statuses: TicketStatuses): string | null {
  for (const name of [statuses.todo, statuses.inProgress]) {
    if (!listStatuses.some(s => sameName(s, name))) {
      return `у листі немає статусу «${name}» — задайте clickup.statuses у конфігурації або перейменуйте статус`;
    }
  }
  return null;
}

/**
 * One pass over the folders against the list. The ticket is found by name —
 * the launch key — before anything is filed, so a lost state file finds its
 * own ticket rather than making a twin; two tickets by one name is a thing
 * only a person can settle, and is said so.
 */
export function planTicketSync(
  folders: readonly FolderTicketFacts[],
  list: readonly ListTicket[],
  statuses: TicketStatuses,
): TicketSyncPlan {
  const actions: TicketAction[] = [];
  const notes: Record<string, string> = {};
  for (const folder of folders) {
    const byId = folder.ticket === null ? undefined : list.find(t => t.id === folder.ticket!.id);
    const byName = list.filter(t => sameName(t.name, folder.launchKey));
    let found: ListTicket | undefined = byId;
    if (found === undefined) {
      if (byName.length > 1) {
        notes[folder.launchKey] = `у листі кілька тікетів «${folder.launchKey}» — лишіть один`;
        continue;
      }
      found = byName[0];
    }
    if (found === undefined) {
      actions.push({ kind: 'create', launchKey: folder.launchKey });
      continue;
    }
    const ticket = { id: found.id, url: found.url };
    if (folder.ticket === null || folder.ticket.id !== found.id) actions.push({ kind: 'adopt', launchKey: folder.launchKey, ticket });
    const to = nextStatus(folder.built, found.status, statuses);
    if (to !== null) actions.push({ kind: 'status', launchKey: folder.launchKey, ticket, from: found.status, to });
  }
  return { actions, notes };
}
