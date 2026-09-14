// One write under the queue policy, as the server obeys it: send, and on an
// uncertain answer read the platform back before sending again.
// `core/queue.ts` decides; this loop only does what it says. Shared by an
// apply step and a bid or budget change, which differ only in what a
// read-back looks for and in how a pause is taken.
import { DEFAULT_QUEUE, nextAction, pauseBefore, type Attempt, type WriteKind } from '../core/queue.ts';
import type { Answer } from './platform.ts';

/** The policy said stop; the message is its reason, with the platform's words when it answered. */
export class PolicyStop extends Error {}

export interface PolicyWrite<T> {
  kind: WriteKind;
  send: () => Promise<Answer>;
  /** The read-back: the entity as the platform shows it now, or null when it does not show it yet. */
  readBack: () => Promise<T | null>;
  pause: (ms: number) => Promise<void>;
  /** Asked right before each send, to throw when nothing more must go out. */
  checkpoint?: () => void;
}

export const toOutcome = (answer: Answer): Attempt['outcome'] =>
  answer.status === 'ok' ? { status: 'ok' } : answer.status === 'timeout' ? { status: 'timeout' } : { status: 'error', code: answer.code };

export async function writeUnderPolicy<T>(write: PolicyWrite<T>): Promise<{ answer: Answer | null; found: T | null }> {
  const history: Attempt[] = [];
  let answer: Answer | null = null;
  let found: T | null = null;
  for (;;) {
    const next = nextAction(history, DEFAULT_QUEUE, write.kind);
    if (next.action === 'done') return { answer, found };
    if (next.action === 'stop') throw new PolicyStop(next.reason + (answer?.status === 'error' ? ` (${answer.text})` : ''));
    if (next.action === 'send' || next.action === 'retry') {
      // The backoff, then the jitter every write gets.
      if (next.action === 'retry') await write.pause(next.delayMs);
      await write.pause(pauseBefore('write', DEFAULT_QUEUE));
      write.checkpoint?.();
      answer = await write.send();
      history.push({ kind: 'write', outcome: toOutcome(answer) });
      continue;
    }
    try {
      found = await write.readBack();
      history.push({ kind: 'read', outcome: { status: 'ok', found: found !== null } });
    } catch {
      history.push({ kind: 'read', outcome: { status: 'timeout' } });
    }
  }
}
