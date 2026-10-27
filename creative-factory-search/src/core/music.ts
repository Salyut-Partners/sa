// The tracks a creative can wear, as the team picked them.
//
// A list in the repository rather than a call to ElevenLabs: Eleven Music
// generates, it does not hand out a catalogue, so the ones worth having were
// generated once and kept. Every buyer gets the same list, with or without a
// key. Adding one is a file in `assets/music/` and a line here.

export interface MusicTrack {
  id: string;
  /** What the panel calls it. */
  name: string;
  /** The file under `assets/music/`. */
  file: string;
  /** How long it runs, for the panel; the export measures the file itself. */
  seconds: number;
}

export const MUSIC: readonly MusicTrack[] = [
  { id: 'life-in-motion', name: 'Life in Motion — Positive Vibe', file: 'life-in-motion.mp3', seconds: 60 },
];

export const musicById = (id: string | null): MusicTrack | null =>
  id === null ? null : MUSIC.find(t => t.id === id) ?? null;

/** How loud the music plays under a voice; alone, it plays at full. */
export const MUSIC_UNDER_VOICE = 0.2;

/** How long the music fades before the file ends, and crosses over itself when it has to repeat. */
export const MUSIC_FADE = 1;

/**
 * How many times a track has to play to cover a file, each repeat overlapping
 * the last by `MUSIC_FADE`. One for a track at least as long as the file.
 */
export function musicRepeats(trackSeconds: number, fileSeconds: number): number {
  if (trackSeconds >= fileSeconds) return 1;
  // Each repeat after the first adds its length less the overlap.
  return 1 + Math.ceil((fileSeconds - trackSeconds) / (trackSeconds - MUSIC_FADE));
}
