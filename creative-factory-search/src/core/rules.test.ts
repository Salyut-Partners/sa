import { describe, expect, it } from 'vitest';
import {
  emptyRuleLimits, hasLimits, parseRulePreset, ruleCreateBody, ruleLimitsBody, sameRule, type PlatformRule, type RulePreset,
} from './rules.ts';

const STOP_LOSS = `
title: Стоп-лос
conditions:
  - type: spend
    operator: ">="
    value: "2"
  - type: campaign_status
    operator: "="
    value: ACTIVE
  - type: roi
    operator: "<"
    value: "10"
actions:
  - type: campaign_status
    operator: "="
    value: PAUSED
priority: 1
interval_value: 60
`;

describe('parseRulePreset', () => {
  it('reads conditions, actions, priority and interval from a valid preset', () => {
    const result = parseRulePreset('stop-loss', STOP_LOSS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      name: 'stop-loss',
      title: 'Стоп-лос',
      conditions: [
        { type: 'spend', operator: '>=', value: '2' },
        { type: 'campaign_status', operator: '=', value: 'ACTIVE' },
        { type: 'roi', operator: '<', value: '10' },
      ],
      actions: [{ type: 'campaign_status', operator: '=', value: 'PAUSED' }],
      priority: 1,
      intervalValue: 60,
      schedule: [],
      limits: emptyRuleLimits(),
    });
  });

  it('takes the file name as the title when none is given', () => {
    const result = parseRulePreset('stop-loss', STOP_LOSS.replace('title: Стоп-лос\n', ''));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe('stop-loss');
  });

  it('reads limits when the preset carries them', () => {
    const result = parseRulePreset('x', STOP_LOSS + '\nlimits:\n  limit_max_duplicates: 3\n  limit_min_budget: 5\n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.limits).toEqual({ limit_max_duplicates: 3, limit_min_budget: 5, limit_max_applications: null });
      expect(hasLimits(result.value.limits)).toBe(true);
    }
  });

  it('refuses a preset with no conditions', () => {
    const result = parseRulePreset('x', 'title: X\nactions:\n  - type: campaign_status\n    value: PAUSED\n');
    expect(result).toEqual({ ok: false, errors: ['x: поле `conditions` має бути непорожнім списком умов'] });
  });

  it('refuses a preset with no actions', () => {
    const result = parseRulePreset('x', 'title: X\nconditions:\n  - type: spend\n    operator: ">="\n    value: "2"\n');
    expect(result).toEqual({ ok: false, errors: ['x: поле `actions` має бути непорожнім списком дій'] });
  });

  it('refuses a condition of an unknown type', () => {
    const result = parseRulePreset(
      'x',
      'title: X\nconditions:\n  - type: weather\n    operator: "="\n    value: sunny\nactions:\n  - type: campaign_status\n    value: PAUSED\n',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('тип умови `weather` невідомий');
  });

  it('refuses an action of an unknown type', () => {
    const result = parseRulePreset(
      'x',
      STOP_LOSS.replace('type: campaign_status\n    operator: "="\n    value: PAUSED', 'type: teleport\n    value: moon'),
    );
    expect(result.ok).toBe(false);
  });

  it('refuses a limit that is not a positive number', () => {
    const result = parseRulePreset('x', STOP_LOSS + '\nlimits:\n  limit_min_budget: -5\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('limit_min_budget');
  });

  it('is not yaml', () => {
    const result = parseRulePreset('x', '{ not: yaml');
    expect(result.ok).toBe(false);
  });
});

const preset = (over: Partial<RulePreset> = {}): RulePreset => {
  const parsed = parseRulePreset('stop-loss', STOP_LOSS);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return { ...parsed.value, ...over };
};

describe('ruleCreateBody', () => {
  it('puts the buyer into ad_account_id and the conditions and actions as JSON text', () => {
    const body = ruleCreateBody(preset(), 106752, 1099);
    expect(body).toEqual({
      topic_id: 106752,
      ad_account_id: '1099',
      conditions: JSON.stringify(preset().conditions),
      results: JSON.stringify(preset().actions),
      priority: 1,
      interval_value: 60,
      schedule: [],
    });
  });
});

describe('ruleLimitsBody', () => {
  it('is the create body plus the preset limits, for the PUT that adds them', () => {
    const withLimits = preset({ limits: { limit_max_duplicates: 3, limit_min_budget: null, limit_max_applications: null } });
    const body = ruleLimitsBody(withLimits, 106752, 1099);
    expect(body).toMatchObject({
      topic_id: 106752, ad_account_id: '1099', limit_max_duplicates: 3, limit_min_budget: null, limit_max_applications: null,
    });
  });
});

describe('sameRule', () => {
  const rule = (over: Partial<PlatformRule> = {}): PlatformRule => ({
    id: 1, topic_id: 106752, userId: 1099, conditions: preset().conditions, actions: preset().actions, ...over,
  });

  it('matches a platform rule whose conditions and actions equal the preset', () => {
    expect(sameRule(preset(), rule())).toBe(true);
  });

  it('does not match when the conditions differ', () => {
    expect(sameRule(preset(), rule({ conditions: [{ type: 'spend', operator: '>=', value: '5' }] }))).toBe(false);
  });

  it('does not match when the actions differ', () => {
    expect(sameRule(preset(), rule({ actions: [{ type: 'bid_adjustment', operator: '=', value: '0.1' }] }))).toBe(false);
  });
});
