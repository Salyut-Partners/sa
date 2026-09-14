// The buyer's standing on the platform, read once for all their topics: every
// builder with its status, rejection and the bot's verdicts, and every
// campaign with its status — two reads per buyer, never one per topic. Kept
// in memory, refreshed on a timer, after every apply, and when a topic is
// opened; the topic table reads it, and the tree carries a version number so
// the tab knows when to look again. What the answer means is
// `core/topic-table`'s decision.
import { emptyPlatformStatus, type PlatformStatus } from '../core/topic-table.ts';
import { readState } from './apply.ts';
import type { SaConfig } from './config.ts';
import { existingLaunchKeys } from './launches.ts';
import { PlatformClient, platformState, readBuyerBuilders, readBuyerCampaigns, readTopic } from './platform.ts';
import path from 'node:path';

/** How often the platform is asked when nothing else asks. */
export const PLATFORM_POLL_MS = 5 * 60 * 1000;
/** A read younger than this is fresh enough for a topic being opened. */
const FRESH_MS = 30 * 1000;
/** How long a topic being opened waits for a fresh read before showing what there is; the read goes on, and the version says when it landed. */
const WAIT_MS = 8 * 1000;

let status: PlatformStatus = emptyPlatformStatus('платформа ще не опитана');
let version = 0;
let readAt = 0;
let inFlight: Promise<PlatformStatus> | null = null;
/** The buyer's id once learned — from the config, or from a topic of theirs. */
let learnedUserId: number | null = null;

export const platformStatus = (): PlatformStatus => status;
/** Bumped whenever the status changed since it was last read — what the tab compares. */
export const platformVersion = (): number => version;

function remember(next: PlatformStatus): void {
  const changed = JSON.stringify({ ...next, at: null }) !== JSON.stringify({ ...status, at: null });
  status = next;
  readAt = Date.now();
  if (changed) version += 1;
}

/**
 * Whose builders to read. The config may say; otherwise the first launch
 * folder with a topic on the platform says — the topic carries its buyer —
 * and the answer is kept for the server's life.
 */
async function buyerId(config: SaConfig, api: PlatformClient): Promise<number | null> {
  if (config.platform.user_id !== null) return config.platform.user_id;
  if (learnedUserId !== null) return learnedUserId;
  for (const key of existingLaunchKeys(config.launches_root)) {
    let topicId: number | null;
    try {
      topicId = readState(path.join(config.launches_root, key)).topic_id;
    } catch {
      continue;
    }
    if (topicId === null) continue;
    const topic = await readTopic(api, topicId);
    if (topic !== null && topic.user_id > 0) {
      learnedUserId = topic.user_id;
      return learnedUserId;
    }
  }
  return null;
}

async function read(config: SaConfig): Promise<PlatformStatus> {
  const ready = platformState(config);
  if (!ready.ready) return emptyPlatformStatus(ready.note);
  const api = new PlatformClient(ready);
  const userId = await buyerId(config, api);
  if (userId === null) {
    return emptyPlatformStatus('user_id байера невідомий: задайте platform.user_id у конфігурації або зробіть sa plan на топіку, що вже є на платформі');
  }
  const [builders, campaigns] = await Promise.all([readBuyerBuilders(api, userId), readBuyerCampaigns(api, userId)]);
  return { builders, campaigns, at: new Date().toISOString(), note: null };
}

/** One read now, shared with anyone else asking meanwhile. A failure keeps the last status and becomes its note. */
export function refreshPlatform(config: SaConfig): Promise<PlatformStatus> {
  if (inFlight !== null) return inFlight;
  inFlight = read(config)
    .then(next => { remember(next); return next; })
    .catch((e: Error) => {
      remember({ ...status, note: `платформа: ${e.message}` });
      return status;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * The status, read again first when the last read is older than a
 * topic-opening deserves — but not waited for past a few seconds: a platform
 * that answers slowly must not hold the table, which reads again on its own
 * once the version moves.
 */
export function freshPlatform(config: SaConfig): Promise<PlatformStatus> {
  if (Date.now() - readAt < FRESH_MS) return Promise.resolve(status);
  const refresh = refreshPlatform(config);
  const wait = new Promise<PlatformStatus>(resolve => setTimeout(() => resolve(status), WAIT_MS).unref());
  return Promise.race([refresh, wait]);
}

/** The timer: a read now, and one every few minutes after, for as long as the server lives. */
export function startPlatformPoll(load: () => SaConfig, everyMs = PLATFORM_POLL_MS): void {
  const tick = (): void => {
    let config: SaConfig;
    try { config = load(); } catch (e) { console.error('платформа:', (e as Error).message); return; }
    void refreshPlatform(config);
  };
  tick();
  setInterval(tick, everyMs).unref();
}
