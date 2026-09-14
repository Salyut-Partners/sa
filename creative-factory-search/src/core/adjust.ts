// `sa budget` and `sa bid`: a pointed change to a live campaign, only when
// the buyer asks — «підніми DE до 40» — and through the same gate as a
// launch: a plan that says «було → стане» for each campaign it touches, and
// a `--confirm` that a person gives. Pure: the server reads the folder and
// the buyer's platform status; this decides which campaigns the request
// names, what they stand at now and what they would stand at, and what
// refuses. Nothing here touches the table: changing a live campaign from a
// table would be the admin twice.
import type { CampaignManifest, ParseResult } from './launch.ts';
import type { CampaignState } from './campaign-plan.ts';
import type { PlatformStatus } from './topic-table.ts';

export type AdjustField = 'budget' | 'bid';

/** Which campaigns of the topic: one by folder name, or every one that passes the filters. */
export interface AdjustFilter {
  /** A campaign folder, or null for `--all`. */
  campaign: string | null;
  /** A country as the manifest spells it (`DE`), matched without case. */
  country: string | null;
  /** A status as the platform spells it (`active`, `paused`), matched without case. */
  status: string | null;
}

/** A campaign folder as the adjust reads it: its manifest, its state. */
export interface AdjustCampaign {
  name: string;
  manifest: CampaignManifest | null;
  state: CampaignState | undefined;
}

/**
 * The admin's campaign-management form, part for part: one multipart to
 * `POST /v2/campaign/<id>` that carries the id, both numbers and the status
 * every time — the admin never sends one of them alone — so a change of the
 * bid carries the budget as the list shows it, and the status as the list
 * shows it, in the admin's capitals. Taken from the dump of 2026-09-14,
 * which sent `PAUSED` and was answered `{"success":true}`; that the list's
 * other words (`ACTIVE`, `PENDING`) go back the same way, uppercased, is
 * the one assumption here, checked on the first live change.
 */
export interface AdjustBody {
  id: string;
  bid: string;
  budget: string;
  status: string;
}

export interface AdjustChange {
  campaign: string;
  campaignId: number;
  campaignName: string | null;
  field: AdjustField;
  /** What the platform's list shows now. */
  from: number;
  to: number;
  label: string;
  body: AdjustBody;
}

export interface AdjustPlan {
  field: AdjustField;
  value: number;
  changes: AdjustChange[];
  /** Campaigns the filter passed over and why — not errors: a filter is meant to leave things out. */
  skipped: string[];
  warnings: string[];
  /** Things that stop the change. */
  errors: string[];
}

const FIELD_WORD: Record<AdjustField, string> = { budget: 'бюджет', bid: 'бід' };

/** The value as typed: a positive number, with a sentence when it is not. */
export function parseAdjustValue(field: AdjustField, raw: unknown): ParseResult<number> {
  const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return { ok: false, errors: [`${FIELD_WORD[field]} має бути додатним числом, отримано \`${String(raw)}\``] };
  if (field === 'bid' && value > 50) return { ok: false, errors: [`бід ${value} схожий на бюджет — біди платформа приймає в долях долара`] };
  return { ok: true, value };
}

const fold = (s: string): string => s.trim().toLowerCase();

/**
 * What the change would be. A campaign is touched only when the platform
 * has made it — a folder with no builder, a builder with no campaign, a
 * campaign the provider took down are refusals in words, because there is
 * nothing on the platform to change — and only when the list shows it with
 * both numbers, because the form sends both and the status back. `--all`
 * narrows by the manifest's country and the platform's status, skipping the
 * rest and saying so; a named campaign refuses where `--all` skips.
 */
export function planAdjust(field: AdjustField, value: number, filter: AdjustFilter, campaigns: readonly AdjustCampaign[], platform: PlatformStatus | null): AdjustPlan {
  const plan: AdjustPlan = { field, value, changes: [], skipped: [], warnings: [], errors: [] };
  if (platform === null || platform.at === null) {
    plan.errors.push(`платформа ще не опитана${platform?.note ? `: ${platform.note}` : ''} — поточні значення невідомі, спробуйте за хвилину`);
    return plan;
  }
  let chosen: readonly AdjustCampaign[];
  if (filter.campaign !== null) {
    const one = campaigns.find(c => c.name === filter.campaign);
    if (one === undefined) {
      plan.errors.push(`кампанії \`${filter.campaign}\` немає в campaigns/; є: ${campaigns.map(c => c.name).join(', ') || 'жодної'}`);
      return plan;
    }
    chosen = [one];
  } else {
    chosen = campaigns;
    if (chosen.length === 0) plan.errors.push('у campaigns/ немає жодної кампанії');
  }

  // A named campaign refuses where `--all` skips: the same fact, said as an error or as a reason.
  const named = filter.campaign !== null;
  const refuse = (at: string, error: string, skip: string): void => {
    if (named) plan.errors.push(`${at}: ${error}`);
    else plan.skipped.push(`${at}: ${skip}`);
  };

  for (const c of chosen) {
    const at = `campaigns/${c.name}`;
    const builder = c.state?.builder ?? null;
    if (builder === null) {
      refuse(at, 'кампанія не залита — на платформі нема чого міняти', 'не залита');
      continue;
    }
    const onPlatform = platform.builders.find(b => b.id === builder.id);
    const made = onPlatform?.campaigns[0];
    const campaignId = made?.id ?? builder.campaign_id;
    if (campaignId === null) {
      refuse(at, `платформа ще не зробила кампанію з builder ${builder.id} — міняти нема що`, 'кампанії на платформі ще немає');
      continue;
    }
    const record = platform.campaigns.find(p => p.id === campaignId);
    const status = record?.status ?? null;
    if (status !== null && status.toUpperCase() === 'DELETED') {
      refuse(at, `кампанію ${campaignId} провайдер зняв — міняти нема що`, 'знята провайдером');
      continue;
    }
    if (!named) {
      if (filter.country !== null && fold(c.manifest?.country ?? '') !== fold(filter.country)) {
        plan.skipped.push(`${at}: країна ${c.manifest?.country ?? '?'}, не ${filter.country}`);
        continue;
      }
      if (filter.status !== null) {
        if (status === null) { plan.skipped.push(`${at}: статусу в списку платформи ще немає`); continue; }
        if (fold(status) !== fold(filter.status)) { plan.skipped.push(`${at}: статус ${status}, не ${filter.status}`); continue; }
      }
    }
    if (record === undefined) {
      refuse(at, `кампанії ${campaignId} у списку платформи ще не видно — без поточних біда, бюджету й статусу запит не скласти, спробуйте пізніше`, 'у списку платформи ще не видно');
      continue;
    }
    const { budget, bid } = record;
    if (budget === null || bid === null) {
      const missing = budget === null ? 'бюджет' : 'бід';
      refuse(at, `список платформи не показує ${missing} кампанії ${campaignId} — запит без нього не скласти`, `список платформи не показує ${missing}`);
      continue;
    }
    const from = field === 'budget' ? budget : bid;
    if (from === value) {
      plan.skipped.push(`${at}: ${FIELD_WORD[field]} уже ${value}`);
      continue;
    }
    const campaignName = made?.name ?? builder.campaign_name;
    plan.changes.push({
      campaign: c.name, campaignId, campaignName, field, from, to: value,
      label: `${c.name}: ${FIELD_WORD[field]} ${from} → ${value} (кампанія ${campaignId}${campaignName === null ? '' : ` «${campaignName}»`})`,
      body: adjustBody(campaignId, { budget, bid, [field]: value }, record.status),
    });
  }
  if (plan.changes.length === 0 && plan.errors.length === 0) plan.warnings.push('жодної кампанії під фільтр — нічого не зміниться');
  return plan;
}

/** The form as the admin fills it: numbers as typed, the status in capitals. */
const adjustBody = (campaignId: number, values: { budget: number; bid: number }, status: string): AdjustBody =>
  ({ id: String(campaignId), bid: String(values.bid), budget: String(values.budget), status: status.trim().toUpperCase() });

/** The campaign's state after a change went through: the live values with the time. */
export function withLive(state: CampaignState, field: AdjustField, value: number, at: Date): CampaignState {
  return { ...state, live: { budget: state.live?.budget ?? null, bid: state.live?.bid ?? null, [field]: value, changed_at: at.toISOString() } };
}
