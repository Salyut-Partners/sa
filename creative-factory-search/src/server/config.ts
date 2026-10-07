// The buyer's own settings: where sources go, the launch defaults they
// override, and the platform token that must never sit inside the repository. One JSON file under ~/.config/sa, read on demand
// rather than cached, so a token pasted in mid-session is seen by the next call.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface SaConfig {
  /** Where a launch leaves the pictures its creatives were made from: one folder per topic, by the topic's name. */
  sources_root: string;
  /** The buyer's own overrides of the team's launch defaults, as `core/quick-launch.ts` reads them; unset is none. */
  launch_defaults: unknown;
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

/** `~/sa/sources` — beside the repository, where the team's machines keep it. */
export const DEFAULT_SOURCES_ROOT = path.join(os.homedir(), 'sa', 'sources');

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
  const platform = section('platform');
  const organization = Number(platform['organization_id']);
  const userId = Number(platform['user_id']);
  return {
    sources_root: expandHome(asText(raw['sources_root']) ?? DEFAULT_SOURCES_ROOT),
    launch_defaults: raw['launch_defaults'] ?? null,
    platform: {
      token: asText(platform['token']),
      organization_id: Number.isInteger(organization) && organization > 0 ? organization : null,
      user_id: Number.isInteger(userId) && userId > 0 ? userId : null,
      base_url: (asText(platform['base_url']) ?? DEFAULT_PLATFORM_URL).replace(/\/+$/, ''),
    },
  };
}
