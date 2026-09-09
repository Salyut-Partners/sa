import { describe, expect, it } from 'vitest';
import { parseSetupCheck, parseStyleCatalogue, subtitledName, uniqueName } from './subtitles.ts';

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
    expect(parseSetupCheck('{"ok": false, "missing": ["немає ffmpeg-full"]}'))
      .toEqual({ ok: false, missing: ['немає ffmpeg-full'] });
    expect(parseSetupCheck('{"ok": true, "missing": []}')).toEqual({ ok: true, missing: [] });
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
