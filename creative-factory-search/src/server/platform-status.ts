// The buyer's standing on the platform, read once for all their topics: every
// builder with its status, rejection and the bot's verdicts, every campaign
// with its status, and the cabinets still listed — a few reads per buyer,
// never one per topic. Kept
// in memory, refreshed on a timer, after every apply, and when a topic is
// opened; the topic table reads it, and the tree carries a version number so
// the tab knows when to look again. What the answer means is
// `core/topic-table`'s decision.
import type { AdAccount } from '../core/campaign-plan.ts';
import { TRAFFIC_SOURCES, type TrafficSource } from '../core/launch.ts';
import { buyerIdFromToken } from '../core/platform-token.ts';
import { emptyPlatformStatus, type PlatformStatus } from '../core/topic-table.ts';
import { readState } from './apply.ts';
import type { SaConfig } from './config.ts';
import { existingLaunchKeys } from './launches.ts';
import { PlatformClient, platformState, readAdAccounts, readBuyerBuilders, readBuyerCampaigns, readSites, readTopic } from './platform.ts';
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
 * Whose builders to read. The config may say; otherwise the token says — its
 * `sub` is the buyer it was issued to — and only when it does not does a launch
 * folder's topic have to say, the topic carrying its buyer. The answer is kept
 * for the server's life.
 */
async function buyerId(config: SaConfig, api: PlatformClient): Promise<number | null> {
  if (config.platform.user_id !== null) return config.platform.user_id;
  if (learnedUserId !== null) return learnedUserId;
  const fromToken = buyerIdFromToken(config.platform.token);
  if (fromToken !== null) {
    learnedUserId = fromToken;
    return learnedUserId;
  }
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
  const [builders, campaigns, adAccounts] = await Promise.all([readBuyerBuilders(api, userId), readBuyerCampaigns(api, userId), readCabinets(api)]);
  return { builders, campaigns, adAccounts, at: new Date().toISOString(), note: null };
}

/**
 * The cabinets the platform lists per source, over every site of the
 * organisation — what tells a banned or frozen cabinet, which it stops
 * listing. A source whose read failed is left out, so its cabinets are not
 * taken for dead.
 */
async function readCabinets(api: PlatformClient): Promise<Partial<Record<TrafficSource, AdAccount[]>>> {
  const sites = await readSites(api).catch(() => null);
  if (sites === null || sites.length === 0) return {};
  const out: Partial<Record<TrafficSource, AdAccount[]>> = {};
  await Promise.all(TRAFFIC_SOURCES.map(async source => {
    const lists = await Promise.all(sites.map(site => readAdAccounts(api, site.id, source))).catch(() => null);
    if (lists !== null) out[source] = lists.flat();
  }));
  return out;
}

/**
 * Learn the buyer from one topic of theirs — for a buyer with no launch
 * folder yet, who has nothing else to learn it from — and read the platform
 * again as them. Answers the user id, or null when the topic is not there.
 */
export async function learnBuyer(config: SaConfig, topicId: number): Promise<number | null> {
  const ready = platformState(config);
  if (!ready.ready) return null;
  const topic = await readTopic(new PlatformClient(ready), topicId);
  if (topic === null || topic.user_id <= 0) return null;
  learnedUserId = topic.user_id;
  readAt = 0;
  await refreshPlatform(config);
  return learnedUserId;
}

/** Whether the buyer is known — from the config, from the token, or learned from a topic. */
export const buyerKnown = (config: SaConfig): boolean =>
  config.platform.user_id !== null || learnedUserId !== null || buyerIdFromToken(config.platform.token) !== null;

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
