// The window's place as an address: which tab. Kept in the hash so a reload
// opens where the buyer was and the browser's Back walks between tabs.

export type Tab = 'creatives' | 'launch' | 'subtitles';

const TABS: readonly Tab[] = ['creatives', 'launch', 'subtitles'];

/** The tab the hash names; an empty or unknown one — an old `#/launches/...` link too — opens the creatives. */
export function parseRoute(hash: string): Tab {
  const [tabPart] = hash.replace(/^#\/?/, '').split('/');
  return TABS.find(t => t === tabPart) ?? 'creatives';
}

export const routeHash = (tab: Tab): string => `#/${tab}`;
