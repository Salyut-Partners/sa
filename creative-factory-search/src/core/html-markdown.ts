// The platform's article HTML back into the markdown `article.md` holds —
// the inverse of `markdownToHtml` in `article.ts`, for a topic adopted from
// the platform. Small for the same reason: headings, paragraphs, emphasis,
// lists, quotes, links and pictures are what the admin's editor writes, and
// the round trip has to be predictable enough that the plan's hash of the
// converted article is the hash `adopt` writes down.
//
// Pictures are handed to a namer: a data URL or a link becomes a file under
// `images/`, and the markdown points at that file.

/** What a picture in the HTML becomes: the path the markdown will name, and where the bytes come from. */
export interface PictureRef {
  /** `images/<name>` — relative to the article folder. */
  path: string;
  /** The `src` as the HTML had it: a URL to fetch, or a data URL to decode. */
  src: string;
}

export interface Extracted {
  markdown: string;
  pictures: PictureRef[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Entities back into characters; numeric ones too. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

/** The extension a picture gets: from the data URL's mime, else from the link's path, else jpg. */
function extensionOf(src: string): string {
  const data = /^data:image\/([a-z0-9.+-]+)/i.exec(src);
  if (data !== null) {
    const kind = data[1]!.toLowerCase();
    return kind === 'jpeg' ? 'jpg' : kind === 'svg+xml' ? 'svg' : kind;
  }
  const ext = /\.([a-z0-9]{2,5})(?:[?#].*)?$/i.exec(src.replace(/^[a-z]+:\/\/[^/]+/i, ''));
  return ext === null ? 'jpg' : ext[1]!.toLowerCase();
}

const stripTags = (html: string): string => decodeEntities(html.replace(/<[^>]*>/g, ''));

/**
 * Inline HTML into inline markdown. Pictures are taken out first and named;
 * links, emphasis and code are folded; whatever tag is left is dropped and
 * its text kept.
 */
function inline(html: string, pictures: PictureRef[]): string {
  let out = html.replace(/<br\s*\/?>/gi, ' ');
  out = out.replace(/<img\b([^>]*)>/gi, (_, attrs: string) => {
    const src = /\bsrc\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /\bsrc\s*=\s*'([^']*)'/i.exec(attrs)?.[1] ?? '';
    if (src === '') return '';
    const alt = decodeEntities(/\balt\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '');
    const path = `images/${String(pictures.length + 1).padStart(2, '0')}.${extensionOf(decodeEntities(src))}`;
    pictures.push({ path, src: decodeEntities(src) });
    return `![${alt.replace(/[\[\]]/g, '')}](${path})`;
  });
  out = out.replace(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) =>
    `[${stripTags(text).replace(/[\[\]]/g, '')}](${decodeEntities(href)})`);
  out = out.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, text: string) => `**${stripTags(text)}**`);
  out = out.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, text: string) => `*${stripTags(text)}*`);
  out = out.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, text: string) => `\`${stripTags(text)}\``);
  return stripTags(out).replace(/\s+/g, ' ').trim();
}

const BLOCK = /<(h[1-6]|p|ul|ol|blockquote|div)\b[^>]*>([\s\S]*?)<\/\1>/gi;

/**
 * The HTML as blocks of markdown separated by blank lines. Text outside any
 * block tag becomes a paragraph of its own, so an article the editor saved
 * without `<p>` still reads back.
 */
export function htmlToMarkdown(html: string): Extracted {
  const pictures: PictureRef[] = [];
  const blocks = convert(html, pictures);
  return { markdown: blocks.join('\n\n') + (blocks.length > 0 ? '\n' : ''), pictures };
}

/** The blocks of one stretch of HTML, pictures named into the shared list. */
function convert(html: string, pictures: PictureRef[]): string[] {
  const blocks: string[] = [];
  let last = 0;
  const loose = (text: string): void => {
    const line = inline(text, pictures);
    if (line !== '') blocks.push(line);
  };
  for (const match of html.matchAll(BLOCK)) {
    loose(html.slice(last, match.index));
    last = match.index + match[0].length;
    const tag = match[1]!.toLowerCase();
    const body = match[2]!;
    if (/^h[1-6]$/.test(tag)) {
      const line = inline(body, pictures);
      if (line !== '') blocks.push(`${'#'.repeat(Number(tag[1]))} ${line}`);
    } else if (tag === 'ul' || tag === 'ol') {
      const items = [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m => inline(m[1]!, pictures)).filter(l => l !== '');
      if (items.length > 0) blocks.push(items.map((item, i) => (tag === 'ul' ? `- ${item}` : `${i + 1}. ${item}`)).join('\n'));
    } else if (tag === 'blockquote') {
      const line = inline(body, pictures);
      if (line !== '') blocks.push(`> ${line}`);
    } else {
      // A paragraph or a div: one block, its pictures inline. A div may hold
      // paragraphs of its own; those are read as blocks in turn.
      if (/<(p|h[1-6]|ul|ol|blockquote)\b/i.test(body)) blocks.push(...convert(body, pictures));
      else loose(body);
    }
  }
  loose(html.slice(last));
  return blocks;
}
