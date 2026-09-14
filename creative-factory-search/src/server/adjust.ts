// `sa budget` and `sa bid` on the server: the folder's campaigns and the
// buyer's platform status go to `core/adjust.ts`, which says «було → стане».
// The write itself is not here yet: the admin's campaign-management request
// for a budget change has not been taken from a dump, so a `--confirm`
// is refused in words until it has — the plan half stands on its own.
import fs from 'node:fs';
import path from 'node:path';
import { planAdjust, type AdjustCampaign, type AdjustField, type AdjustFilter, type AdjustPlan } from '../core/adjust.ts';
import { parseCampaignManifest, parseTopicManifest } from '../core/launch.ts';
import { readState } from './apply.ts';
import { launchFolder } from './batches.ts';
import type { SaConfig } from './config.ts';
import { RefusedError } from './launches.ts';
import { freshPlatform } from './platform-status.ts';

export interface AdjustRequest {
  field: AdjustField;
  value: number;
  filter: AdjustFilter;
}

/** The campaigns of a launch folder as the adjust reads them: manifest and state, or a manifest that does not read as null. */
function readAdjustCampaigns(folder: string): AdjustCampaign[] {
  const topicText = fs.readFileSync(path.join(folder, 'topic.yaml'), 'utf8');
  const topic = parseTopicManifest(topicText);
  if (!topic.ok) throw new RefusedError(topic.errors.map(e => `topic.yaml: ${e}`).join('\n'));
  const state = readState(folder);
  const dir = path.join(folder, 'campaigns');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => {
      const file = path.join(dir, d.name, 'campaign.yaml');
      const parsed = fs.existsSync(file) ? parseCampaignManifest(fs.readFileSync(file, 'utf8'), topic.value) : null;
      return { name: d.name, manifest: parsed !== null && parsed.ok ? parsed.value : null, state: state.campaigns[d.name] };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface AdjustDescription extends AdjustPlan {
  launchKey: string;
  /** Whether the server can carry the change out yet. */
  applicable: false;
  note: string;
}

export const LIVE_CALL_NOTE = 'живий виклик чекає дампа запиту campaign management на бюджет і бід — план готовий, зміна на платформі ще ні';

/** The plan: reads the folder and the platform status, changes nothing. */
export async function planAdjustment(config: SaConfig, launchKey: string, request: AdjustRequest): Promise<AdjustDescription> {
  const folder = launchFolder(config, launchKey);
  const campaigns = readAdjustCampaigns(folder);
  const platform = await freshPlatform(config);
  const plan = planAdjust(request.field, request.value, request.filter, campaigns, platform);
  return { ...plan, launchKey, applicable: false, note: LIVE_CALL_NOTE };
}

/**
 * The gate. A `confirm` is refused until the request form is known; when it
 * is, this is where the change goes out, one campaign at a time under the
 * queue policy, and `withLive` writes the value and the time into the
 * campaign's state.
 */
export async function startAdjust(config: SaConfig, launchKey: string, request: AdjustRequest, confirmed: boolean): Promise<AdjustDescription> {
  const planned = await planAdjustment(config, launchKey, request);
  if (!confirmed) return planned;
  if (planned.errors.length > 0) throw new RefusedError('план має помилки:\n' + planned.errors.join('\n'));
  throw new RefusedError(LIVE_CALL_NOTE);
}
