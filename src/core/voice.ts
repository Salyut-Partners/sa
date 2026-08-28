// What the voice-over costs before it is bought.
//
// The model list is here rather than on the server because the estimate the
// user reads before pressing export has to be arithmetic they can trust, and
// arithmetic belongs where it can be tested. Which voices exist is the
// provider's business and stays on the server; how much a model charges per
// character is a published number.
import type { Locale } from './types.ts';

export interface VoiceModel {
  id: string;
  label: string;
  /** US dollars per thousand characters, as the provider publishes it. */
  perThousand: number;
}

export const VOICE_MODELS: readonly VoiceModel[] = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 · краща якість', perThousand: 0.10 },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 · удвічі дешевша', perThousand: 0.05 },
];

export const DEFAULT_MODEL_ID = VOICE_MODELS[0]!.id;

export const modelById = (id: string): VoiceModel =>
  VOICE_MODELS.find(m => m.id === id) ?? VOICE_MODELS[0]!;

export interface VoiceEstimate {
  chars: number;
  usd: number;
  /** How many syntheses it will take — one per language with something to say. */
  syntheses: number;
}

/**
 * What the next export will spend on speech.
 *
 * Once per language, however many photos are in the batch: the same sentence in
 * the same voice is the same audio file, and the export caches it. A batch of
 * twelve photos in three languages is three syntheses, and quoting twelve times
 * that would frighten the user off a job that costs pennies.
 */
export function voiceEstimate(locales: readonly Locale[], modelId: string): VoiceEstimate {
  const scripts = locales.map(l => l.script.trim()).filter(s => s !== '');
  const chars = scripts.reduce((sum, s) => sum + s.length, 0);
  return {
    chars,
    usd: (chars / 1000) * modelById(modelId).perThousand,
    syntheses: scripts.length,
  };
}
