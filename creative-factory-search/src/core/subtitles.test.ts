import { describe, expect, it } from 'vitest';
import { apply, createProject } from './project.ts';
import {
  parseSetupCheck, parseStyleCatalogue, subtitledName, subtitleStyleFor, uniqueName, wordsFromAlignment,
} from './subtitles.ts';
import type { Project } from './types.ts';

describe('parseStyleCatalogue', () => {
  const printed = JSON.stringify({
    default: 'yellow',
    styles: [
      { id: 'yellow', words_per_chunk: 4, highlight: true },
      { id: 'simple', words_per_chunk: 7, highlight: false },
    ],
  });

  it('reads what the pipeline prints, so the list is its and not ours', () => {
    const catalogue = parseStyleCatalogue(printed);
    expect(catalogue).toEqual({
      default: 'yellow',
      styles: [
        { id: 'yellow', wordsPerChunk: 4, highlight: true },
        { id: 'simple', wordsPerChunk: 7, highlight: false },
      ],
    });
  });

  it('refuses output that is not the catalogue rather than offering half a list', () => {
    expect(parseStyleCatalogue('Traceback (most recent call last)')).toBeNull();
    expect(parseStyleCatalogue('{"styles": "yellow"}')).toBeNull();
    expect(parseStyleCatalogue('{"default": "x", "styles": [{"id": 3}]}')).toBeNull();
    expect(parseStyleCatalogue('{"default": "x", "styles": []}')).toBeNull();
  });
});

describe('parseSetupCheck', () => {
  it('reads the sentences the pipeline wrote about what is missing', () => {
    expect(parseSetupCheck('{"ok": false, "missing": ["немає ffmpeg-full"], "burn_ok": false}'))
      .toEqual({ ok: false, missing: ['немає ffmpeg-full'], burnOk: false });
    expect(parseSetupCheck('{"ok": true, "missing": [], "burn_ok": true}')).toEqual({ ok: true, missing: [], burnOk: true });
  });

  it('takes a check that says nothing about burning as one that cannot', () => {
    // A pipeline from before `--words` existed: the flag would be refused.
    expect(parseSetupCheck('{"ok": false, "missing": ["не встановлено mlx-whisper"]}'))
      .toEqual({ ok: false, missing: ['не встановлено mlx-whisper'], burnOk: false });
  });

  it('treats anything else as a check that could not run', () => {
    expect(parseSetupCheck('')).toBeNull();
    expect(parseSetupCheck('{"ok": "yes"}')).toBeNull();
  });
});

describe('subtitledName', () => {
  it('names the output the way the watcher does, so both give the same file', () => {
    expect(subtitledName('clip.mp4', 'yellow')).toBe('clip.yellow.mp4');
    expect(subtitledName('from designer.MOV', 'box')).toBe('from designer.box.mp4');
    expect(subtitledName('noext', 'red')).toBe('noext.red.mp4');
  });
});

describe('uniqueName', () => {
  it('keeps a name nobody holds', () => {
    expect(uniqueName('clip.yellow.mp4', () => false)).toBe('clip.yellow.mp4');
  });

  it('steps past names already taken, the way the watcher does', () => {
    const taken = new Set(['clip.yellow.mp4', 'clip.yellow-2.mp4']);
    expect(uniqueName('clip.yellow.mp4', name => taken.has(name))).toBe('clip.yellow-3.mp4');
  });
});

describe('subtitleStyleFor', () => {
  const project = (): Project => {
    let p = apply(createProject(), { type: 'locale/add', id: 'de' });
    p = apply(p, { type: 'project/patch', patch: { subtitles: 'box' } });
    return apply(p, { type: 'locale/patch', id: 'de', patch: { subtitles: false } });
  };

  it('answers the batch style for a language left on, and nothing for one switched off', () => {
    expect(subtitleStyleFor(project(), 'en')).toBe('box');
    expect(subtitleStyleFor(project(), 'de')).toBeNull();
  });

  it('answers nothing when the batch has no style, whatever the language says', () => {
    const off = apply(project(), { type: 'project/patch', patch: { subtitles: null } });
    expect(subtitleStyleFor(off, 'en')).toBeNull();
  });

  it('answers nothing for a language the project does not carry', () => {
    expect(subtitleStyleFor(project(), 'pl')).toBeNull();
  });
});

describe('wordsFromAlignment', () => {
  // Tenths, rounded, so the expectations below are exact rather than float noise.
  const alignmentOf = (text: string) => ({
    characters: [...text],
    character_start_times_seconds: [...text].map((_, i) => i / 10),
    character_end_times_seconds: [...text].map((_, i) => (i + 1) / 10),
  });

  it('gives every word of the script its own start and end, verbatim', () => {
    const words = wordsFromAlignment('Hello big world', alignmentOf('Hello big world'));
    expect(words).toEqual([
      { text: 'Hello', start: 0, end: 0.5 },
      { text: 'big', start: 0.6, end: 0.9 },
      { text: 'world', start: 1.0, end: 1.5 },
    ]);
  });

  it('keeps punctuation on the word and survives odd spacing', () => {
    const script = 'Wait,  really?\nYes.';
    const words = wordsFromAlignment(script, alignmentOf(script));
    expect(words!.map(w => w.text)).toEqual(['Wait,', 'really?', 'Yes.']);
    expect(words![2]!.start).toBeCloseTo(1.5);
  });

  it('refuses an alignment that does not spell the script', () => {
    expect(wordsFromAlignment('Hello world', alignmentOf('Hello there'))).toBeNull();
    expect(wordsFromAlignment('Hello world', alignmentOf('Hello'))).toBeNull();
  });

  it('answers no words for an empty script', () => {
    expect(wordsFromAlignment('   ', alignmentOf('   '))).toEqual([]);
  });
});
