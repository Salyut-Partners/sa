// The ticket side of a launch. Thin: two calls to ClickUp, and a state that
// says in words why they cannot be made — the same shape as the voice and
// translation modules, so a missing token is something the panel explains
// rather than an error the server starts with.
import type { TicketField, TicketFieldDef } from '../core/launch.ts';
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

export async function createTask(
  state: ClickUpReady,
  name: string,
  fields: TicketField[],
): Promise<Ticket> {
  const body = await call<{ id: string; url: string }>(state.token, `${API}/list/${state.listId}/task`, {
    method: 'POST',
    body: JSON.stringify({ name, custom_fields: fields }),
  });
  return { id: body.id, url: body.url };
}
