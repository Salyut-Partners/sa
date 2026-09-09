// Where each exported file lands: which campaign folder, in the launch the
// batch belongs to. The rule is by language — one campaign is one script, and
// a script is one language — with two ways for the buyer to say otherwise:
// point a whole language at another campaign or at nothing, and single photos
// out of it, because campaigns are sometimes split by place rather than tongue.
//
// It is data and pure functions so the panel can show the split before the
// button is pressed and so the rule is tested without a folder in sight.
import YAML from 'yaml';
import type { BatchPlan } from './batch.ts';
import { releaseLocales } from './locales.ts';
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
}

/** A campaign's target, or null for "not exported". */
export type Target = string | null;

export interface ExportLayout {
  /** Each release language's campaign. A language absent here goes nowhere. */
  locales: Partial<Record<LocaleId, Target>>;
  /** Photos sent somewhere other than their language's row: photo id → language → target. */
  overrides: Record<string, Partial<Record<LocaleId, Target>>>;
}

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

/**
 * The layout the panel opens with: every release language pointed at the
 * campaign that speaks it, the first by name when several do, none when none
 * does. A language with no campaign is left out rather than guessed into one.
 */
export function defaultLayout(project: Project, campaigns: readonly CampaignInfo[]): ExportLayout {
  const sorted = [...campaigns].sort((a, b) => a.name.localeCompare(b.name));
  const locales: ExportLayout['locales'] = {};
  for (const locale of releaseLocales(project)) {
    const match = sorted.find(c => c.language?.toLowerCase() === locale.id);
    locales[locale.id] = match?.name ?? null;
  }
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
    locales[id] = id in current.locales ? current.locales[id] ?? null : fresh.locales[id] ?? null;
  }
  return { ...current, locales };
}

/**
 * What the selected photos say for one language: a campaign or null they all
 * name by hand, `'inherit'` when none of them does, `'mixed'` when they
 * disagree. The photo select shows this and writes onto all of them.
 */
export function selectionTarget(
  layout: ExportLayout,
  photoIds: readonly string[],
  locale: LocaleId,
): Target | 'inherit' | 'mixed' {
  const said = photoIds.map(id => {
    const own = layout.overrides[id];
    return own !== undefined && locale in own ? (own[locale] ?? null) : 'inherit';
  });
  const first = said[0];
  if (first === undefined) return 'inherit';
  return said.every(t => t === first) ? first : 'mixed';
}

/** Where one file goes: the photo's own say first, then its language's. */
export function destinationFor(layout: ExportLayout, photoId: string, locale: LocaleId): Target {
  const own = layout.overrides[photoId];
  if (own !== undefined && locale in own) return own[locale] ?? null;
  return layout.locales[locale] ?? null;
}

export function setLocaleTarget(layout: ExportLayout, locale: LocaleId, target: Target): ExportLayout {
  return { ...layout, locales: { ...layout.locales, [locale]: target } };
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
  target: Target | 'inherit',
): ExportLayout {
  const overrides = { ...layout.overrides };
  for (const id of photoIds) {
    const own = { ...(overrides[id] ?? {}) };
    if (target === 'inherit') delete own[locale];
    else own[locale] = target;
    if (Object.keys(own).length === 0) delete overrides[id];
    else overrides[id] = own;
  }
  return { ...layout, overrides };
}

export interface RowShare {
  campaign: Target;
  count: number;
}

/**
 * One language's row summed up over the selected photos: how many files go to
 * each campaign, the row's own campaign first, and how many stay home last.
 */
export function rowSummary(project: Project, layout: ExportLayout, locale: LocaleId): RowShare[] {
  const chosen = new Set(project.selection);
  const counts = new Map<Target, number>();
  const home = layout.locales[locale] ?? null;
  for (const photo of project.photos) {
    if (!chosen.has(photo.id)) continue;
    const target = destinationFor(layout, photo.id, locale);
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const shares = [...counts.entries()].map(([campaign, count]) => ({ campaign, count }));
  const rank = (s: RowShare): number => (s.campaign === home ? 0 : s.campaign === null ? 2 : 1);
  return shares.sort((a, b) => rank(a) - rank(b) || String(a.campaign).localeCompare(String(b.campaign)));
}

/** How big the laid-out export is, by arithmetic — for the button, not the job. */
export interface PlacementSize {
  total: number;
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
  let skipped = 0;
  for (const photo of project.photos) {
    if (!chosen.has(photo.id)) continue;
    for (const locale of releaseLocales(project)) {
      if (destinationFor(layout, photo.id, locale.id) === null) skipped++;
      else total++;
    }
  }
  return { total, skipped };
}

export interface PlacedPlan {
  /** The plan with every file that goes nowhere taken out, and empty groups with it. */
  plan: BatchPlan;
  /** Archive name → campaign folder name. */
  destinations: Record<string, string>;
  /** Files the layout left out. */
  skipped: number;
}

/**
 * Apply the layout to a plan: keep the files that have somewhere to go, name
 * the folder for each, and drop the rest — including any group that held only
 * dropped files, so the render count still says what will actually be drawn.
 */
export function placePlan(plan: BatchPlan, layout: ExportLayout): PlacedPlan {
  const destinations: Record<string, string> = {};
  let skipped = 0;
  const groups = plan.groups.flatMap(group => {
    const items = group.items.filter(item => {
      const target = destinationFor(layout, item.photoId, item.locale);
      if (target === null) {
        skipped++;
        return false;
      }
      destinations[item.name] = target;
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
