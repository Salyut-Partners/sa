// Where each exported file lands: which campaign folders, in the launch the
// batch belongs to. The rule is by language — one campaign is one script, and
// a script is one language — and since the matrix, one language is several
// campaigns: two cabinets, two sources. So a language goes to a set of
// campaigns, every one that speaks it by default, and the file is copied into
// each. The buyer takes campaigns off, adds one that speaks another language
// when a campaign is split by place rather than tongue, and singles photos
// out of the row.
//
// It is data and pure functions so the panel can show the split before the
// button is pressed and so the rule is tested without a folder in sight. The
// copies are cheap; what they buy is a folder that says in Finder exactly what
// the campaign holds. The plan pays for them once: a file that is the same in
// two campaigns of a topic is uploaded once (`campaign-plan.ts`).
import YAML from 'yaml';
import type { BatchPlan } from './batch.ts';
import { releaseLocales } from './locales.ts';
import { subtitleStyleFor } from './subtitles.ts';
import type { LocaleId, Project } from './types.ts';

/** The folder inside a campaign that holds its creatives. */
export const CREATIVES_DIR = 'creatives';

/** Where a campaign's creatives go, relative to the launch folder. */
export const creativesFolder = (campaign: string): string => `campaigns/${campaign}/${CREATIVES_DIR}`;

/** A campaign as the panel needs it: its folder name and the language it speaks. */
export interface CampaignInfo {
  name: string;
  language: string | null;
  country: string | null;
  /** What the platform calls the campaign once it is launched — the name the buyer knows it by; null or absent before. */
  platformName?: string | null;
}

/** The campaigns a file goes to; none is "not exported". Sorted, no repeats. */
export type Target = string[];

export interface ExportLayout {
  /** Each release language's campaigns. A language absent here goes nowhere. */
  locales: Partial<Record<LocaleId, Target>>;
  /** Photos sent somewhere other than their language's row: photo id → language → target. */
  overrides: Record<string, Partial<Record<LocaleId, Target>>>;
}

/** A target in one shape, so two that name the same campaigns compare equal. */
const canon = (target: readonly string[]): Target => [...new Set(target)].sort();
const sameTarget = (a: readonly string[], b: readonly string[]): boolean => canon(a).join('\n') === canon(b).join('\n');

/**
 * The language and country of a campaign manifest, read loosely.
 *
 * The full parse in `launch.ts` refuses a manifest that is not ready to plan;
 * the export panel only needs to know which language a folder is for, and a
 * placeholder theme is no reason to hide the folder from it.
 */
export function campaignSummary(source: string): { language: string | null; country: string | null } {
  let data: unknown;
  try {
    data = YAML.parse(source);
  } catch {
    return { language: null, country: null };
  }
  if (typeof data !== 'object' || data === null) return { language: null, country: null };
  const bag = data as Record<string, unknown>;
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  return { language: text(bag['language']), country: text(bag['country']) };
}

/** The campaigns that speak a language, by name. */
export const speakers = (campaigns: readonly CampaignInfo[], locale: LocaleId): string[] =>
  canon(campaigns.filter(c => c.language?.toLowerCase() === locale).map(c => c.name));

/**
 * The layout the panel opens with: every release language pointed at every
 * campaign that speaks it, and at none when none does. Nothing is guessed
 * across languages: a campaign of another tongue is the buyer's to add.
 */
export function defaultLayout(project: Project, campaigns: readonly CampaignInfo[]): ExportLayout {
  const locales: ExportLayout['locales'] = {};
  for (const locale of releaseLocales(project)) locales[locale.id] = speakers(campaigns, locale.id);
  return { locales, overrides: {} };
}

/**
 * The layout after the languages or the campaign list changed under it: the
 * rows the buyer already has are kept as they are, a language new to the
 * release gets its default, a language taken off it is dropped. Overrides are
 * left alone — a photo placed by hand stays placed.
 */
export function mergeLayout(
  current: ExportLayout,
  fresh: ExportLayout,
  release: readonly LocaleId[],
): ExportLayout {
  const locales: ExportLayout['locales'] = {};
  for (const id of release) {
    locales[id] = id in current.locales ? current.locales[id] ?? [] : fresh.locales[id] ?? [];
  }
  return { ...current, locales };
}

/**
 * What the selected photos say for one language: the campaigns they all name
 * by hand, `'inherit'` when none of them does, `'mixed'` when they disagree.
 * The photo row shows this and writes onto all of them.
 */
export function selectionTarget(
  layout: ExportLayout,
  photoIds: readonly string[],
  locale: LocaleId,
): Target | 'inherit' | 'mixed' {
  const said = photoIds.map(id => {
    const own = layout.overrides[id];
    return own !== undefined && locale in own ? canon(own[locale] ?? []) : 'inherit';
  });
  const first = said[0];
  if (first === undefined) return 'inherit';
  const agree = said.every(t => (t === 'inherit' ? first === 'inherit' : first !== 'inherit' && sameTarget(t, first)));
  return agree ? first : 'mixed';
}

/** Where one file goes: the photo's own say first, then its language's. */
export function destinationFor(layout: ExportLayout, photoId: string, locale: LocaleId): Target {
  const own = layout.overrides[photoId];
  if (own !== undefined && locale in own) return canon(own[locale] ?? []);
  return canon(layout.locales[locale] ?? []);
}

export function setLocaleTarget(layout: ExportLayout, locale: LocaleId, target: readonly string[]): ExportLayout {
  return { ...layout, locales: { ...layout.locales, [locale]: canon(target) } };
}

/** One campaign on or off a language's row. */
export function toggleLocaleTarget(layout: ExportLayout, locale: LocaleId, campaign: string, on: boolean): ExportLayout {
  const current = layout.locales[locale] ?? [];
  return setLocaleTarget(layout, locale, on ? [...current, campaign] : current.filter(c => c !== campaign));
}

/**
 * Send some photos elsewhere for one language, or hand them back to the row
 * with `'inherit'`. An empty override bag is dropped so the layout does not
 * keep saying a photo was placed by hand after it was not.
 */
export function setPhotoTarget(
  layout: ExportLayout,
  photoIds: readonly string[],
  locale: LocaleId,
  target: readonly string[] | 'inherit',
): ExportLayout {
  const overrides = { ...layout.overrides };
  for (const id of photoIds) {
    const own = { ...(overrides[id] ?? {}) };
    if (target === 'inherit') delete own[locale];
    else own[locale] = canon(target);
    if (Object.keys(own).length === 0) delete overrides[id];
    else overrides[id] = own;
  }
  return { ...layout, overrides };
}

/**
 * One campaign on or off for the selected photos. A photo that was following
 * its row starts from the row's campaigns, so ticking one box adds to what
 * the language already sends rather than replacing it with one folder.
 */
export function togglePhotoTarget(
  layout: ExportLayout,
  photoIds: readonly string[],
  locale: LocaleId,
  campaign: string,
  on: boolean,
): ExportLayout {
  let next = layout;
  for (const id of photoIds) {
    const current = destinationFor(next, id, locale);
    next = setPhotoTarget(next, [id], locale, on ? [...current, campaign] : current.filter(c => c !== campaign));
  }
  return next;
}

export interface RowShare {
  /** A campaign, or null for the files that stay home. */
  campaign: string | null;
  count: number;
}

/**
 * One language's row summed up over the selected photos: how many files go to
 * each campaign, the row's own campaigns first, and how many stay home last.
 */
export function rowSummary(project: Project, layout: ExportLayout, locale: LocaleId): RowShare[] {
  const chosen = new Set(project.selection);
  const counts = new Map<string | null, number>();
  const home = new Set(layout.locales[locale] ?? []);
  for (const photo of project.photos) {
    if (!chosen.has(photo.id)) continue;
    const targets = destinationFor(layout, photo.id, locale);
    if (targets.length === 0) counts.set(null, (counts.get(null) ?? 0) + 1);
    for (const target of targets) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const shares = [...counts.entries()].map(([campaign, count]) => ({ campaign, count }));
  const rank = (s: RowShare): number => (s.campaign === null ? 2 : home.has(s.campaign) ? 0 : 1);
  return shares.sort((a, b) => rank(a) - rank(b) || String(a.campaign).localeCompare(String(b.campaign)));
}

/** How big the laid-out export is, by arithmetic — for the button, not the job. */
export interface PlacementSize {
  /** Files that go somewhere. */
  total: number;
  /** Files written, counting every folder a file is copied into. */
  copies: number;
  skipped: number;
}

/**
 * What the export button says under a layout. Counted over the selection and
 * the release languages rather than planned, for the reason `batchSize` is:
 * a plan hashes every photo, and this is asked on every keystroke.
 */
export function placementSize(project: Project, layout: ExportLayout): PlacementSize {
  const chosen = new Set(project.selection);
  let total = 0;
  let copies = 0;
  let skipped = 0;
  for (const photo of project.photos) {
    if (!chosen.has(photo.id)) continue;
    for (const locale of releaseLocales(project)) {
      const targets = destinationFor(layout, photo.id, locale.id);
      if (targets.length === 0) skipped++;
      else {
        total++;
        copies += targets.length;
      }
    }
  }
  return { total, copies, skipped };
}

/** How many of the files going out get subtitles, of how many go out. */
export interface SubtitleShare {
  burned: number;
  total: number;
}

/**
 * What the subtitles line says under a layout, or under none for a download.
 * Counted like `placementSize`, over the same files, so the two lines agree
 * with each other and with the plan that follows the press.
 */
export function subtitleCount(project: Project, layout: ExportLayout | null): SubtitleShare {
  const chosen = new Set(project.selection);
  let burned = 0;
  let total = 0;
  for (const photo of project.photos) {
    if (!chosen.has(photo.id)) continue;
    for (const locale of releaseLocales(project)) {
      if (layout !== null && destinationFor(layout, photo.id, locale.id).length === 0) continue;
      total++;
      if (subtitleStyleFor(project, locale.id) !== null) burned++;
    }
  }
  return { burned, total };
}

export interface PlacedPlan {
  /** The plan with every file that goes nowhere taken out, and empty groups with it. */
  plan: BatchPlan;
  /** Archive name → the campaign folders it is written into. */
  destinations: Record<string, string[]>;
  /** Files the layout left out. */
  skipped: number;
}

/**
 * Apply the layout to a plan: keep the files that have somewhere to go, name
 * the folders for each, and drop the rest — including any group that held only
 * dropped files, so the render count still says what will actually be drawn.
 */
export function placePlan(plan: BatchPlan, layout: ExportLayout): PlacedPlan {
  const destinations: Record<string, string[]> = {};
  let skipped = 0;
  const groups = plan.groups.flatMap(group => {
    const items = group.items.filter(item => {
      const targets = destinationFor(layout, item.photoId, item.locale);
      if (targets.length === 0) {
        skipped++;
        return false;
      }
      destinations[item.name] = targets;
      return true;
    });
    return items.length === 0 ? [] : [{ ...group, items }];
  });
  return {
    plan: {
      groups,
      total: groups.reduce((sum, g) => sum + g.items.length, 0),
      renders: groups.length,
    },
    destinations,
    skipped,
  };
}
