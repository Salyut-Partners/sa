// An article as the folder holds it — `article.md` with a front matter and
// pictures beside it in `images/` — turned into what the platform takes: a
// title, HTML with the pictures inlined as data URLs the way the admin's editor
// embeds them, the countries and the language.
//
// The converter is small on purpose. An article is headings, paragraphs,
// emphasis, lists, links and pictures; anything richer than that the platform's
// editor would not have written either. It is here rather than behind a
// dependency because the output has to be predictable enough to hash — the
// hash is how `plan` tells an edited article from an untouched one.
import YAML from 'yaml';
import type { ParseResult } from './launch.ts';

/** A picture beside the article, or null when the folder does not hold it. */
export type ImageReader = (path: string) => { mime: string; base64: string } | null;

export interface Article {
  title: string;
  html: string;
  /** Country codes or names as the buyer wrote them, or `All`. Resolved to the platform's names later. */
  countries: string[];
  language: string;
  /** The pictures that were inlined, relative to the article folder. */
  images: string[];
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** A `# Heading` on the first line that has anything on it — the title, when the front matter gives none. */
const LEADING_HEADING = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/;

/**
 * Marks a picture or link taken out of a line before escaping. A control
 * character no article contains and no escaping touches, so a real "pay 5
 * euros" in the text is never mistaken for a slot.
 */
const SLOT = '\u0000';
const SLOT_PATTERN = /\u0000(\d+)\u0000/g;

const COUNTRY = /^(All|[A-Z]{2}|[A-Za-z][A-Za-z .'-]{2,})$/;

/**
 * Read an article from its markdown. Fails in words: a missing title, an empty
 * body, a picture the folder does not hold, a country that is not a country.
 */
export function parseArticle(source: string, readImage: ImageReader): ParseResult<Article> {
  const errors: string[] = [];
  let body = source;
  let front: Record<string, unknown> = {};
  const match = FRONT_MATTER.exec(source);
  if (match !== null) {
    try {
      const parsed: unknown = YAML.parse(match[1]!);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) front = parsed as Record<string, unknown>;
      else errors.push('фронтматер статті має бути набором полів');
    } catch (e) {
      errors.push('фронтматер статті не yaml: ' + (e as Error).message);
    }
    body = source.slice(match[0].length);
  }

  let title = typeof front['title'] === 'string' ? front['title'].trim() : '';
  const heading = LEADING_HEADING.exec(body);
  if (title === '' && heading !== null) {
    title = heading[1]!.trim();
    body = body.slice(heading[0].length);
  }
  if (title === '') errors.push('у статті немає заголовка: `title` у фронтматері або перший рядок `# Заголовок`');

  const countries = listOf(front['country'] ?? front['countries'], 'All');
  for (const c of countries) {
    if (!COUNTRY.test(c)) errors.push(`country: \`${c}\` — код країни (DE), назва (Germany) або All`);
  }
  const languageRaw = front['language'];
  const language = typeof languageRaw === 'string' && languageRaw.trim() !== '' ? languageRaw.trim() : 'All';

  const converted = markdownToHtml(body, readImage);
  errors.push(...converted.missing.map(p => `картинки \`${p}\` немає в теці статті`));
  if (converted.html === '') errors.push('стаття порожня: після заголовка нема тексту');

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { title, html: converted.html, countries, language, images: converted.images } };
}

function listOf(value: unknown, fallback: string): string[] {
  if (value === undefined || value === null) return [fallback];
  if (typeof value === 'string' || typeof value === 'number') return [String(value).trim()];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(v => v !== '');
  return [String(value)];
}

// ------------------------------------------------------------- markdown --

export interface Converted {
  html: string;
  images: string[];
  /** Local picture paths the reader had nothing for. */
  missing: string[];
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Markdown to the HTML the platform stores. Block by block: a heading, a
 * list, a quote, or a paragraph of lines up to the next blank one.
 */
export function markdownToHtml(source: string, readImage: ImageReader): Converted {
  const images: string[] = [];
  const missing: string[] = [];

  const inline = (text: string): string => {
    // Pictures and links are taken out before escaping so their URLs survive,
    // then put back as tags around escaped text.
    const parts: string[] = [];
    const keep = (html: string): string => {
      parts.push(html);
      return `${SLOT}${parts.length - 1}${SLOT}`;
    };
    let out = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => {
      let url = src;
      if (!/^[a-z]+:/i.test(src)) {
        const picture = readImage(src);
        if (picture === null) {
          missing.push(src);
        } else {
          url = `data:${picture.mime};base64,${picture.base64}`;
          images.push(src);
        }
      }
      return keep(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`);
    });
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) =>
      keep(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`));
    out = escapeHtml(out)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return out.replace(SLOT_PATTERN, (_, i: string) => parts[Number(i)]!);
  };

  const blocks = source.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(b => b.trim()).filter(b => b !== '');
  const html = blocks.map(block => {
    const lines = block.split('\n');
    const heading = /^(#{1,6})\s+(.+)$/.exec(block);
    if (heading !== null && lines.length === 1) {
      return `<h${heading[1]!.length}>${inline(heading[2]!.trim())}</h${heading[1]!.length}>`;
    }
    if (lines.every(l => /^\s*[-*]\s+/.test(l))) {
      return '<ul>' + lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('') + '</ul>';
    }
    if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) {
      return '<ol>' + lines.map(l => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('') + '</ol>';
    }
    if (lines.every(l => /^\s*>/.test(l))) {
      return `<blockquote><p>${inline(lines.map(l => l.replace(/^\s*>\s?/, '')).join(' '))}</p></blockquote>`;
    }
    return `<p>${inline(lines.map(l => l.trim()).join(' '))}</p>`;
  }).join('');

  return { html, images, missing };
}
