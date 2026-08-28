// Machine translation, behind an interface narrow enough that swapping the
// provider is one function.
//
// The phrase book covers the words that repeat across every creative, and it is
// hand-written for a reason — a machine drifting on a compliance line is worse
// than a missing language. This is for the two things it cannot cover: the
// voice-over script, which is free prose, and the fields the user has written
// over by hand.
//
// Nothing is sent anywhere unless a key is present, and no key is a state the
// panel explains rather than an error it throws.
import { LOCALE_ENGLISH } from '../core/locales.ts';
import type { LocaleId } from '../core/types.ts';

export type TranslatorId = 'deepl' | 'anthropic';

/** Which provider the keys in `.env` select, or nothing if there is none. */
export const translator = (): TranslatorId | null =>
  process.env['DEEPL_API_KEY'] ? 'deepl'
  : process.env['ANTHROPIC_API_KEY'] ? 'anthropic'
  : null;

export class NoTranslatorError extends Error {
  constructor() {
    super(
      'Автопереклад вимкнений: у .env немає ані DEEPL_API_KEY, ані ANTHROPIC_API_KEY. ' +
      'Додайте один із них і перезапустіть сервер — або впишіть текст для кожної мови вручну.',
    );
    this.name = 'NoTranslatorError';
  }
}

export interface Translation {
  text: string;
  /** The language the provider thought it was reading, where it says. */
  detected: string;
}

/** DeepL dropped bare EN as a target; the rest of our set maps one to one. */
const DEEPL_TARGET: Partial<Record<LocaleId, string>> = { en: 'EN-GB' };

async function viaDeepl(text: string, to: LocaleId): Promise<Translation> {
  const key = process.env['DEEPL_API_KEY']!;
  // A free key is marked by its suffix and lives on another host.
  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const response = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: [text],
      target_lang: DEEPL_TARGET[to] ?? to.toUpperCase(),
      preserve_formatting: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`DeepL ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = await response.json() as {
    translations: { text: string; detected_source_language?: string }[];
  };
  const first = body.translations[0];
  return {
    text: first?.text ?? '',
    detected: (first?.detected_source_language ?? '').toLowerCase(),
  };
}

async function viaAnthropic(text: string, to: LocaleId): Promise<Translation> {
  const base = process.env['ANTHROPIC_BASE_URL'] ?? 'https://api.anthropic.com';
  const response = await fetch(base + '/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env['ANTHROPIC_API_KEY']!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      system:
        'You translate short advertising copy and voice-over scripts. Reply with the ' +
        'translation only — no quotes, no notes, no explanation. Keep the register natural ' +
        'and spoken, keep line breaks, and keep numbers, currency and times exactly as given.',
      messages: [{ role: 'user', content: `Translate into ${LOCALE_ENGLISH[to]}:\n\n${text}` }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = await response.json() as { content?: { text?: string }[] };
  return { text: (body.content ?? []).map(c => c.text ?? '').join('').trim(), detected: '' };
}

/** Put `text` into `to`. Empty text comes straight back — nobody is charged for it. */
export function translate(text: string, to: LocaleId): Promise<Translation> {
  const provider = translator();
  if (provider === null) throw new NoTranslatorError();
  if (text.trim() === '') return Promise.resolve({ text: '', detected: '' });
  return provider === 'deepl' ? viaDeepl(text, to) : viaAnthropic(text, to);
}

export interface Translations {
  /** One line back per line sent, per language asked for, in the order sent. */
  out: Partial<Record<LocaleId, string[]>>;
  detected: string;
  provider: TranslatorId | null;
}

/**
 * Several texts into several languages.
 *
 * One request per text per language, rather than one batched call. The batches
 * are small — a handful of edited fields, or one script — and going one at a
 * time is what lets a provider that answers per string and one that answers per
 * array sit behind the same `translate`.
 */
export async function translateAll(
  texts: readonly string[],
  targets: readonly LocaleId[],
): Promise<Translations> {
  const out: Partial<Record<LocaleId, string[]>> = {};
  let detected = '';
  for (const target of targets) {
    const lines: string[] = [];
    for (const text of texts) {
      const result = await translate(text, target);
      lines.push(result.text);
      detected ||= result.detected;
    }
    out[target] = lines;
  }
  return { out, detected, provider: translator() };
}
