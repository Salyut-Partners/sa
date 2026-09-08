// Thin wrappers over the ffmpeg binaries. Kept apart so the render pipeline
// reads as a pipeline and not as process plumbing.
import { spawn } from 'node:child_process';

export class ToolMissingError extends Error {
  constructor(tool: string) {
    super(
      `${tool} не знайдено в PATH. Встановіть ffmpeg (наприклад \`brew install ffmpeg\`) ` +
        'і перезапустіть сервер.',
    );
    this.name = 'ToolMissingError';
  }
}

/**
 * An encoder fed JPEG frames on stdin.
 *
 * JPEG frames are full-range; without the explicit conversion ffmpeg tags the
 * file yuvj420p and some players shift the contrast.
 *
 * The frames are named as mjpeg rather than left to be guessed. ffmpeg used to
 * sniff the stream and work it out; from ffmpeg 8 an image2pipe input with no
 * codec given is read as "Video: none, none" and the run dies before the first
 * frame — an export that worked yesterday and stops on the day the machine
 * upgrades ffmpeg. Saying what we are sending costs nothing and does not depend
 * on which ffmpeg is installed.
 */
export function spawnEncoder(fps: number, outFile: string) {
  const child = spawn(
    'ffmpeg',
    [
      '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0',
      '-vf', 'scale=in_range=full:out_range=limited,format=yuv420p',
      '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '20',
      '-color_range', 'tv', '-movflags', '+faststart', '-r', String(fps), outFile,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );

  let err = '';
  child.stderr.on('data', d => { err += d; });

  const done = new Promise<void>((resolve, reject) => {
    child.on('error', e =>
      reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? new ToolMissingError('ffmpeg') : e));
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code + ': ' + err.slice(-800))));
  });
  // A killed encoder rejects, and on the path that kills one — a cancelled
  // export — nobody is waiting for it any more. An unhandled rejection takes the
  // whole server down with it, so the promise is given a listener here and the
  // caller's `await` gets its own.
  done.catch(() => {});

  // A dead encoder makes the next write raise EPIPE on this stream, and an
  // unhandled 'error' on a stream takes the whole server down with it. What
  // actually went wrong is already carried by `done`; this listener exists only
  // so the fall is not fatal.
  child.stdin.on('error', () => {});

  /**
   * Hand one frame over, waiting if the encoder is behind.
   *
   * The wait ends when the encoder catches up *or* when it dies. Waiting on
   * 'drain' alone is the deadlock this had: a process that has gone will never
   * drain, so an ffmpeg that refused the very first frame left the export
   * sitting at nought per cent with an empty error list, for ever. Whatever
   * ffmpeg said on its way out is what the user is shown instead.
   */
  const write = (frame: Uint8Array): Promise<void> => {
    if (child.stdin.write(frame)) return Promise.resolve();
    return Promise.race([
      new Promise<void>(resolve => child.stdin.once('drain', () => resolve())),
      done.then(() => { throw new Error('ffmpeg зупинився, не дочекавшись кадрів'); }),
    ]);
  };

  return { stdin: child.stdin, write, kill: () => child.kill('SIGKILL'), done };
}

/** Run a tool to completion and hand back its stdout. */
function run(tool: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e =>
      reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? new ToolMissingError(tool) : e));
    child.on('close', code =>
      code === 0 ? resolve(out) : reject(new Error(`${tool} exit ${code}: ${err.slice(-500)}`)));
  });
}

/** How long an audio or video file runs, in seconds. */
export async function probeDuration(file: string): Promise<number> {
  const out = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ]);
  return Number(out.trim()) || 0;
}

/**
 * Lay a soundtrack over a finished video.
 *
 * The video is copied rather than re-encoded: it has already been through
 * libx264 once, and a second pass would cost minutes across a batch and lose a
 * little of the frame each time.
 *
 * The video's length is what decides the file's, and that is the whole point of
 * `apad`. Files in a group share one video, cut to hold the *longest* line in
 * the group — so a language with a short line has audio to spare, and a bare
 * `-shortest` would trim its creative down to the second its voice stopped.
 * Padding the speech with silence and then cutting at the video's end gives the
 * one rule that is right both ways: however long the video is, that is the file.
 */
export async function mux(video: string, audio: string, outFile: string): Promise<void> {
  await run('ffmpeg', [
    '-y', '-i', video, '-i', audio,
    '-filter_complex', '[1:a]apad[a]',
    '-map', '0:v:0', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
    '-movflags', '+faststart', outFile,
  ]);
}
