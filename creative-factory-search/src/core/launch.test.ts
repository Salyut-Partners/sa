import { describe, expect, it } from 'vitest';
import {
  checkNewLaunch, internalName, isLaunchKey, NAME_PLACEHOLDER, newLaunchTree, parseCampaignManifest,
  parseTopicManifest, resolveTicketFields, sourceOf, topicSources, type TopicManifest,
} from './launch.ts';

const TOPIC = `
launch_key: ai-vadim-sperm-it
name: AI Vadim Sperm IT
internal_name: AIVadimSpermIT
site: 182
accounts:
  main:
    source: tiktok
    ad_account: "53560"
    pixel: "35967"
  second:
    source: facebook
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
    expect(t.site).toBe('182');
    expect(Object.keys(t.accounts)).toEqual(['main', 'second']);
    expect(t.accounts['main']).toEqual({ source: 'tiktok', ad_account: '53560', pixel: '35967' });
    expect(topicSources(t)).toEqual(['tiktok', 'facebook']);
    expect(sourceOf(t, { account: 'second' })).toBe('facebook');
    expect(sourceOf(t, { account: 'ghost' })).toBeNull();
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
    expect(result.errors.join('\n')).toMatch(/site/);
    expect(result.errors.join('\n')).toMatch(/accounts/);
  });

  it('refuses a bad launch key and an unknown cabinet source', () => {
    const bad = parseTopicManifest(TOPIC.replace('ai-vadim-sperm-it', 'Ai Vadim').replace('tiktok', 'vk'));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.join('\n')).toMatch(/launch_key/);
    expect(bad.errors.join('\n')).toMatch(/кабінет `main`.*source/);
  });

  it('refuses a traffic source on the topic and a cabinet without one, saying where it went', () => {
    const onTopic = parseTopicManifest(TOPIC.replace('site: 182', 'traffic_source: tiktok\nsite: 182'));
    expect(onTopic.ok).toBe(false);
    expect(!onTopic.ok && onTopic.errors.join('\n')).toMatch(/traffic_source.*переїхало на кабінет/);
    const noSource = parseTopicManifest(TOPIC.replace('    source: facebook\n', ''));
    expect(noSource.ok).toBe(false);
    expect(!noSource.ok && noSource.errors.join('\n')).toMatch(/кабінет `second`.*source/);
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
    expect(result.value.tsp).toMatchObject({ age: ['All'], gender: 'All', devices: ['All'], os: ['All'], schedule: [] });
  });

  it('takes the audience block of the TSP as names or lists of names', () => {
    const withAudience = CAMPAIGN + '  age: [25-34, 35-44]\n  gender: female\n  devices: mobile\n  os: [ios]\n';
    const result = parseCampaignManifest(withAudience, topic());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tsp.age).toEqual(['25-34', '35-44']);
    expect(result.value.tsp.gender).toBe('female');
    expect(result.value.tsp.devices).toEqual(['mobile']);
    expect(result.value.tsp.os).toEqual(['ios']);
    const bad = parseCampaignManifest(CAMPAIGN + '  age: { from: 25 }\n', topic());
    expect(!bad.ok && bad.errors.join()).toMatch(/age/);
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
    expect(tree.dirs.slice(0, 4)).toEqual(['termgroups', 'articles', 'sources', 'campaigns']);
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

  it('writes the vertical into the manifest when one is given, and reads it back', () => {
    const named = newLaunchTree({ launchKey: 'ai-x-y', vertical: 'jobs' }).files.find(f => f.path === 'topic.yaml')!;
    const parsed = parseTopicManifest(named.content.replace('REPLACE_SITE_ID', '1'));
    expect(parsed.ok && parsed.value.vertical).toBe('jobs');
    const bare = newLaunchTree({ launchKey: 'ai-x-y' }).files.find(f => f.path === 'topic.yaml')!;
    const none = parseTopicManifest(bare.content.replace('REPLACE_SITE_ID', '1'));
    expect(none.ok && none.value.vertical).toBe(null);
    expect(parseTopicManifest(TOPIC + 'vertical: [a]\n').ok).toBe(false);
  });

  it('leaves a placeholder name when none is given, never one derived from the key', () => {
    const tree = newLaunchTree({ launchKey: 'ai-mob-nl-trap' });
    const parsed = parseTopicManifest(tree.files.find(f => f.path === 'topic.yaml')!.content);
    expect(parsed.ok && parsed.value.name).toBe(NAME_PLACEHOLDER);
    expect(tree.dirs).toContain('campaigns/example/creatives');
  });
});

describe('geo in the manifest', () => {
  it('reads a list of codes, a comma string, or nothing', () => {
    const base = 'launch_key: ai-a-b\nname: AI A B\nsite: 182\naccounts:\n  main: {source: tiktok, ad_account: "1", pixel: "2"}\n';
    const list = parseTopicManifest(base + 'geo: [DE, IT]');
    expect(list.ok && list.value.geo).toEqual(['DE', 'IT']);
    const text = parseTopicManifest(base + 'geo: "DE, IT"');
    expect(text.ok && text.value.geo).toEqual(['DE', 'IT']);
    const none = parseTopicManifest(base);
    expect(none.ok && none.value.geo).toEqual([]);
    const bad = parseTopicManifest(base + 'geo: {a: 1}');
    expect(bad.ok).toBe(false);
  });

  it('is written by sa new so a ticket filed from the folder carries the same labels', () => {
    const tree = newLaunchTree({ launchKey: 'ai-a-b', name: 'AI A B', geo: ['DE', 'IT'] });
    const manifest = tree.files.find(f => f.path === 'topic.yaml')!.content;
    const parsed = parseTopicManifest(manifest);
    expect(parsed.ok && parsed.value.geo).toEqual(['DE', 'IT']);
    const bare = parseTopicManifest(newLaunchTree({ launchKey: 'ai-a-b', name: 'AI A B' }).files.find(f => f.path === 'topic.yaml')!.content);
    expect(bare.ok && bare.value.geo).toEqual([]);
  });
});

describe('ticket custom fields', () => {
  const defs = [
    { id: 'f1', name: 'topic', type: 'short_text' },
    {
      id: 'f2', name: 'Vertical', type: 'drop_down',
      type_config: { options: [{ id: 'o1', name: 'Jobs', orderindex: 0 }, { id: 'o2', name: 'Avia', orderindex: 1 }] },
    },
    {
      id: 'f3', name: 'geo', type: 'labels',
      type_config: { options: [{ id: 'l1', label: 'DE' }, { id: 'l2', label: 'IT' }] },
    },
  ];

  it('maps values onto field ids, matching option names without regard to case', () => {
    const result = resolveTicketFields(defs, { launchKey: 'ai-a-b', name: 'AI A B', vertical: 'avia', geo: ['it', 'DE'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { id: 'f1', value: 'AI A B' },
      { id: 'f2', value: 'o2' },
      { id: 'f3', value: ['l2', 'l1'] },
    ]);
  });

  it('sends no field at all when only the key is given — the key is the task name', () => {
    const result = resolveTicketFields(defs, { launchKey: 'ai-a-b' });
    expect(result.ok && result.value).toEqual([]);
  });

  it('drops the topic name without complaint when the list has no topic field', () => {
    const result = resolveTicketFields(defs.slice(1), { launchKey: 'ai-a-b', name: 'AI A B', vertical: 'jobs' });
    expect(result.ok && result.value).toEqual([{ id: 'f2', value: 'o1' }]);
  });

  it('names a value the list does not offer, and a field the list does not have', () => {
    const missing = resolveTicketFields(defs, { launchKey: 'ai-a-b', vertical: 'dental' });
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.errors.join()).toMatch(/dental/);
    const noField = resolveTicketFields(defs.slice(0, 1), { launchKey: 'ai-a-b', geo: ['DE'] });
    expect(noField.ok).toBe(false);
    expect(!noField.ok && noField.errors.join()).toMatch(/geo/);
  });
});
