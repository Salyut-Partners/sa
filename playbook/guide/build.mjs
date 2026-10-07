#!/usr/bin/env node
// Builds the buyer guide page from the playbook: guide/*.md, rules.md,
// cheatsheet.md and compliance/. The playbook stays the only source of truth;
// the page only shows it. Output: guide/dist/buyer-guide.html.
//
//   node playbook/guide/build.mjs

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const guideDir = dirname(fileURLToPath(import.meta.url));
const playbook = dirname(guideDir);
const read = (p) => readFileSync(join(playbook, p), 'utf8');

const stripFrontmatter = (s) => s.replace(/^---\n[\s\S]*?\n---\n/, '');

// Reliability marks and note slugs are for Claude, not for a new buyer.
const stripMarks = (s) =>
  s
    .replace(/\s*\((?:зі слів партнера|гіпотеза)[^)]*\)/g, '')
    .replace(/\s*_\([^)]*\)_/g, '');

const wikiNames = {
  'first-person-ban': 'CMP-033',
  'trigger-words': 'тригерні слова (розділ «Практика» вище)',
};
const wikilinks = (s) =>
  s.replace(/\[\[([^\]]+)\]\]/g, (_, slug) => {
    const cmp = slug.match(/^cmp-(\d{3})/);
    if (cmp) return `CMP-${cmp[1]}`;
    return wikiNames[slug] ?? slug.replace(/-/g, ' ');
  });

// Every "CMP-NNN" in text becomes a link to its rule in the accordion.
const linkCmp = (s) => s.replace(/(?<![\[#\w-])CMP-(\d{3})(?![\]\w])/g, '[CMP-$1](#cmp-$1)');

const clean = (s) => linkCmp(wikilinks(stripMarks(stripFrontmatter(s)))).trim();

const dropTitle = (md) => md.replace(/^# .*\n+/, '');
const titleOf = (md) => (md.match(/^# (.*)$/m) || [, ''])[1].trim();

const guide = (name) => {
  const md = clean(read(`guide/${name}`));
  return { title: titleOf(md), md: dropTitle(md) };
};

// rules.md: "## (a) Title" sections.
const rulesMd = stripFrontmatter(read('rules.md'));
const rules = {};
for (const part of rulesMd.split(/^## /m).slice(1)) {
  const m = part.match(/^\(([a-z])\)\s*(.*)\n([\s\S]*)$/);
  if (m) rules[m[1]] = { title: m[2].trim(), md: clean(m[3]) };
}
const rule = (k) => {
  if (!rules[k]) throw new Error(`rules.md has no section (${k})`);
  return rules[k];
};

// Compliance rules, one file each.
const cmpGroup = (dir, label) =>
  readdirSync(join(playbook, 'compliance', dir))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const raw = read(`compliance/${dir}/${f}`);
      const id = (raw.match(/^id:\s*(CMP-\d{3})/m) || [])[1];
      const md = clean(raw);
      return { id, group: label, title: titleOf(md), md: dropTitle(md) };
    });
const cmp = [...cmpGroup('creatives', 'Креативи'), ...cmpGroup('articles', 'Статті')];

const cheat = clean(read('cheatsheet.md'));

// Sections in learning order. Each part is shown open or folded.
const g = {
  start: guide('00-start.md'),
  sa: guide('01-search-arbitrage.md'),
  platform: guide('02-platform.md'),
  logic: guide('03-funnel-logic.md'),
  keys: guide('04-keys-payouts.md'),
  verticals: guide('05-verticals.md'),
  compliance: guide('06-compliance.md'),
  spy: guide('08-spy.md'),
};

const sections = [
  { id: 'start', title: g.start.title, parts: [{ md: g.start.md }] },
  { id: 'sa', title: g.sa.title, parts: [{ md: g.sa.md }] },
  { id: 'platform', title: g.platform.title, parts: [{ md: g.platform.md }] },
  {
    id: 'logic',
    title: g.logic.title,
    parts: [
      { md: g.logic.md },
      { title: `Вижимка з плейбука: ${rule('a').title}`, md: rule('a').md, folded: true },
    ],
  },
  { id: 'keys', title: g.keys.title, parts: [{ md: g.keys.md }] },
  { id: 'verticals', title: g.verticals.title, parts: [{ md: g.verticals.md }] },
  {
    id: 'compliance',
    title: g.compliance.title,
    parts: [{ md: g.compliance.md }, { title: rule('g').title, md: rule('g').md }],
    cmp: true,
  },
  {
    id: 'matrix',
    title: 'Матриця заливу',
    parts: [
      { title: titleOf(cheat), md: dropTitle(cheat) },
      ...['b', 'c', 'd', 'e', 'f'].map((k) => ({ title: rule(k).title, md: rule(k).md, folded: true })),
    ],
  },
  { id: 'spy', title: g.spy.title, parts: [{ md: g.spy.md }] },
];

// One markdown document for "copy for Claude".
const shift = (md) => md.replace(/^(#{1,5}) /gm, '$1## ');
const plain = [
  '# Гайд байера Search Arbitrage',
  '',
  'Навчальний гайд команди для байера-початківця. Нижче — весь текст; відповідай по ньому.',
  '',
  ...sections.flatMap((s, i) => [
    `## ${i}. ${s.title}`,
    '',
    ...s.parts.flatMap((p) => [p.title ? `### ${p.title}\n` : '', shift(p.md), '']),
    ...(s.cmp
      ? ['### Усі правила CMP', '', ...cmp.flatMap((c) => [`#### ${c.id} — ${c.title} (${c.group})`, '', shift(shift(c.md)), ''])]
      : []),
  ]),
]
  .join('\n')
  .replace(/\[(CMP-\d{3})\]\(#cmp-\d{3}\)/g, '$1')
  .replace(/\n{3,}/g, '\n\n');

const data = { sections, cmp, plain, built: new Date().toISOString().slice(0, 10) };
const json = JSON.stringify(data).replace(/</g, '\\u003c');

const template = readFileSync(join(guideDir, 'template.html'), 'utf8');
const html = template.replace('/*__DATA__*/null', json);

mkdirSync(join(guideDir, 'dist'), { recursive: true });
const out = join(guideDir, 'dist', 'buyer-guide.html');
writeFileSync(out, html);
console.log(`${out}  ${sections.length} sections, ${cmp.length} CMP rules, ${(html.length / 1024).toFixed(0)} KB`);
