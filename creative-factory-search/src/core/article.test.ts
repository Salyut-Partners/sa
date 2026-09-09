import { describe, expect, it } from 'vitest';
import { markdownToHtml, parseArticle, type ImageReader } from './article.ts';

const noImages: ImageReader = () => null;

describe('parseArticle', () => {
  it('takes the title, countries and language from the front matter', () => {
    const result = parseArticle([
      '---',
      'title: Jobs at German airports',
      'country: [DE, AT]',
      'language: de',
      '---',
      'First paragraph.',
    ].join('\n'), noImages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Jobs at German airports');
    expect(result.value.countries).toEqual(['DE', 'AT']);
    expect(result.value.language).toBe('de');
    expect(result.value.html).toBe('<p>First paragraph.</p>');
  });

  it('takes the first heading as the title when the front matter has none, and keeps it out of the body', () => {
    const result = parseArticle('# The rollator is not the answer\n\nBody text.\n', noImages);
    expect(result.ok && result.value.title).toBe('The rollator is not the answer');
    expect(result.ok && result.value.html).toBe('<p>Body text.</p>');
  });

  it('only lifts a heading from the top: one deeper in the body is a section, not the title', () => {
    const result = parseArticle('---\ntitle: Given\n---\nIntro.\n\n# Section\n\nMore.', noImages);
    expect(result.ok && result.value.title).toBe('Given');
    expect(result.ok && result.value.html).toBe('<p>Intro.</p><h1>Section</h1><p>More.</p>');
    expect(parseArticle('Intro.\n\n# Late\n', noImages).ok).toBe(false);
  });

  it('defaults geo and language to All, the way the admin sends them', () => {
    const result = parseArticle('# T\n\nx', noImages);
    expect(result.ok && result.value.countries).toEqual(['All']);
    expect(result.ok && result.value.language).toBe('All');
  });

  it('refuses an article without a title or without a body, in words', () => {
    const untitled = parseArticle('Just text.', noImages);
    expect(untitled.ok).toBe(false);
    expect(!untitled.ok && untitled.errors.join()).toMatch(/заголов/);
    const empty = parseArticle('# Only a title\n', noImages);
    expect(empty.ok).toBe(false);
    expect(!empty.ok && empty.errors.join()).toMatch(/порожн/);
  });

  it('inlines the pictures from images/ as data URLs and names the ones that are missing', () => {
    const reader: ImageReader = path => (path === 'images/a.jpg' ? { mime: 'image/jpeg', base64: 'AAAA' } : null);
    const result = parseArticle('# T\n\n![Airport](images/a.jpg)\n\n![Gone](images/b.png)\n', reader);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/images\/b\.png/);
    const good = parseArticle('# T\n\n![Airport](images/a.jpg)\n', reader);
    expect(good.ok && good.value.html).toBe('<p><img src="data:image/jpeg;base64,AAAA" alt="Airport"></p>');
    expect(good.ok && good.value.images).toEqual(['images/a.jpg']);
  });

  it('leaves a picture by URL alone', () => {
    const result = parseArticle('# T\n\n![x](https://example.com/a.jpg)\n', noImages);
    expect(result.ok && result.value.html).toBe('<p><img src="https://example.com/a.jpg" alt="x"></p>');
  });

  it('refuses a country that is not a code, a name or All', () => {
    const result = parseArticle('---\ntitle: T\ncountry: 12\n---\nx', noImages);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/country/);
  });
});

describe('markdownToHtml', () => {
  it('turns headings, paragraphs and emphasis into the tags the admin editor writes', () => {
    expect(markdownToHtml('## Second\n\nSome **bold** and *italic* and `code`.\n', noImages).html)
      .toBe('<h2>Second</h2><p>Some <strong>bold</strong> and <em>italic</em> and <code>code</code>.</p>');
  });

  it('joins the lines of one paragraph and separates paragraphs on a blank line', () => {
    expect(markdownToHtml('one\ntwo\n\nthree', noImages).html).toBe('<p>one two</p><p>three</p>');
  });

  it('makes lists, links and quotes', () => {
    expect(markdownToHtml('- a\n- b\n\n1. x\n2. y\n\n> quoted\n\n[site](https://e.com)', noImages).html)
      .toBe('<ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol><blockquote><p>quoted</p></blockquote>'
        + '<p><a href="https://e.com">site</a></p>');
  });

  it('escapes html in the text rather than letting it through', () => {
    expect(markdownToHtml('a < b & c', noImages).html).toBe('<p>a &lt; b &amp; c</p>');
  });
});

describe('markdownToHtml slots', () => {
  it('does not mistake a number in the text for a picture slot', () => {
    expect(markdownToHtml('pay 0 euros ![a](https://e.com/a.jpg) or 1 more', noImages).html)
      .toBe('<p>pay 0 euros <img src="https://e.com/a.jpg" alt="a"> or 1 more</p>');
  });
});
