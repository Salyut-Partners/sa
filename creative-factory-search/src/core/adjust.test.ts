import { describe, expect, it } from 'vitest';
import { parseAdjustValue, planAdjust, withLive, type AdjustCampaign } from './adjust.ts';
import { emptyCampaignState, type CampaignState, type PlatformBuilder, type PlatformCampaign } from './campaign-plan.ts';
import { parseCampaignManifest, parseTopicManifest } from './launch.ts';
import type { PlatformStatus } from './topic-table.ts';

const topic = (() => {
  const parsed = parseTopicManifest('launch_key: ai-x-y\nname: X\nsite: 182\naccounts: { main: { source: tiktok, ad_account: "1", pixel: "2" } }');
  if (!parsed.ok) throw new Error(parsed.errors.join());
  return parsed.value;
})();

const manifest = (country: string) => {
  const parsed = parseCampaignManifest(`termgroup: tg\narticle: a\nlanguage: de\ncountry: ${country}\naccount: main\ntheme: 768\nrsoc_count: 5\nheadline: H\ntsp: { budget: 20, bid: 0.45 }`, topic);
  if (!parsed.ok) throw new Error(parsed.errors.join());
  return parsed.value;
};

const built = (builderId: number, campaignId: number | null = null): CampaignState => ({
  ...emptyCampaignState(), builder: { id: builderId, campaign_id: campaignId, campaign_name: campaignId === null ? null : `34-X-${campaignId}` },
});

const campaign = (name: string, country: string, state: CampaignState | undefined): AdjustCampaign => ({ name, manifest: manifest(country), state });

const builder = (id: number, campaignId: number | null): PlatformBuilder => ({
  id, topic_id: 1, post_id: 2, pixel_id: 3, status: 'APPROVED', traffic_source: 'tiktok', creative_ids: [], rejection: null, review: [],
  campaigns: campaignId === null ? [] : [{ id: campaignId, name: `34-X-${campaignId}`, term_group_id: null }],
});
const live = (id: number, status: string, budget: number | null = 20, bid: number | null = 0.45): PlatformCampaign =>
  ({ id, name: `34-X-${id}`, status, published: true, revenue: 0, spend: null, budget, bid });

const platform = (over: Partial<PlatformStatus> = {}): PlatformStatus => ({
  builders: [builder(700, 1000), builder(701, 1001), builder(702, 1002), builder(703, null)],
  campaigns: [live(1000, 'ACTIVE'), live(1001, 'PAUSED'), live(1002, 'DELETED')],
  at: '2026-09-11T12:00:00Z', note: null, ...over,
});

const folder = (): AdjustCampaign[] => [
  campaign('de-a', 'DE', built(700, 1000)),
  campaign('de-b', 'DE', built(701, 1001)),
  campaign('it-a', 'IT', built(702, 1002)),
  campaign('de-c', 'DE', built(703)),
  campaign('de-d', 'DE', undefined),
];

describe('a budget or bid change', () => {
  it('for one campaign says what it stands at and what it would stand at, by campaign id and never builder id', () => {
    const plan = planAdjust('budget', 40, { campaign: 'de-a', country: null, status: null }, folder(), platform());
    expect(plan.errors).toEqual([]);
    expect(plan.changes).toEqual([{
      campaign: 'de-a', campaignId: 1000, campaignName: '34-X-1000', field: 'budget', from: 20, to: 40,
      label: 'de-a: бюджет 20 → 40 (кампанія 1000 «34-X-1000»)',
    }]);
  });

  it('with --all --country DE --status active takes the active DE campaigns of the topic and nothing else, saying why each other was left', () => {
    const plan = planAdjust('bid', 0.55, { campaign: null, country: 'de', status: 'active' }, folder(), platform());
    expect(plan.errors).toEqual([]);
    expect(plan.changes.map(c => c.campaign)).toEqual(['de-a']);
    expect(plan.skipped).toEqual([
      'campaigns/de-b: статус PAUSED, не active',
      'campaigns/it-a: знята провайдером',
      'campaigns/de-c: кампанії на платформі ще немає',
      'campaigns/de-d: не залита',
    ]);
  });

  it('--all without filters takes every campaign the platform has made and not taken down', () => {
    const plan = planAdjust('budget', 30, { campaign: null, country: null, status: null }, folder(), platform());
    expect(plan.changes.map(c => c.campaign)).toEqual(['de-a', 'de-b']);
  });

  it('refuses a named campaign that is not launched, has no campaign yet, or was taken down', () => {
    const at = (name: string) => planAdjust('budget', 30, { campaign: name, country: null, status: null }, folder(), platform());
    expect(at('de-d').errors.join()).toMatch(/не залита/);
    expect(at('de-c').errors.join()).toMatch(/ще не зробила кампанію з builder 703/);
    expect(at('it-a').errors.join()).toMatch(/провайдер зняв/);
    expect(at('ghost').errors.join()).toMatch(/кампанії `ghost` немає/);
    expect(at('de-d').changes).toEqual([]);
  });

  it('skips a campaign already at the value, and warns when the list does not show the current one', () => {
    const same = planAdjust('budget', 20, { campaign: 'de-a', country: null, status: null }, folder(), platform());
    expect(same.changes).toEqual([]);
    expect(same.skipped).toEqual(['campaigns/de-a: бюджет уже 20']);
    const unseen = planAdjust('budget', 40, { campaign: 'de-a', country: null, status: null }, folder(), platform({ campaigns: [] }));
    expect(unseen.changes[0]).toMatchObject({ from: null, label: 'de-a: бюджет ? → 40 (кампанія 1000 «34-X-1000»)' });
    expect(unseen.warnings.join()).toMatch(/поточне значення невідоме/);
  });

  it('takes the campaign id from the state when the builder list has not caught up', () => {
    const plan = planAdjust('budget', 40, { campaign: 'de-a', country: null, status: null }, [campaign('de-a', 'DE', built(700, 1000))], platform({ builders: [] }));
    expect(plan.changes[0]).toMatchObject({ campaignId: 1000 });
  });

  it('refuses everything while the platform has not been asked', () => {
    const plan = planAdjust('budget', 40, { campaign: 'de-a', country: null, status: null }, folder(), { builders: [], campaigns: [], at: null, note: 'немає токена' });
    expect(plan.errors.join()).toMatch(/платформа ще не опитана: немає токена/);
  });
});

describe('the value', () => {
  it('is a positive number, comma or dot, and a bid is not a budget', () => {
    expect(parseAdjustValue('budget', '40')).toEqual({ ok: true, value: 40 });
    expect(parseAdjustValue('bid', '0,55')).toEqual({ ok: true, value: 0.55 });
    expect(parseAdjustValue('budget', '-1').ok).toBe(false);
    expect(parseAdjustValue('bid', 'x').ok).toBe(false);
    expect(parseAdjustValue('bid', '60').ok).toBe(false);
  });
});

describe('the state after a change', () => {
  it('holds the new value and the time, keeping the other field', () => {
    const at = new Date('2026-09-11T12:34:00Z');
    const once = withLive(emptyCampaignState(), 'budget', 40, at);
    expect(once.live).toEqual({ budget: 40, bid: null, changed_at: '2026-09-11T12:34:00.000Z' });
    const twice = withLive(once, 'bid', 0.55, new Date('2026-09-11T13:00:00Z'));
    expect(twice.live).toEqual({ budget: 40, bid: 0.55, changed_at: '2026-09-11T13:00:00.000Z' });
  });
});
