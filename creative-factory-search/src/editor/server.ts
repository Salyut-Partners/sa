// Everything the editor asks the server for. One file, so the panel components
// hold no knowledge of routes, and so a failed request always arrives as a
// sentence rather than as a status code.
import type { BatchPlan } from '../core/batch.ts';
import type { LocaleId } from '../core/types.ts';
import type { VoiceModel } from '../core/voice.ts';
// Type-only, and therefore erased: the editor never bundles a line of server
// code. Naming the server's own types is what stops the two ends of each of
// these routes drifting apart without anything noticing.
import type { LaunchLine, LaunchTopic, StagedFile } from '../server/quick-launch.ts';
import type { LaunchForm } from '../core/quick-launch.ts';
import type { JobFailure, JobStatus } from '../server/jobs.ts';
import type { SubsState } from '../server/subs.ts';
import type { Translations, TranslatorId } from '../server/translate.ts';
import type { Voice, VoiceCatalogue as ServerVoices } from '../server/tts.ts';

export type { JobFailure, JobStatus, LaunchForm, LaunchLine, LaunchTopic, StagedFile, SubsState, Voice };

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

// ------------------------------------------------------------------ export --

/** Start an export; its files stay on the server until they are downloaded or a launch takes them. */
export const startBatch = (plan: BatchPlan, duration: number, fitToVoice: boolean): Promise<{ id: string }> =>
  ask<{ id: string }>('/api/batch', asJson({ groups: plan.groups, duration, fitToVoice }));

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
}

/** Upload one video and start subtitling it into `subs/output`. Answers once the upload is in. */
export function startSubtitles(file: File, target: SubtitleTarget): Promise<{ id: string }> {
  const query = new URLSearchParams({ name: file.name, style: target.style, lang: target.lang });
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

// ------------------------------------------------------------------ launch --

/** Whether the config holds what a launch needs — a token and an organisation — and if not, why. */
export type PlatformState = { ready: true } | { ready: false; note: string };

export const fetchPlatform = (): Promise<PlatformState> =>
  ask<{ platform: PlatformState }>('/api/config').then(r => r.platform);

/** The buyer's topics on the platform. */
export const fetchLaunchTopics = (): Promise<{ id: number; name: string }[]> =>
  ask<{ topics: { id: number; name: string }[] }>('/api/launch/topics').then(r => r.topics);

/** One topic off the platform: its sets, their defaults, and the lists for one traffic source. */
export const fetchLaunchTopic = (id: number, source: string): Promise<LaunchTopic> =>
  ask<LaunchTopic>(`/api/launch/topics/${id}?source=${encodeURIComponent(source)}`);

export interface LaunchRequest {
  topicId: number;
  form: LaunchForm;
  renders: { job: string; name: string }[];
  disk: { id: string; name: string }[];
  scripts: Record<string, string>;
  sources: { name: string; image: string }[];
}

/** One new campaign. `confirm` rides along: the only caller is the modal's «Підтвердити». */
export const startLaunch = (request: LaunchRequest): Promise<{ id: string; lines: LaunchLine[]; warnings: string[] }> =>
  ask('/api/launch', asJson({ ...request, confirm: true }));

/** A designer's mp4 sent to this machine's server once, when it is added to the form; the launch names it by the id. */
export const stageLaunchFile = (file: File): Promise<StagedFile> =>
  ask<StagedFile>('/api/launch/files?' + new URLSearchParams({ name: file.name }).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
