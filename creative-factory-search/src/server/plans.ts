// A topic's plan, counted in the background. «Рахувати план» starts a count
// and returns; the server goes on counting whatever the editor does — another
// tab, a reload — and every read of the table carries the result, or that it
// is still counting. One count per topic at a time. A result stands while the
// folder is what it was counted for: a folder that changed since has no plan
// until it is counted again.
import type { PlanDescription } from './apply.ts';
import { RefusedError } from './launches.ts';
import { PlatformReadError } from './platform.ts';

/** What the table says about the plan: counting, the plan, or the sentence why there is none. */
export interface CountedPlan {
  counting: boolean;
  plan: PlanDescription | null;
  note: string;
}

interface Count extends CountedPlan {
  /** The folder the plan was counted for, as the table read it. */
  folder: string;
}

const counts = new Map<string, Count>();

/**
 * Start counting the topic's plan, unless a count is already on — a second
 * press joins the first. `folder` is the topic folder as read now; the result
 * is kept against it.
 */
export function countPlan(key: string, folder: string, work: () => Promise<PlanDescription>): void {
  const known = counts.get(key);
  if (known?.counting === true) return;
  const count: Count = { counting: true, plan: null, note: '', folder };
  counts.set(key, count);
  work()
    .then(plan => { count.plan = plan; })
    .catch((e: Error) => {
      if (!(e instanceof RefusedError || e instanceof PlatformReadError)) console.error(`plan ${key}:`, e.message);
      count.note = e.message;
    })
    .finally(() => { count.counting = false; });
}

/** The plan for the topic as the folder is now: still counting, counted for this folder, or none. */
export function countedPlan(key: string, folder: string): CountedPlan {
  const count = counts.get(key);
  if (count === undefined) return { counting: false, plan: null, note: '' };
  if (count.counting) return { counting: true, plan: null, note: '' };
  if (count.folder !== folder) return { counting: false, plan: null, note: '' };
  return { counting: false, plan: count.plan, note: count.note };
}
