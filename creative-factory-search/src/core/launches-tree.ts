// The launches as the tab shows them: niche → topic → campaigns, built from
// nothing but the folder structure under `launches_root`. Pure: the server
// lists the paths, this decides what they mean, and the tab draws it.
//
// The state of a campaign on the platform is deliberately not here. The tree
// is what is on disk, read in a blink and refreshed whenever a folder appears;
// what the platform would be asked for is the plan, fetched on demand.
import { parseTopicManifest } from './launch.ts';

export interface LaunchFolderListing {
  /** The folder name under `launches_root`. */
  key: string;
  /** `topic.yaml` as read, or null when the folder has none. */
  topicYaml: string | null;
  /** Paths under the folder, relative, with forward slashes. */
  paths: string[];
}

export interface TreeCampaign {
  name: string;
  /** Whether `campaign.yaml` is there. */
  manifest: boolean;
  /** mp4 files at the top of `creatives/` — what a plan would send. */
  creatives: number;
  /** mp4 files under `creatives/rejected/`. */
  rejected: number;
}

export interface TreeTopic {
  key: string;
  /** The manifest's name, or the key when the manifest cannot be read. */
  name: string;
  vertical: string | null;
  /** Why the manifest could not be read, or null. */
  problem: string | null;
  /** The ticket, as the server's last sync knew it: a link, or the sentence why there is none. Absent until a sync ran. */
  ticket?: { url: string | null; note: string | null };
  campaigns: TreeCampaign[];
}

export interface TreeNiche {
  name: string;
  topics: TreeTopic[];
}

export interface LaunchesTree {
  niches: TreeNiche[];
}

/** Where topics whose manifest names no vertical go. */
export const NO_NICHE = 'без ніші';

const CAMPAIGN_PATH = /^campaigns\/([^/]+)(?:\/(.*))?$/;
const isVideo = (name: string): boolean => /\.mp4$/i.test(name);

function campaignsOf(paths: readonly string[]): TreeCampaign[] {
  const campaigns = new Map<string, TreeCampaign>();
  for (const path of paths) {
    const match = CAMPAIGN_PATH.exec(path);
    if (match === null) continue;
    const name = match[1]!;
    const rest = match[2] ?? '';
    // A file directly under campaigns/ is not a campaign; a folder is, once anything is in it.
    if (rest === '') continue;
    const own = campaigns.get(name) ?? { name, manifest: false, creatives: 0, rejected: 0 };
    campaigns.set(name, own);
    const parts = rest.split('/');
    if (parts.length === 1 && parts[0] === 'campaign.yaml') own.manifest = true;
    else if (parts.length === 2 && parts[0] === 'creatives' && isVideo(parts[1]!)) own.creatives += 1;
    else if (parts.length === 3 && parts[0] === 'creatives' && parts[1] === 'rejected' && isVideo(parts[2]!)) own.rejected += 1;
  }
  return [...campaigns.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function topicOf(folder: LaunchFolderListing): TreeTopic {
  const campaigns = campaignsOf(folder.paths);
  if (folder.topicYaml === null) return { key: folder.key, name: folder.key, vertical: null, problem: 'немає topic.yaml', campaigns };
  const parsed = parseTopicManifest(folder.topicYaml);
  if (!parsed.ok) return { key: folder.key, name: folder.key, vertical: null, problem: 'topic.yaml: ' + parsed.errors.join('; '), campaigns };
  return { key: folder.key, name: parsed.value.name, vertical: parsed.value.vertical, problem: null, campaigns };
}

export function buildLaunchesTree(folders: readonly LaunchFolderListing[]): LaunchesTree {
  const niches = new Map<string, TreeTopic[]>();
  for (const folder of folders) {
    const topic = topicOf(folder);
    const niche = topic.vertical?.toLowerCase() ?? NO_NICHE;
    const list = niches.get(niche) ?? [];
    list.push(topic);
    niches.set(niche, list);
  }
  return {
    niches: [...niches.entries()]
      .sort(([a], [b]) => (a === NO_NICHE ? 1 : b === NO_NICHE ? -1 : a.localeCompare(b)))
      .map(([name, topics]) => ({ name, topics: topics.sort((a, b) => a.key.localeCompare(b.key)) })),
  };
}
