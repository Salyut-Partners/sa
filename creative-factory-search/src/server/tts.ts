// ElevenLabs, over plain fetch.
//
// A missing key is a state to explain, not a reason to fail starting: the whole
// editor works without one, it just makes silent videos. Every function here
// says so in the words the panel shows.
import { VOICE_MODELS } from '../core/voice.ts';

export interface Voice {
  voiceId: string;
  name: string;
  labels: Record<string, string>;
}

/**
 * Where the list of voices came from, so the panel can say. A user looking at
 * eighteen voices when their account has forty deserves to know why.
 */
export type VoiceSource = 'account' | 'builtin' | 'none';

export interface VoiceCatalogue {
  voices: Voice[];
  source: VoiceSource;
  /** What to tell the user about this list, if anything. */
  note: string;
}

/**
 * The voices every ElevenLabs plan carries, for a key that cannot read the
 * account's own list. Verified against a live account: the two that came back
 * 402 (not on the plan) are deliberately absent.
 */
const BUILTIN: Voice[] = [
  { voiceId: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', labels: { gender: 'male', accent: 'British' } },
  { voiceId: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', labels: { gender: 'male', accent: 'British' } },
  { voiceId: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', labels: { gender: 'female', accent: 'British' } },
  { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', labels: { gender: 'female', accent: 'British' } },
  { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', labels: { gender: 'female', accent: 'American' } },
  { voiceId: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', labels: { gender: 'female', accent: 'American' } },
  { voiceId: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', labels: { gender: 'female', accent: 'American' } },
  { voiceId: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', labels: { gender: 'female', accent: 'American' } },
  { voiceId: 'bIHbv24MWmeRgasZH58o', name: 'Will', labels: { gender: 'male', accent: 'American' } },
  { voiceId: 'nPczCjzI2devNBz1zQrb', name: 'Brian', labels: { gender: 'male', accent: 'American' } },
  { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', labels: { gender: 'male', accent: 'American' } },
  { voiceId: 'cjVigY5qzO86Huf0OWal', name: 'Eric', labels: { gender: 'male', accent: 'American' } },
  { voiceId: 'iP95p4xoKVk53GoZ742B', name: 'Chris', labels: { gender: 'male', accent: 'American' } },
  { voiceId: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', labels: { gender: 'male', accent: 'American' } },
  { voiceId: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', labels: { gender: 'male', accent: 'American' } },
  { voiceId: 'SAz9YHcvj6GT2YYXdXww', name: 'River', labels: { gender: 'neutral', accent: 'American' } },
  { voiceId: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', labels: { gender: 'male', accent: 'Australian' } },
  { voiceId: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', labels: { gender: 'male', accent: 'Transatlantic' } },
];

const API = 'https://api.elevenlabs.io/v1';

/** Read at call time, not at import: `.env` is loaded by the server's first line. */
const key = (): string => process.env['ELEVENLABS_API_KEY'] ?? '';

export const hasVoiceKey = (): boolean => key() !== '';

let cached: Promise<VoiceCatalogue> | null = null;

/** The voices this account can use. Asked once per server run; the list is stable. */
export function listVoices(): Promise<VoiceCatalogue> {
  return (cached ??= fetchVoices());
}

async function fetchVoices(): Promise<VoiceCatalogue> {
  if (!hasVoiceKey()) {
    return {
      voices: [],
      source: 'none',
      note: 'ELEVENLABS_API_KEY не заданий у .env — озвучки не буде, відео вийдуть німими.',
    };
  }
  try {
    const response = await fetch(`${API}/voices?page_size=100`, {
      headers: { 'xi-api-key': key() },
    });
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
    const body = await response.json() as { voices?: unknown[] };
    const voices = (body.voices ?? []).map(v => {
      const raw = v as Record<string, unknown>;
      return {
        voiceId: String(raw['voice_id'] ?? ''),
        name: String(raw['name'] ?? 'без назви'),
        labels: (raw['labels'] ?? {}) as Record<string, string>,
      };
    }).filter(v => v.voiceId !== '');
    if (voices.length > 0) return { voices, source: 'account', note: '' };
    return { voices: BUILTIN, source: 'builtin', note: '' };
  } catch (e) {
    // A key without `voices_read` is the common case and has a specific cure,
    // so it gets a specific sentence rather than the raw status line.
    const message = (e as Error).message;
    return {
      voices: BUILTIN,
      source: 'builtin',
      note: /voices_read/.test(message)
        ? 'Ключ не має права voices_read — показані стандартні голоси, доступні на будь-якому ' +
          'тарифі. Щоб побачити власні: ElevenLabs → Developers → API Keys → увімкнути Voices (read).'
        : 'Не вдалось прочитати список голосів: ' + message.split('\n')[0],
    };
  }
}

export class NoVoiceKeyError extends Error {
  constructor() {
    super(
      'ELEVENLABS_API_KEY не заданий у .env — озвучка недоступна. Додайте ключ і перезапустіть ' +
      'сервер, або очистіть скрипти, щоб зробити німі креативи.',
    );
    this.name = 'NoVoiceKeyError';
  }
}

/**
 * Speak `text`, and hand back the mp3.
 *
 * The voice may arrive empty — that is the project saying "whichever the account
 * offers first", which is only answerable here, where the list is.
 */
export async function synthesize(
  text: string,
  voiceId: string,
  modelId: string,
): Promise<Buffer> {
  if (!hasVoiceKey()) throw new NoVoiceKeyError();
  const spoken = text.trim();
  if (spoken === '') throw new Error('порожній скрипт');

  const voice = voiceId || (await listVoices()).voices[0]?.voiceId || BUILTIN[0]!.voiceId;
  const model = VOICE_MODELS.some(m => m.id === modelId) ? modelId : VOICE_MODELS[0]!.id;

  const response = await fetch(`${API}/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: spoken, model_id: model }),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
