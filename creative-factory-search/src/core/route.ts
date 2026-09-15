// The window's place as an address: which tab, and on the launches tab which
// topic. Kept in the hash so a reload opens where the buyer was, the browser's
// Back walks between tabs, and a link opens the same topic in another window.
// The plan panel is deliberately not part of it: it is a step towards live
// money, and a reload does not reopen it.
import { isLaunchKey } from './launch.ts';

export type Tab = 'creatives' | 'subtitles' | 'launches';

export interface Route {
  tab: Tab;
  /** The chosen topic's launch key — only ever on the launches tab. */
  topic: string | null;
}

const TABS: readonly Tab[] = ['creatives', 'subtitles', 'launches'];

export function parseRoute(hash: string): Route {
  const [tabPart, topicPart] = hash.replace(/^#\/?/, '').split('/');
  const tab = TABS.find(t => t === tabPart) ?? 'creatives';
  const topic = tab === 'launches' && isLaunchKey(topicPart) ? topicPart : null;
  return { tab, topic };
}

export const routeHash = (route: Route): string =>
  route.tab === 'launches' && route.topic !== null ? `#/launches/${route.topic}` : `#/${route.tab}`;
