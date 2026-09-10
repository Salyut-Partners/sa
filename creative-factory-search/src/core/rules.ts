// Autorules from presets: a preset names the conditions, the action and the
// optional limits of one rule on the platform's own rule engine. `plan` turns
// it into the two calls the platform wants — a `POST` the limits cannot ride
// along with, and a `PUT` that adds them — and fills in the topic and the
// buyer, because leaving either out is the mistake the vault warns about: a
// rule with no buyer fires for every buyer on the platform.
//
// Presets live as files in the repository, one per rule, and are parsed here
// — pure, like every other manifest in this module's family. The repository
// read that finds the files is the server's.
import YAML from 'yaml';
import type { ParseResult } from './launch.ts';

export const RULE_CONDITION_TYPES = ['campaign_age', 'spend', 'roi', 'campaign_status'] as const;
export type RuleConditionType = (typeof RULE_CONDITION_TYPES)[number];

export const RULE_ACTION_TYPES = [
  'budget_adjustment', 'bid_adjustment', 'set_budget_to_current_spend', 'campaign_status', 'duplicate', 'adjust_end_date',
] as const;
export type RuleActionType = (typeof RULE_ACTION_TYPES)[number];

export interface RuleCondition {
  type: RuleConditionType;
  operator: string;
  value: string;
}

export interface RuleAction {
  type: RuleActionType;
  /** `=`, `+` or `-` for the two adjustments; meaningless, but still sent, for the others. */
  operator: string;
  value: string;
}

export interface RuleLimits {
  limit_max_duplicates: number | null;
  limit_min_budget: number | null;
  limit_max_applications: number | null;
}

export const emptyRuleLimits = (): RuleLimits => ({ limit_max_duplicates: null, limit_min_budget: null, limit_max_applications: null });

export const hasLimits = (limits: RuleLimits): boolean =>
  limits.limit_max_duplicates !== null || limits.limit_min_budget !== null || limits.limit_max_applications !== null;

export interface RulePreset {
  /** The file's own name, without its extension — what `topic.yaml`'s `rules` list names. */
  name: string;
  title: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  /** Minutes between the platform's own checks of the rule. */
  intervalValue: number;
  /** Hours of the week it is allowed to fire, as the platform's schedule rows; empty means always. Shape unverified against a dump — `plan` says so. */
  schedule: string[];
  limits: RuleLimits;
}

// ------------------------------------------------------------- parsing --

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(bag: Bag, field: string, errors: string[]): string {
  const value = bag[field];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  errors.push(`поле \`${field}\` обов'язкове`);
  return '';
}

function integer(bag: Bag, field: string, errors: string[], fallback: number): number {
  if (bag[field] === undefined) return fallback;
  const value = Number(bag[field]);
  if (Number.isInteger(value)) return value;
  errors.push(`поле \`${field}\` має бути цілим числом`);
  return fallback;
}

function parseCondition(raw: unknown, errors: string[]): RuleCondition | null {
  if (!isBag(raw)) {
    errors.push('умова має бути набором полів: type, operator, value');
    return null;
  }
  const own: string[] = [];
  const type = text(raw, 'type', own);
  const operator = text(raw, 'operator', own);
  const value = raw['value'];
  if (type !== '' && !(RULE_CONDITION_TYPES as readonly string[]).includes(type)) {
    own.push(`тип умови \`${type}\` невідомий; є: ${RULE_CONDITION_TYPES.join(', ')}`);
  }
  if (value === undefined || value === null || value === '') own.push('поле `value` обов\'язкове');
  if (own.length > 0) {
    errors.push(...own);
    return null;
  }
  return { type: type as RuleConditionType, operator, value: String(value) };
}

function parseAction(raw: unknown, errors: string[]): RuleAction | null {
  if (!isBag(raw)) {
    errors.push('дія має бути набором полів: type, value');
    return null;
  }
  const own: string[] = [];
  const type = text(raw, 'type', own);
  const operator = typeof raw['operator'] === 'string' ? raw['operator'] : '=';
  const value = raw['value'];
  if (type !== '' && !(RULE_ACTION_TYPES as readonly string[]).includes(type)) {
    own.push(`тип дії \`${type}\` невідомий; є: ${RULE_ACTION_TYPES.join(', ')}`);
  }
  if (value === undefined || value === null || value === '') own.push('поле `value` обов\'язкове');
  if (own.length > 0) {
    errors.push(...own);
    return null;
  }
  return { type: type as RuleActionType, operator, value: String(value) };
}

function limit(bag: Bag, field: keyof RuleLimits, errors: string[]): number | null {
  const value = bag[field];
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  errors.push(`поле \`${field}\` має бути додатним числом`);
  return null;
}

/** One preset file: the rule's human name, its conditions and action, and when the platform is to recheck it. */
export function parseRulePreset(name: string, source: string): ParseResult<RulePreset> {
  let data: unknown;
  try {
    data = YAML.parse(source);
  } catch (e) {
    return { ok: false, errors: [`${name}: не yaml: ${(e as Error).message}`] };
  }
  if (!isBag(data)) return { ok: false, errors: [`${name}: пресет має бути набором полів`] };
  const errors: string[] = [];
  const title = typeof data['title'] === 'string' && data['title'].trim() !== '' ? data['title'].trim() : name;

  const conditions: RuleCondition[] = [];
  const conditionsRaw = data['conditions'];
  if (!Array.isArray(conditionsRaw) || conditionsRaw.length === 0) {
    errors.push('поле `conditions` має бути непорожнім списком умов');
  } else {
    for (const raw of conditionsRaw) {
      const parsed = parseCondition(raw, errors);
      if (parsed !== null) conditions.push(parsed);
    }
  }

  const actions: RuleAction[] = [];
  const actionsRaw = data['actions'];
  if (!Array.isArray(actionsRaw) || actionsRaw.length === 0) {
    errors.push('поле `actions` має бути непорожнім списком дій');
  } else {
    for (const raw of actionsRaw) {
      const parsed = parseAction(raw, errors);
      if (parsed !== null) actions.push(parsed);
    }
  }

  const priority = integer(data, 'priority', errors, 1);
  const intervalValue = integer(data, 'interval_value', errors, 60);

  let schedule: string[] = [];
  if (data['schedule'] !== undefined) {
    if (Array.isArray(data['schedule']) && data['schedule'].every(s => typeof s === 'string')) schedule = data['schedule'];
    else errors.push('поле `schedule` має бути списком рядків');
  }

  let limits = emptyRuleLimits();
  if (data['limits'] !== undefined) {
    if (!isBag(data['limits'])) errors.push('поле `limits` має бути набором полів');
    else {
      const l = data['limits'];
      limits = {
        limit_max_duplicates: limit(l, 'limit_max_duplicates', errors),
        limit_min_budget: limit(l, 'limit_min_budget', errors),
        limit_max_applications: limit(l, 'limit_max_applications', errors),
      };
    }
  }

  if (errors.length > 0) return { ok: false, errors: errors.map(e => `${name}: ${e}`) };
  return { ok: true, value: { name, title, conditions, actions, priority, intervalValue, schedule, limits } };
}

// -------------------------------------------------------- request bodies --

export interface RuleCreateBody {
  topic_id: number;
  /** Named `ad_account_id` by the platform; it actually carries the buyer's `user_id` — the trap the preset hides. */
  ad_account_id: string;
  /** The conditions, as the platform wants them: one JSON string, not a nested object. */
  conditions: string;
  /** The actions — the platform calls the field `results`. */
  results: string;
  priority: number;
  interval_value: number;
  schedule: string[];
}

export const ruleCreateBody = (preset: RulePreset, topicId: number, userId: number): RuleCreateBody => ({
  topic_id: topicId,
  ad_account_id: String(userId),
  conditions: JSON.stringify(preset.conditions),
  results: JSON.stringify(preset.actions),
  priority: preset.priority,
  interval_value: preset.intervalValue,
  schedule: preset.schedule,
});

export type RuleLimitsBody = RuleCreateBody & RuleLimits;

/** The second call a rule with limits needs: the create call's own body plus the limits, which only `PUT` accepts. */
export const ruleLimitsBody = (preset: RulePreset, topicId: number, userId: number): RuleLimitsBody => ({
  ...ruleCreateBody(preset, topicId, userId),
  ...preset.limits,
});

// ------------------------------------------------- what the platform holds --

export interface PlatformRule {
  id: number;
  /** `null` for a rule with no topic — the general one the vault warns stacks onto every topic's own. */
  topic_id: number | null;
  /** Read back from `ad_account_id`, which is the buyer's `user_id` rather than an account. */
  userId: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

/**
 * Whether a preset and a rule already on the platform are the same rule — by
 * what they tell the platform to do, which is all the platform itself knows;
 * it never sees the preset's file name.
 */
export const sameRule = (preset: RulePreset, rule: PlatformRule): boolean =>
  JSON.stringify(preset.conditions) === JSON.stringify(rule.conditions) && JSON.stringify(preset.actions) === JSON.stringify(rule.actions);
