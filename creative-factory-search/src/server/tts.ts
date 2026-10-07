// ElevenLabs, over plain fetch.
//
// A missing key is a state to explain, not a reason to fail starting: the whole
// editor works without one, it just makes silent videos. Every function here
// says so in the words the panel shows.
import type { Alignment } from '../core/subtitles.ts';
import { VOICE_MODELS } from '../core/voice.ts';

export interface Voice {
  voiceId: string;
  name: string;
  labels: Record<string, string>;
  /** A short mp3 of the voice that ElevenLabs hosts, free to play and needing no key — or null when it has none. */
  previewUrl: string | null;
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

/** Where ElevenLabs keeps the samples of its premade voices, public and permanent. */
const PREVIEWS = 'https://storage.googleapis.com/eleven-public-prod/premade/voices/';

/**
 * The voices every ElevenLabs plan carries, for a key that cannot read the
 * account's own list. Verified against a live account: the two that came back
 * 402 (not on the plan) are deliberately absent. Each sample's file name was
 * read off that account's list, so the play button works without the right to
 * read one.
 */
const BUILTIN: Voice[] = ([
  { voiceId: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', labels: { gender: 'male', accent: 'British' }, preview: 'e6206d1a-0721-4787-aafb-06a6e705cac5.mp3' },
  { voiceId: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', labels: { gender: 'male', accent: 'British' }, preview: '7eee0236-1a72-4b86-b303-5dcadc007ba9.mp3' },
  { voiceId: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', labels: { gender: 'female', accent: 'British' }, preview: '89b68b35-b3dd-4348-a84a-a3c13a3c2b30.mp3' },
  { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', labels: { gender: 'female', accent: 'British' }, preview: 'd10f7534-11f6-41fe-a012-2de1e482d336.mp3' },
  { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', labels: { gender: 'female', accent: 'American' }, preview: '01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3' },
  { voiceId: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', labels: { gender: 'female', accent: 'American' }, preview: '67341759-ad08-41a5-be6e-de12fe448618.mp3' },
  { voiceId: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', labels: { gender: 'female', accent: 'American' }, preview: '56a97bf8-b69b-448f-846c-c3a11683d45a.mp3' },
  { voiceId: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', labels: { gender: 'female', accent: 'American' }, preview: 'b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3' },
  { voiceId: 'bIHbv24MWmeRgasZH58o', name: 'Will', labels: { gender: 'male', accent: 'American' }, preview: '8caf8f3d-ad29-4980-af41-53f20c72d7a4.mp3' },
  { voiceId: 'nPczCjzI2devNBz1zQrb', name: 'Brian', labels: { gender: 'male', accent: 'American' }, preview: '2dd3e72c-4fd3-42f1-93ea-abc5d4e5aa1d.mp3' },
  { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', labels: { gender: 'male', accent: 'American' }, preview: 'd6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3' },
  { voiceId: 'cjVigY5qzO86Huf0OWal', name: 'Eric', labels: { gender: 'male', accent: 'American' }, preview: 'd098fda0-6456-4030-b3d8-63aa048c9070.mp3' },
  { voiceId: 'iP95p4xoKVk53GoZ742B', name: 'Chris', labels: { gender: 'male', accent: 'American' }, preview: '3f4bde72-cc48-40dd-829f-57fbf906f4d7.mp3' },
  { voiceId: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', labels: { gender: 'male', accent: 'American' }, preview: 'd782b3ff-84ba-4029-848c-acf01285524d.mp3' },
  { voiceId: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', labels: { gender: 'male', accent: 'American' }, preview: '63148076-6363-42db-aea8-31424308b92c.mp3' },
  { voiceId: 'SAz9YHcvj6GT2YYXdXww', name: 'River', labels: { gender: 'neutral', accent: 'American' }, preview: 'e6c95f0b-2227-491a-b3d7-2249240decb7.mp3' },
  { voiceId: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', labels: { gender: 'male', accent: 'Australian' }, preview: '102de6f2-22ed-43e0-a1f1-111fa75c5481.mp3' },
  { voiceId: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', labels: { gender: 'male', accent: 'Transatlantic' }, preview: 'ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3' },
] as const).map(({ preview, ...v }) => ({ ...v, previewUrl: `${PREVIEWS}${v.voiceId}/${preview}` }));

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
        previewUrl: typeof raw['preview_url'] === 'string' && raw['preview_url'] !== '' ? raw['preview_url'] : null,
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

export interface Speech {
  audio: Buffer;
  /** When each character was said — asked for only when subtitles need it. */
  alignment: Alignment | null;
}

/**
 * Speak `text`, and hand back the mp3 — with the timing of every character
 * when `withTimestamps` is set, which is the same request to a sibling route
 * and costs the same, so the words of the script can be laid over the video
 * without a model guessing what was said.
 *
 * The voice may arrive empty — that is the project saying "whichever the account
 * offers first", which is only answerable here, where the list is.
 */
export async function synthesize(
  text: string,
  voiceId: string,
  modelId: string,
  withTimestamps = false,
): Promise<Speech> {
  if (!hasVoiceKey()) throw new NoVoiceKeyError();
  const spoken = text.trim();
  if (spoken === '') throw new Error('порожній скрипт');

  const voice = voiceId || (await listVoices()).voices[0]?.voiceId || BUILTIN[0]!.voiceId;
  const model = VOICE_MODELS.some(m => m.id === modelId) ? modelId : VOICE_MODELS[0]!.id;

  const route = withTimestamps ? `${voice}/with-timestamps` : voice;
  const response = await fetch(`${API}/text-to-speech/${route}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: spoken, model_id: model }),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  if (!withTimestamps) return { audio: Buffer.from(await response.arrayBuffer()), alignment: null };

  const body = await response.json() as { audio_base64?: unknown; alignment?: unknown };
  if (typeof body.audio_base64 !== 'string') throw new Error('ElevenLabs не повернув аудіо разом із таймкодами');
  return { audio: Buffer.from(body.audio_base64, 'base64'), alignment: readAlignment(body.alignment) };
}

/** The `alignment` block as sent, or null when it is not the shape we read. */
function readAlignment(raw: unknown): Alignment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const bag = raw as Record<string, unknown>;
  const characters = bag['characters'];
  const starts = bag['character_start_times_seconds'];
  const ends = bag['character_end_times_seconds'];
  const numbers = (v: unknown): v is number[] => Array.isArray(v) && v.every(n => typeof n === 'number');
  if (!Array.isArray(characters) || !characters.every(c => typeof c === 'string') || !numbers(starts) || !numbers(ends)) {
    return null;
  }
  return { characters, character_start_times_seconds: starts, character_end_times_seconds: ends };
}
