// `sa budget` and `sa bid` on the server: the folder's campaigns and the
// buyer's platform status go to `core/adjust.ts`, which says «було → стане»
// and fills the admin's form for each change; under `confirm` the forms go
// out here, one campaign at a time under the queue policy, and `withLive`
// writes the value and the time into the campaign's state — through
// `apply.ts`'s own writer, with the folder claimed the way an apply claims it.
import fs from 'node:fs';
import path from 'node:path';
import { planAdjust, withLive, type AdjustCampaign, type AdjustChange, type AdjustField, type AdjustFilter, type AdjustPlan } from '../core/adjust.ts';
import { parseCampaignManifest, parseTopicManifest } from '../core/launch.ts';
import { claimLaunch, readState, writeState } from './apply.ts';
import { launchFolder } from './batches.ts';
import type { SaConfig } from './config.ts';
import { RefusedError } from './launches.ts';
import { PlatformClient, platformState, readCampaigns, updateCampaign } from './platform.ts';
import { freshPlatform, refreshPlatform } from './platform-status.ts';
import { PolicyStop, writeUnderPolicy } from './policy.ts';

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
  /** Under `confirm`: the changes the platform took, by label, and the ones it did not, with why. Empty lists for a plan. */
  applied: string[];
  failed: { label: string; reason: string }[];
}

/** The plan: reads the folder and the platform status, changes nothing. */
export async function planAdjustment(config: SaConfig, launchKey: string, request: AdjustRequest): Promise<AdjustDescription> {
  const folder = launchFolder(config, launchKey);
  const campaigns = readAdjustCampaigns(folder);
  const platform = await freshPlatform(config);
  const plan = planAdjust(request.field, request.value, request.filter, campaigns, platform);
  return { ...plan, launchKey, applied: [], failed: [] };
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One form out under the queue policy. An update is safe to send twice, so
 * an uncertain answer — a timeout, a 5xx — is read back off the campaign
 * list, and sent again when the list does not show the new value yet; a 4xx,
 * or a 2xx that says `success: false`, stops with the platform's words.
 * Returns null when the change went through, the reason otherwise. Only the
 * write jitter between forms: each is one small request, not a campaign's
 * worth of uploads, so the pause between campaigns would be waiting for
 * nothing.
 */
async function sendChange(api: PlatformClient, change: AdjustChange): Promise<string | null> {
  try {
    await writeUnderPolicy({
      kind: 'update',
      send: () => updateCampaign(api, change.body),
      readBack: async () => {
        const [record] = await readCampaigns(api, [change.campaignId]);
        return record !== undefined && record[change.field] === change.to ? record : null;
      },
      pause: sleep,
    });
    return null;
  } catch (e) {
    if (e instanceof PolicyStop) return e.message;
    throw e;
  }
}

/**
 * The gate. Without `confirm` the plan; with it the platform is read again
 * first — the form carries the other number and the status as the list
 * shows them, and a list minutes old could send back a bid the buyer has
 * since changed in the admin — and the forms go out in the plan's order,
 * each success written into the campaign's state at once, each failure
 * kept for the answer and the next campaign tried anyway: a bad answer for
 * one DE campaign is no reason to leave the others where they stand. The
 * folder is claimed for the while, the way an apply claims it, so the two
 * never write the state files at once.
 */
export async function startAdjust(config: SaConfig, launchKey: string, request: AdjustRequest, confirmed: boolean): Promise<AdjustDescription> {
  if (!confirmed) return planAdjustment(config, launchKey, request);
  const release = claimLaunch(launchKey, 'apply або зміна бюджету чи біда');
  try {
    await refreshPlatform(config);
    const planned = await planAdjustment(config, launchKey, request);
    if (planned.errors.length > 0) throw new RefusedError('план має помилки:\n' + planned.errors.join('\n'));
    if (planned.changes.length === 0) throw new RefusedError('жодної кампанії під фільтр — міняти нема чого');
    const ready = platformState(config);
    if (!ready.ready) throw new RefusedError(ready.note);
    const api = new PlatformClient(ready);
    const folder = launchFolder(config, launchKey);
    for (const change of planned.changes) {
      const reason = await sendChange(api, change);
      if (reason !== null) {
        planned.failed.push({ label: change.label, reason });
        continue;
      }
      const state = readState(folder);
      const own = state.campaigns[change.campaign];
      if (own !== undefined) writeState(folder, { ...state, campaigns: { ...state.campaigns, [change.campaign]: withLive(own, change.field, change.to, new Date()) } });
      planned.applied.push(change.label);
    }
    // The table reads the platform on its own timer; a change just made deserves a read now.
    void refreshPlatform(config);
    return planned;
  } finally {
    release();
  }
}
