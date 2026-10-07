// A picture as the editor keeps it — a data URL — turned back into bytes and
// the extension its file deserves, for the one place a picture is written to
// disk: the topic's sources folder after a launch.

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+);base64,(.*)$/s;

/** The type and the payload of a base64 data URL, or null for anything else. */
export function decodeDataUrl(url: string): { mime: string; base64: string } | null {
  const match = DATA_URL.exec(url);
  return match === null ? null : { mime: match[1]!, base64: match[2]! };
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** The extension the bytes deserve, whatever the original file was called. */
export const extensionFor = (mime: string): string => EXTENSIONS[mime] ?? mime.split('/')[1] ?? 'bin';
