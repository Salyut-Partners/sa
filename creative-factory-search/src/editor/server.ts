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
import type { BatchOutput, JobFailure, JobStatus } from '../server/batch.ts';
import type { BatchRead, BatchWritten } from '../server/batches.ts';
import type { Translations, TranslatorId } from '../server/translate.ts';
import type { Voice, VoiceCatalogue as ServerVoices } from '../server/tts.ts';

export type { BatchOutput, JobFailure, JobStatus, Voice };

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

/** The campaign folders of a launch, each with the language its manifest names. */
export const fetchCampaigns = (launchKey: string): Promise<CampaignInfo[]> =>
  ask<{ campaigns: CampaignInfo[] }>(`/api/launches/${launchKey}/campaigns`).then(r => r.campaigns);

export const fetchBatches = (launchKey: string): Promise<string[]> =>
  ask<{ batches: string[] }>(`/api/launches/${launchKey}/batches`).then(r => r.batches);

/** The batch as the server read it: pictures back inside, and which files were gone. */
export const readBatch = (launchKey: string, batch: string): Promise<BatchRead> =>
  ask<BatchRead>(`/api/launches/${launchKey}/batches/${batch}`);

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

export const batchStatus = (id: string): Promise<JobStatus> =>
  ask<JobStatus>('/api/batch/' + id);

export const cancelBatch = (id: string): Promise<JobStatus> =>
  ask<JobStatus>('/api/batch/' + id, { method: 'DELETE' });

/**
 * Fetch the result and hand it to the browser to save.
 *
 * One creative comes back as an mp4 and a batch as a zip; the server decides
 * which, and the name it sends is the name the file gets.
 */
export async function downloadBatch(id: string): Promise<number> {
  const response = await fetch(`/api/batch/${id}/download`);
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
