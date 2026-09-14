import { describe, expect, it } from 'vitest';
import { markdownToHtml } from './article.ts';
import { decodeEntities, htmlToMarkdown } from './html-markdown.ts';

describe('the platform HTML back into markdown', () => {
  it('turns headings, paragraphs, emphasis, lists, quotes and links into the markdown the article reader takes', () => {
    const html = '<h2>Jobs at airports</h2><p>Shifts run <strong>day and night</strong>, pay is <em>hourly</em>. See <a href="https://e.com/x">the rules</a>.</p>'
      + '<ul><li>ground crew</li><li>security</li></ul><ol><li>apply</li><li>train</li></ol><blockquote><p>A quote.</p></blockquote>';
    expect(htmlToMarkdown(html).markdown).toBe(
      '## Jobs at airports\n\nShifts run **day and night**, pay is *hourly*. See [the rules](https://e.com/x).\n\n- ground crew\n- security\n\n1. apply\n2. train\n\n> A quote.\n',
    );
  });

  it('round-trips through the markdown converter: the HTML the plan would send is the HTML that was read', () => {
    const html = '<h2>Title</h2><p>Text with <strong>bold</strong> and <em>italic</em> and <code>code</code>.</p><ul><li>a</li><li>b</li></ul><blockquote><p>q</p></blockquote>';
    const back = markdownToHtml(htmlToMarkdown(html).markdown, () => null).html;
    expect(back).toBe(html);
  });

  it('takes the pictures out, names them under images/ in order, and points the markdown at the files', () => {
    const html = '<p>Before <img src="https://static.e.com/storage/a.png?x=1" alt="An airport"> after.</p><p><img src="data:image/jpeg;base64,AAAA"></p>';
    const out = htmlToMarkdown(html);
    expect(out.markdown).toBe('Before ![An airport](images/01.png) after.\n\n![](images/02.jpg)\n');
    expect(out.pictures).toEqual([
      { path: 'images/01.png', src: 'https://static.e.com/storage/a.png?x=1' },
      { path: 'images/02.jpg', src: 'data:image/jpeg;base64,AAAA' },
    ]);
  });

  it('decodes entities and drops tags it does not know, keeping their text; text outside blocks is a paragraph', () => {
    expect(htmlToMarkdown('<p>Fish &amp; chips &#8211; <span class="x">for</span> &euro;5</p>loose text').markdown).toBe('Fish & chips – for &euro;5\n\nloose text\n');
    expect(decodeEntities('&lt;a&gt; &quot;q&quot; &#x41;')).toBe('<a> "q" A');
  });

  it('reads paragraphs out of a wrapping div and folds line breaks into spaces', () => {
    expect(htmlToMarkdown('<div><p>one<br>two</p><p>three</p></div>').markdown).toBe('one two\n\nthree\n');
  });

  it('is empty for empty HTML', () => {
    expect(htmlToMarkdown('')).toEqual({ markdown: '', pictures: [] });
  });
});
