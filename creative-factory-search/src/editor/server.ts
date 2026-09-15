// Everything the editor asks the server for. One file, so the panel components
// hold no knowledge of routes, and so a failed request always arrives as a
// sentence rather than as a status code.
import type { BatchPlan } from '../core/batch.ts';
import type { CampaignInfo } from '../core/placement.ts';
import type { ProjectFile } from '../core/serialize.ts';
import type { LocaleId } from '../core/types.ts';
import type { VoiceModel } from '../core/voice.ts';
// Type-only, and therefore erased: the editor never bundles a line of server
// code. Naming the server's own types is what stops the two ends of each of
// these routes drifting apart without anything noticing.
import type { LaunchesTree as DiskTree } from '../core/launches-tree.ts';
import type { TopicTable } from '../core/topic-table.ts';
import type { ImportableTopic } from '../core/adopt.ts';
import type { PlanDescription } from '../server/apply.ts';
import type { AdoptedFolder } from '../server/launches.ts';
import type { BatchOutput } from '../server/batch.ts';
import type { JobFailure, JobStatus } from '../server/jobs.ts';
import type { BatchRead, BatchWritten } from '../server/batches.ts';
import type { SubsState } from '../server/subs.ts';
import type { Translations, TranslatorId } from '../server/translate.ts';
import type { Voice, VoiceCatalogue as ServerVoices } from '../server/tts.ts';

export type { BatchOutput, JobFailure, JobStatus, PlanDescription, SubsState, TopicTable, Voice };

/** The tree as the route answers it: the disk, plus where the platform status stands, so the tab knows when a table is stale. */
export interface LaunchesTree extends DiskTree {
  platform: { version: number; at: string | null; note: string | null };
}

/** The topic table, and the plan when it was asked for; a plan that could not be read leaves `plan` null and says why. */
export interface TopicTableRead {
  table: TopicTable;
  plan: PlanDescription | null;
  planNote: string;
  stateNote: string;
  /** The topic folder's full path, for the text «Копіювати» puts on the clipboard. */
  folder: string;
}

/** The import dialog's list: the buyer's topics no folder has yet, or — for a buyer not known yet — the ask for one topic id. */
export interface ImportableRead {
  topics: (ImportableTopic & { launchKey: string })[];
  needsTopic: boolean;
  note?: string | null;
}

/**
 * The sentence behind a failed response.
 *
 * Every route answers a failure as `{ error }` in the words the panel should
 * show, so this is the one place a status code turns back into prose — and the
 * fallback covers a response that is not JSON at all.
 */
async function refusal(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({ error: response.statusText }));
  return new Error((body as { error?: string }).error ?? response.statusText);
}

async function ask<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await refusal(response);
  return await response.json() as T;
}

const asJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ------------------------------------------------------------------ voices --

/** What `/api/voices` answers: the provider's catalogue, plus what else the panel needs. */
export interface VoiceCatalogue extends ServerVoices {
  models: VoiceModel[];
  /** Which translator the keys select, or null when there is none. */
  translator: TranslatorId | null;
}

export const fetchVoices = (): Promise<VoiceCatalogue> => ask<VoiceCatalogue>('/api/voices');

/** What the catalogue is offering, in one line for the panel. */
export const describeVoiceSource = (catalogue: VoiceCatalogue): string =>
  catalogue.note !== '' ? catalogue.note
  : catalogue.source === 'account' ? `Голоси вашого акаунта: ${catalogue.voices.length}.`
  : '';

/**
 * Why the translate buttons will not work, before they are pressed.
 *
 * The voice side already explains itself up front through `note`; a translator
 * that answers only after a press — and only with a 501 — would be the one
 * missing key the user has to discover by failing.
 */
export const describeTranslator = (catalogue: VoiceCatalogue | null): string =>
  catalogue === null || catalogue.translator !== null
    ? ''
    : 'Автопереклад вимкнений: у .env немає ані DEEPL_API_KEY, ані ANTHROPIC_API_KEY. ' +
      'Тексти для кожної мови доведеться вписати вручну.';

// --------------------------------------------------------------- translate --

export type TranslationResult = Translations;

/**
 * Put several texts into several languages at once.
 *
 * Several rather than one because the two things worth translating arrive in
 * bulk: a screenful of hand-edited fields, and one script for every geo. The
 * order of `texts` is the order of every array that comes back — that is how the
 * caller matches a translation to the field it belongs to.
 */
export const translate = (
  texts: readonly string[],
  targets: readonly LocaleId[],
): Promise<TranslationResult> =>
  ask<TranslationResult>('/api/translate', asJson({ texts, targets }));

// ---------------------------------------------------------------- launches --

/** The launch keys under `launches_root`, as `sa launches` lists them. */
export const fetchLaunches = (): Promise<string[]> =>
  ask<{ launches: string[] }>('/api/launches').then(r => r.launches);

/** The launches by key and topic name, off the tree — what the export panel offers the buyer to pick from. */
export const fetchLaunchNames = (): Promise<{ key: string; name: string }[]> =>
  ask<LaunchesTree>('/api/launches/tree').then(t => t.niches.flatMap(n => n.topics.map(topic => ({ key: topic.key, name: topic.name }))));

/** The campaign folders of a launch, each with the language its manifest names. */
export const fetchCampaigns = (launchKey: string): Promise<CampaignInfo[]> =>
  ask<{ campaigns: CampaignInfo[] }>(`/api/launches/${launchKey}/campaigns`).then(r => r.campaigns);

/** The launches as a tree, read off the disk: niche → topic → campaigns with their file counts. */
export const fetchLaunchesTree = (): Promise<LaunchesTree> => ask<LaunchesTree>('/api/launches/tree');

/** The plan — what the platform would be asked for — for a topic, or for some campaigns of it. Creates nothing. */
export const fetchPlan = (launchKey: string, campaigns: readonly string[] | null): Promise<PlanDescription> =>
  ask<PlanDescription>(`/api/launches/${launchKey}/plan`, asJson(campaigns === null ? {} : { campaigns }));

/** The topic table: three states per campaign, the totals, the batches — and with `plan` the topic's plan counted. Reads the platform; creates nothing. */
export const fetchTopicTable = (launchKey: string, plan = false, refresh = false): Promise<TopicTableRead> =>
  ask<TopicTableRead>(`/api/launches/${launchKey}/table`, asJson({ plan, refresh }));

/** The topics the buyer can import; `topicId` names one of theirs when the server does not know the buyer yet. */
export const fetchImportable = (topicId?: number): Promise<ImportableRead> =>
  ask<ImportableRead>('/api/launches/importable' + (topicId === undefined ? '' : `?topicId=${topicId}`));

/** Import one topic with its campaigns into a new folder. Reads the platform; writes nothing to it. */
export const importTopic = (topicId: number, launchKey: string): Promise<AdoptedFolder> =>
  ask<AdoptedFolder>('/api/launches/import', asJson({ topicId, launchKey }));

/**
 * Apply. The `confirm` is the gate the server insists on, and the button that
 * sends it is the one the buyer pressed after reading the plan. A null id
 * means there was nothing to do.
 */
export const startApply = (launchKey: string, campaigns: readonly string[] | null): Promise<{ id: string | null; steps: number }> =>
  ask<{ id: string | null; steps: number }>(`/api/launches/${launchKey}/apply`, asJson({ confirm: true, ...(campaigns === null ? {} : { campaigns }) }));

/** The batch as the server read it: pictures back inside, and which files were gone. */
export const readBatch = (launchKey: string, batch: string): Promise<BatchRead> =>
  ask<BatchRead>(`/api/launches/${launchKey}/batches/${batch}`);

/** Save into a batch the server names by the clock; the answer says which. */
export const createBatch = (launchKey: string, file: ProjectFile): Promise<BatchWritten> =>
  ask<BatchWritten>(`/api/launches/${launchKey}/batches`, asJson(file));

export const writeBatch = (launchKey: string, batch: string, file: ProjectFile): Promise<BatchWritten> =>
  ask<BatchWritten>(`/api/launches/${launchKey}/batches/${batch}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(file),
  });

// ------------------------------------------------------------------ export --

/**
 * Start an export. With `output` the files are written into the launch's
 * campaign folders and nothing comes back to download; without it they are
 * fetched as before.
 */
export const startBatch = (
  plan: BatchPlan,
  duration: number,
  fitToVoice: boolean,
  output?: BatchOutput,
): Promise<{ id: string }> =>
  ask<{ id: string }>('/api/batch', asJson({
    groups: plan.groups, duration, fitToVoice, ...(output === undefined ? {} : { output }),
  }));

/** Any job's progress — an export or a subtitle run; they share the registry. */
export const jobStatus = (id: string): Promise<JobStatus> =>
  ask<JobStatus>('/api/jobs/' + id);

export const cancelJob = (id: string): Promise<JobStatus> =>
  ask<JobStatus>('/api/jobs/' + id, { method: 'DELETE' });

// --------------------------------------------------------------- subtitles --

/** Whether the machine can burn subtitles, and the styles the pipeline offers. */
export const fetchSubtitles = (): Promise<SubsState> => ask<SubsState>('/api/subtitles');

export interface SubtitleTarget {
  style: string;
  /** A language code, or `auto`. */
  lang: string;
  /** A campaign folder to write into, or null for the pipeline's own output folder. */
  campaign: { launchKey: string; campaign: string } | null;
}

/** Upload one video and start subtitling it. Answers once the upload is in. */
export function startSubtitles(file: File, target: SubtitleTarget): Promise<{ id: string }> {
  const query = new URLSearchParams({ name: file.name, style: target.style, lang: target.lang });
  if (target.campaign !== null) {
    query.set('launchKey', target.campaign.launchKey);
    query.set('campaign', target.campaign.campaign);
  }
  return ask<{ id: string }>('/api/subtitles?' + query.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
}

/**
 * Fetch the result and hand it to the browser to save.
 *
 * One creative comes back as an mp4 and a batch as a zip; the server decides
 * which, and the name it sends is the name the file gets.
 */
export async function downloadBatch(id: string): Promise<number> {
  const response = await fetch(`/api/jobs/${id}/download`);
  if (!response.ok) throw await refusal(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nameFrom(response.headers.get('Content-Disposition')) ?? 'creatives.zip';
  link.click();
  // Revoked late: the download is started by the click but not finished by it.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return blob.size;
}

const nameFrom = (disposition: string | null): string | null =>
  disposition?.match(/filename="([^"]+)"/)?.[1] ?? null;
