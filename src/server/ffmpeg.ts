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
 */
export function spawnEncoder(fps: number, outFile: string) {
  const child = spawn(
    'ffmpeg',
    [
      '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0',
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

  return { stdin: child.stdin, done };
}
