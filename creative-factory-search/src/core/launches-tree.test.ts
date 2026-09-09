import { describe, expect, it } from 'vitest';
import { buildLaunchesTree, type LaunchFolderListing } from './launches-tree.ts';

const TOPIC = (name: string, vertical: string | null) => [
  'launch_key: ai-x-y',
  `name: ${name}`,
  'traffic_source: tiktok',
  'site: 182',
  'accounts: { main: { ad_account: "1", pixel: "2" } }',
  ...(vertical === null ? [] : [`vertical: ${vertical}`]),
].join('\n');

const folder = (key: string, over: Partial<LaunchFolderListing> = {}): LaunchFolderListing => ({
  key, topicYaml: TOPIC(key, 'jobs'), paths: [], ...over,
});

describe('the launches tree', () => {
  it('is niche → topic → campaigns, with the mp4 count of each campaign before it goes up', () => {
    const tree = buildLaunchesTree([
      folder('ai-jobs-de', {
        paths: [
          'topic.yaml',
          'campaigns/de-a/campaign.yaml', 'campaigns/de-a/script.md',
          'campaigns/de-a/creatives/01.mp4', 'campaigns/de-a/creatives/02.MP4', 'campaigns/de-a/creatives/notes.txt',
          'campaigns/de-a/creatives/rejected/03.mp4', 'campaigns/de-a/creatives/rejected/03.reason.txt',
          'campaigns/de-b/campaign.yaml',
          'batches/b1/project.json', 'batches/b1/photos/1.jpg',
        ],
      }),
    ]);
    expect(tree).toEqual({
      niches: [{
        name: 'jobs',
        topics: [{
          key: 'ai-jobs-de', name: 'ai-jobs-de', vertical: 'jobs', problem: null,
          campaigns: [
            { name: 'de-a', manifest: true, creatives: 2, rejected: 1 },
            { name: 'de-b', manifest: true, creatives: 0, rejected: 0 },
          ],
        }],
      }],
    });
  });

  it('groups topics by the vertical in topic.yaml, alphabetically, with the ones without a vertical last', () => {
    const tree = buildLaunchesTree([
      folder('ai-b-loans', { topicYaml: TOPIC('B', 'loans') }),
      folder('ai-a-jobs', { topicYaml: TOPIC('A', 'jobs') }),
      folder('ai-c-none', { topicYaml: TOPIC('C', null) }),
      folder('ai-d-jobs', { topicYaml: TOPIC('D', 'Jobs') }),
    ]);
    expect(tree.niches.map(n => [n.name, n.topics.map(t => t.key)])).toEqual([
      ['jobs', ['ai-a-jobs', 'ai-d-jobs']],
      ['loans', ['ai-b-loans']],
      ['без ніші', ['ai-c-none']],
    ]);
  });

  it('keeps a folder whose manifest does not parse, named by its key, with the problem beside it', () => {
    const tree = buildLaunchesTree([folder('ai-broken-one', { topicYaml: 'name: [', paths: ['campaigns/x/campaign.yaml'] })]);
    const topic = tree.niches[0]!.topics[0]!;
    expect(topic.name).toBe('ai-broken-one');
    expect(topic.problem).toMatch(/yaml/);
    expect(topic.campaigns.map(c => c.name)).toEqual(['x']);
    const none = buildLaunchesTree([folder('ai-no-manifest', { topicYaml: null })]);
    expect(none.niches[0]!.topics[0]!.problem).toMatch(/topic\.yaml/);
  });

  it('counts a campaign only for a folder under campaigns/, and creatives only at the top of creatives/', () => {
    const tree = buildLaunchesTree([folder('ai-x-y', { paths: ['campaigns/de-a/creatives/deep/01.mp4', 'campaigns/de-a/creatives/01.mp4', 'campaigns/README.md'] })]);
    expect(tree.niches[0]!.topics[0]!.campaigns).toEqual([{ name: 'de-a', manifest: false, creatives: 1, rejected: 0 }]);
  });

  it('is empty when there are no launches', () => {
    expect(buildLaunchesTree([])).toEqual({ niches: [] });
  });
});
