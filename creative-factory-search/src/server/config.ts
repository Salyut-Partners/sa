// The buyer's own settings: where launches live, and the tokens that must never
// sit inside the repository. One JSON file under ~/.config/sa, read on demand
// rather than cached, so a token pasted in mid-session is seen by the next call.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TICKET_STATUSES, type TicketStatuses } from '../core/ticket-sync.ts';

export interface SaConfig {
  /** The folder that holds one sub-folder per launch key. */
  launches_root: string;
  clickup: {
    /** The buyer's personal API token, so tickets and comments carry their name. */
    token: string | null;
    /** The list «Заливи» of the buyer's team, where `sa new` files its ticket. */
    list_id: string | null;
    /** What the list calls its three statuses, when not `to do` / `in progress` / `complete`. */
    statuses: TicketStatuses;
  };
  platform: {
    /** The buyer's own Bearer for admin-api.digifor.io — every call goes out as them, from their machine. */
    token: string | null;
    /** The organisation every call carries in its query. */
    organization_id: number | null;
    /** The buyer's own user id on the platform, for the buyer-wide reads; learned from a topic of theirs when not set. */
    user_id: number | null;
    /** Where the admin API lives; overridable for a staging host. */
    base_url: string;
  };
}

export const DEFAULT_PLATFORM_URL = 'https://admin-api.digifor.io/api/admin';

/** Where the file lives. Overridable so tests and a second profile stay apart. */
export const configPath = (): string =>
  process.env['SA_CONFIG'] ?? path.join(os.homedir(), '.config', 'sa', 'config.json');

/**
 * Next to the repository by default — `~/sa/launches` when the workspace is
 * checked out where the PRD puts it, and still inside the mono-repo's
 * `.gitignore` when it is not. Drive, later, is this one value changed in the
 * buyer's config; nothing else knows the path.
 */
export const DEFAULT_LAUNCHES_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'launches',
);

const expandHome = (p: string): string =>
  p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;

const asText = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function loadConfig(): SaConfig {
  let raw: Record<string, unknown> = {};
  const file = configPath();
  if (fs.existsSync(file)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null) raw = parsed as Record<string, unknown>;
    } catch (e) {
      throw new Error(`конфігурація ${file} не читається: ${(e as Error).message}`);
    }
  }
  const section = (name: string): Record<string, unknown> =>
    (typeof raw[name] === 'object' && raw[name] !== null ? raw[name] : {}) as Record<string, unknown>;
  const clickup = section('clickup');
  const platform = section('platform');
  const organization = Number(platform['organization_id']);
  const userId = Number(platform['user_id']);
  return {
    launches_root: expandHome(asText(raw['launches_root']) ?? DEFAULT_LAUNCHES_ROOT),
    clickup: { token: asText(clickup['token']), list_id: asText(clickup['list_id']), statuses: statusesIn(clickup['statuses']) },
    platform: {
      token: asText(platform['token']),
      organization_id: Number.isInteger(organization) && organization > 0 ? organization : null,
      user_id: Number.isInteger(userId) && userId > 0 ? userId : null,
      base_url: (asText(platform['base_url']) ?? DEFAULT_PLATFORM_URL).replace(/\/+$/, ''),
    },
  };
}

function statusesIn(raw: unknown): TicketStatuses {
  const bag = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    todo: asText(bag['todo']) ?? DEFAULT_TICKET_STATUSES.todo,
    inProgress: asText(bag['in_progress']) ?? DEFAULT_TICKET_STATUSES.inProgress,
    complete: asText(bag['complete']) ?? DEFAULT_TICKET_STATUSES.complete,
  };
}

/** The launches folder, created if it is not there yet. */
export function ensureLaunchesRoot(config: SaConfig): string {
  fs.mkdirSync(config.launches_root, { recursive: true });
  return config.launches_root;
}
