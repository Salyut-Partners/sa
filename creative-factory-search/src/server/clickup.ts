// The ticket side of a launch. Thin: a handful of calls to ClickUp, and a state that
// says in words why they cannot be made — the same shape as the voice and
// translation modules, so a missing token is something the panel explains
// rather than an error the server starts with.
import type { TicketField, TicketFieldDef } from '../core/launch.ts';
import type { ListTicket } from '../core/ticket-sync.ts';
import type { SaConfig } from './config.ts';

const API = 'https://api.clickup.com/api/v2';

export type ClickUpReady = { ready: true; token: string; listId: string };
export type ClickUpState = ClickUpReady | { ready: false; note: string };

export function clickupState(config: SaConfig): ClickUpState {
  const { token, list_id: listId } = config.clickup;
  if (token === null && listId === null) {
    return { ready: false, note: 'у конфігурації немає clickup.token і clickup.list_id — тікет не створено' };
  }
  if (token === null) return { ready: false, note: 'у конфігурації немає clickup.token — тікет не створено' };
  if (listId === null) return { ready: false, note: 'у конфігурації немає clickup.list_id — тікет не створено' };
  return { ready: true, token, listId };
}

export class ClickUpError extends Error {}

async function call<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: token, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ClickUpError(`ClickUp відповів ${response.status}: ${body.slice(0, 200)}`);
  }
  return await response.json() as T;
}

/** The custom fields the list carries — what `resolveTicketFields` matches against. */
export async function listFields(state: ClickUpReady): Promise<TicketFieldDef[]> {
  const body = await call<{ fields?: TicketFieldDef[] }>(state.token, `${API}/list/${state.listId}/field`);
  return body.fields ?? [];
}

export interface Ticket {
  id: string;
  url: string;
}

/** Every task of the list, closed ones included: the sync finds a folder's ticket by name among them. */
export async function listTasks(state: ClickUpReady): Promise<ListTicket[]> {
  const tickets: ListTicket[] = [];
  for (let page = 0; page < 50; page++) {
    const body = await call<{ tasks?: { id: string; name: string; url: string; status?: { status?: string } }[]; last_page?: boolean }>(
      state.token, `${API}/list/${state.listId}/task?include_closed=true&page=${page}`,
    );
    for (const t of body.tasks ?? []) tickets.push({ id: t.id, name: t.name, url: t.url, status: t.status?.status ?? '' });
    if (body.last_page !== false || (body.tasks ?? []).length === 0) break;
  }
  return tickets;
}

/** The names of the list's statuses, as the buyer typed them. */
export async function listStatuses(state: ClickUpReady): Promise<string[]> {
  const body = await call<{ statuses?: { status: string }[] }>(state.token, `${API}/list/${state.listId}`);
  return (body.statuses ?? []).map(s => s.status);
}

export async function setTaskStatus(state: ClickUpReady, taskId: string, status: string): Promise<void> {
  await call(state.token, `${API}/task/${taskId}`, { method: 'PUT', body: JSON.stringify({ status }) });
}

/**
 * Whose token this is. Each buyer pastes their own, so the task a machine files
 * is assigned to the person sitting at it — nothing has to be configured, and a
 * ticket never lands in the list with nobody on it.
 */
export async function me(state: ClickUpReady): Promise<number | null> {
  const body = await call<{ user?: { id?: number } }>(state.token, `${API}/user`);
  const id = body.user?.id;
  return typeof id === 'number' && Number.isInteger(id) ? id : null;
}

export async function createTask(
  state: ClickUpReady,
  name: string,
  fields: TicketField[],
  assignees: readonly number[] = [],
): Promise<Ticket> {
  const body = await call<{ id: string; url: string }>(state.token, `${API}/list/${state.listId}/task`, {
    method: 'POST',
    body: JSON.stringify({ name, custom_fields: fields, ...(assignees.length > 0 ? { assignees: [...assignees] } : {}) }),
  });
  return { id: body.id, url: body.url };
}
