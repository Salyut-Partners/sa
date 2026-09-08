// The buyer's own settings: where launches live, and the tokens that must never
// sit inside the repository. One JSON file under ~/.config/sa, read on demand
// rather than cached, so a token pasted in mid-session is seen by the next call.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SaConfig {
  /** The folder that holds one sub-folder per launch key. */
  launches_root: string;
  clickup: {
    /** The buyer's personal API token, so tickets and comments carry their name. */
    token: string | null;
    /** The list «Заливи» of the buyer's team, where `sa new` files its ticket. */
    list_id: string | null;
  };
}

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
  const clickup = (typeof raw['clickup'] === 'object' && raw['clickup'] !== null
    ? raw['clickup'] : {}) as Record<string, unknown>;
  return {
    launches_root: expandHome(asText(raw['launches_root']) ?? DEFAULT_LAUNCHES_ROOT),
    clickup: { token: asText(clickup['token']), list_id: asText(clickup['list_id']) },
  };
}

/** The launches folder, created if it is not there yet. */
export function ensureLaunchesRoot(config: SaConfig): string {
  fs.mkdirSync(config.launches_root, { recursive: true });
  return config.launches_root;
}
