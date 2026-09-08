import { describe, expect, it } from 'vitest';
import {
  checkNewLaunch, internalName, isLaunchKey, newLaunchTree, parseCampaignManifest,
  parseTopicManifest, resolveTicketFields, type TopicManifest,
} from './launch.ts';

const TOPIC = `
launch_key: ai-vadim-sperm-it
name: AI Vadim Sperm IT
internal_name: AIVadimSpermIT
traffic_source: tiktok
site: 182
accounts:
  main:
    ad_account: "53560"
    pixel: "35967"
  second:
    ad_account: "53561"
    pixel: "35968"
rules: [stop-loss]
`;

const CAMPAIGN = `
termgroup: tg-main
article: article-a
language: it
country: IT
account: main
theme: 768
rsoc_count: 5
keyword_rotation: false
headline: Scopri di più
tsp:
  budget: 20
  bid: 0.45
  launch_tomorrow: true
  end_date: null
`;

const topic = (): TopicManifest => {
  const result = parseTopicManifest(TOPIC);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.value;
};

describe('a launch key', () => {
  it('is lower-case segments joined by dashes, at least two of them', () => {
    expect(isLaunchKey('ai-vadim-sperm-it')).toBe(true);
    expect(isLaunchKey('ai-mob-nl-trap')).toBe(true);
    expect(isLaunchKey('ai')).toBe(false);
    expect(isLaunchKey('AI-vadim')).toBe(false);
    expect(isLaunchKey('ai_vadim')).toBe(false);
    expect(isLaunchKey('ai--vadim')).toBe(false);
    expect(isLaunchKey('ai-vadim-')).toBe(false);
  });
});

describe('a topic manifest', () => {
  it('parses into the fields the platform chain needs', () => {
    const t = topic();
    expect(t.launch_key).toBe('ai-vadim-sperm-it');
    expect(t.name).toBe('AI Vadim Sperm IT');
    expect(t.internal_name).toBe('AIVadimSpermIT');
    expect(t.traffic_source).toBe('tiktok');
    expect(t.site).toBe('182');
    expect(Object.keys(t.accounts)).toEqual(['main', 'second']);
    expect(t.accounts['main']).toEqual({ ad_account: '53560', pixel: '35967' });
    expect(t.rules).toEqual(['stop-loss']);
  });

  it('derives internal_name from name when it is left out', () => {
    const result = parseTopicManifest(TOPIC.replace(/internal_name:.*\n/, ''));
    expect(result.ok && result.value.internal_name).toBe('AIVadimSpermIT');
  });

  it('refuses an internal_name that is not the name without spaces', () => {
    const result = parseTopicManifest(TOPIC.replace('AIVadimSpermIT', 'Other'));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/internal_name/);
  });

  it('names every missing required field at once', () => {
    const result = parseTopicManifest('launch_key: ai-x\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/name/);
    expect(result.errors.join('\n')).toMatch(/traffic_source/);
    expect(result.errors.join('\n')).toMatch(/site/);
    expect(result.errors.join('\n')).toMatch(/accounts/);
  });

  it('refuses a bad launch key and an unknown traffic source', () => {
    const bad = parseTopicManifest(TOPIC.replace('ai-vadim-sperm-it', 'Ai Vadim').replace('tiktok', 'vk'));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.join('\n')).toMatch(/launch_key/);
    expect(bad.errors.join('\n')).toMatch(/traffic_source/);
  });

  it('refuses an account without a pixel', () => {
    const result = parseTopicManifest(TOPIC.replace('    pixel: "35968"\n', ''));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/second/);
  });

  it('refuses text that is not yaml at all', () => {
    expect(parseTopicManifest('{{').ok).toBe(false);
    expect(parseTopicManifest('- a\n- b').ok).toBe(false);
  });
});

describe('a campaign manifest', () => {
  it('parses against its topic', () => {
    const result = parseCampaignManifest(CAMPAIGN, topic());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.account).toBe('main');
    expect(result.value.tsp.budget).toBe(20);
    expect(result.value.tsp.bid).toBe(0.45);
    expect(result.value.tsp.launch_tomorrow).toBe(true);
    expect(result.value.tsp.end_date).toBeNull();
    expect(result.value.keyword_rotation).toBe(false);
  });

  it('refuses an account the topic does not have', () => {
    const result = parseCampaignManifest(CAMPAIGN.replace('account: main', 'account: third'), topic());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join()).toMatch(/third/);
    expect(result.errors.join()).toMatch(/main, second/);
  });

  it('names every missing required field at once', () => {
    const result = parseCampaignManifest('language: it\n', topic());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = result.errors.join('\n');
    for (const field of ['termgroup', 'article', 'country', 'account', 'tsp']) {
      expect(text).toMatch(field);
    }
  });

  it('refuses a budget or bid that is not a positive number', () => {
    const result = parseCampaignManifest(CAMPAIGN.replace('budget: 20', 'budget: -1').replace('bid: 0.45', 'bid: x'), topic());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join()).toMatch(/budget/);
    expect(result.errors.join()).toMatch(/bid/);
  });
});

describe('internalName', () => {
  it('is the name with the spaces taken out, nothing else changed', () => {
    expect(internalName('AI Vadim Sperm IT')).toBe('AIVadimSpermIT');
    expect(internalName('888 VLAD AutoLoans FR')).toBe('888VLADAutoLoansFR');
    expect(internalName('  AI  mob NL trap ')).toBe('AImobNLtrap');
  });
});

describe('starting a launch', () => {
  it('refuses a key that already has a folder', () => {
    expect(checkNewLaunch(['ai-a-b', 'ai-c-d'], 'ai-c-d')).toMatch(/ai-c-d/);
    expect(checkNewLaunch(['ai-a-b'], 'ai-c-d')).toBeNull();
  });

  it('refuses a malformed key before looking at anything else', () => {
    expect(checkNewLaunch([], 'Bad Key')).toMatch(/launch key/i);
  });

  it('lays out the folder tree with a topic manifest and a campaign example', () => {
    const tree = newLaunchTree({ launchKey: 'ai-vadim-sperm-it', name: 'AI Vadim Sperm IT' });
    expect(tree.dirs).toEqual(['termgroups', 'articles', 'batches', 'campaigns']);
    const names = tree.files.map(f => f.path);
    expect(names).toContain('topic.yaml');
    expect(names.some(n => n.startsWith('campaigns/') && n.endsWith('campaign.yaml'))).toBe(true);
  });

  it('writes a topic manifest that parses back, with the key and names filled in', () => {
    const tree = newLaunchTree({ launchKey: 'ai-vadim-sperm-it', name: 'AI Vadim Sperm IT' });
    const text = tree.files.find(f => f.path === 'topic.yaml')!.content;
    const parsed = parseTopicManifest(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.launch_key).toBe('ai-vadim-sperm-it');
    expect(parsed.value.name).toBe('AI Vadim Sperm IT');
    expect(parsed.value.internal_name).toBe('AIVadimSpermIT');
  });

  it('writes a campaign example that parses against that topic', () => {
    const tree = newLaunchTree({ launchKey: 'ai-vadim-sperm-it', name: 'AI Vadim Sperm IT' });
    const topicText = tree.files.find(f => f.path === 'topic.yaml')!.content;
    const campaignText = tree.files.find(f => f.path.endsWith('campaign.yaml'))!.content;
    const t = parseTopicManifest(topicText);
    if (!t.ok) throw new Error(t.errors.join());
    expect(parseCampaignManifest(campaignText, t.value).ok).toBe(true);
  });

  it('makes a name out of the key when none is given', () => {
    const tree = newLaunchTree({ launchKey: 'ai-mob-nl-trap' });
    const parsed = parseTopicManifest(tree.files.find(f => f.path === 'topic.yaml')!.content);
    expect(parsed.ok && parsed.value.name).toBe('ai mob nl trap');
  });
});

describe('ticket custom fields', () => {
  const defs = [
    { id: 'f1', name: 'launch_key', type: 'short_text' },
    {
      id: 'f2', name: 'вертикаль', type: 'drop_down',
      type_config: { options: [{ id: 'o1', name: 'jobs', orderindex: 0 }, { id: 'o2', name: 'avia', orderindex: 1 }] },
    },
    {
      id: 'f3', name: 'гео', type: 'labels',
      type_config: { options: [{ id: 'l1', label: 'DE' }, { id: 'l2', label: 'IT' }] },
    },
  ];

  it('maps values onto field ids, matching option names without regard to case', () => {
    const result = resolveTicketFields(defs, { launchKey: 'ai-a-b', vertical: 'Avia', geo: ['it', 'DE'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { id: 'f1', value: 'ai-a-b' },
      { id: 'f2', value: 'o2' },
      { id: 'f3', value: ['l2', 'l1'] },
    ]);
  });

  it('sends only the launch key when vertical and geo are not given', () => {
    const result = resolveTicketFields(defs, { launchKey: 'ai-a-b' });
    expect(result.ok && result.value).toEqual([{ id: 'f1', value: 'ai-a-b' }]);
  });

  it('names a value the list does not offer, and a field the list does not have', () => {
    const missing = resolveTicketFields(defs, { launchKey: 'ai-a-b', vertical: 'dental' });
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.errors.join()).toMatch(/dental/);
    const noField = resolveTicketFields(defs.slice(1), { launchKey: 'ai-a-b' });
    expect(noField.ok).toBe(false);
    expect(!noField.ok && noField.errors.join()).toMatch(/launch_key/);
  });
});
