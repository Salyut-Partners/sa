// Subtitles as the editor needs to know them: what the pipeline said about its
// styles and its setup, how an output file is named, which exported files get
// them, and how the words of a script are timed off the voice that read it.
// The styles themselves live in one dictionary in
// `subs/technical/subtitle_styler.py`; this file reads its answers and never
// lists a style of its own, so «жовтий» means one thing in the watcher, the
// tab and the export.
import { localeById } from './locales.ts';
import type { LocaleId, Project } from './types.ts';

/** One style as the pipeline describes it — enough to pick one, no more. */
export interface SubtitleStyle {
  id: string;
  wordsPerChunk: number;
  highlight: boolean;
}

export interface StyleCatalogue {
  default: string;
  styles: SubtitleStyle[];
}

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** What `subtitle_styler.py --list-styles` printed, or null when it was not the catalogue. */
export function parseStyleCatalogue(printed: string): StyleCatalogue | null {
  const data = parseJson(printed);
  if (!isBag(data) || typeof data['default'] !== 'string' || !Array.isArray(data['styles'])) return null;
  const styles: SubtitleStyle[] = [];
  for (const raw of data['styles']) {
    if (!isBag(raw) || typeof raw['id'] !== 'string') return null;
    styles.push({
      id: raw['id'],
      wordsPerChunk: typeof raw['words_per_chunk'] === 'number' ? raw['words_per_chunk'] : 0,
      highlight: raw['highlight'] === true,
    });
  }
  if (styles.length === 0) return null;
  return { default: data['default'], styles };
}

export interface SetupCheck {
  ok: boolean;
  /** Sentences for the buyer, each naming what to install. */
  missing: string[];
  /**
   * Whether a file with its words already timed would come out — everything
   * but Whisper. A creative from the editor brings its own words, so an Intel
   * Mac that cannot run the model still burns them; a pipeline old enough not
   * to say either way would refuse the flag, and counts as unable.
   */
  burnOk: boolean;
}

/** What `subtitle_styler.py --check` printed, or null when the check itself did not run. */
export function parseSetupCheck(printed: string): SetupCheck | null {
  const data = parseJson(printed);
  if (!isBag(data) || typeof data['ok'] !== 'boolean' || !Array.isArray(data['missing'])) return null;
  return { ok: data['ok'], missing: data['missing'].map(String), burnOk: data['burn_ok'] === true };
}

// ------------------------------------------------------------- the export --

/**
 * The style one language's files are burned with, or null for clean files.
 * The batch names the style; a language may only say no to it. With the voice
 * switched off there is nothing to time the words by, and every file is clean.
 */
export const subtitleStyleFor = (project: Project, localeId: LocaleId): string | null => {
  if (project.subtitles === null || !project.voiceOn) return null;
  const locale = localeById(project, localeId);
  return locale !== null && locale.subtitles ? project.subtitles : null;
};

/** One word of a script and when the voice says it. All the pipeline needs. */
export interface Word {
  text: string;
  start: number;
  end: number;
}

/** What ElevenLabs sends beside the audio: each character of the text with its time. */
export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

const isSpace = (ch: string): boolean => /\s/.test(ch);

/**
 * The words of the script, timed off the character alignment the voice came
 * with. The script is the source of the words — split on whitespace, kept
 * verbatim, punctuation and all — and the alignment only lends each one its
 * first character's start and its last character's end. So the subtitles say
 * exactly what the buyer wrote, not what a model heard.
 *
 * Null when the alignment does not spell the script: the two are walked
 * together character by character, whitespace skipped on both sides, and a
 * mismatch means the timings belong to some other text. Better no subtitles
 * than words on the wrong beats.
 */
export function wordsFromAlignment(script: string, alignment: Alignment): Word[] | null {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  if (characters.length !== starts.length || characters.length !== ends.length) return null;
  const words: Word[] = [];
  let at = 0;
  const skipSpace = (): void => {
    while (at < characters.length && isSpace(characters[at]!)) at++;
  };
  for (const text of script.split(/\s+/).filter(w => w !== '')) {
    skipSpace();
    const first = at;
    for (const ch of text) {
      if (at >= characters.length || characters[at] !== ch) return null;
      at++;
    }
    words.push({ text, start: starts[first]!, end: ends[at - 1]! });
  }
  skipSpace();
  return at === characters.length ? words : null;
}

/**
 * What a subtitled file is called: the source's stem, the style, `.mp4`. The
 * watcher's rule, kept here so the tab and the watcher hand back the same
 * name for the same file and style.
 */
export function subtitledName(sourceName: string, style: string): string {
  const stem = sourceName.replace(/\.[^.]+$/, '');
  return `${stem}.${style}.mp4`;
}

/** The name, or the first `-2`, `-3`… that nothing holds — the watcher's rule again. */
export function uniqueName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken(candidate)) return candidate;
  }
}
