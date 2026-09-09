// Subtitles as the editor needs to know them: what the pipeline said about its
// styles and its setup, and how an output file is named. The styles themselves
// live in one dictionary in `subs/technical/subtitle_styler.py`; this file
// reads its answers and never lists a style of its own, so «жовтий» means one
// thing in the watcher, the tab and, later, the export.

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
}

/** What `subtitle_styler.py --check` printed, or null when the check itself did not run. */
export function parseSetupCheck(printed: string): SetupCheck | null {
  const data = parseJson(printed);
  if (!isBag(data) || typeof data['ok'] !== 'boolean' || !Array.isArray(data['missing'])) return null;
  return { ok: data['ok'], missing: data['missing'].map(String) };
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
