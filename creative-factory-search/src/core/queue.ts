// The queue policy: what to do next with a call to the platform, given what
// has happened to it so far. A pure function over the history, so that the
// one rule the PRD insists on — an uncertain answer is read back, never blindly
// retried, because a duplicate article cannot be deleted — is tested here and
// merely obeyed by the server.
//
// The pauses live here too, as numbers with a reason each: reads go without a
// pause the way the admin fires five at once; writes inside a step get a small
// jitter; steps of the chain and campaigns get the pause a person takes between
// screens. None of them is derived from evidence about the platform's limits —
// there is none — so all of them are one config to tune on the first live runs.

export type CallKind = 'read' | 'write';

/**
 * How one attempt ended. A read that came back says whether it found the
 * entity the write was meant to create; that answer is what decides between
 * "done" and "send again".
 */
export type Outcome =
  | { status: 'ok'; found?: boolean }
  | { status: 'error'; code: number }
  | { status: 'timeout' };

export interface Attempt {
  kind: CallKind;
  outcome: Outcome;
}

export type NextAction =
  | { action: 'send' }
  | { action: 'done' }
  | { action: 'read-back' }
  | { action: 'retry'; delayMs: number }
  | { action: 'stop'; reason: string };

export interface QueueConfig {
  /** Before a read. Zero: the admin reads in bursts and nobody minds. */
  readPauseMs: number;
  /** Between writes inside one step — twelve uploads, a few headlines. */
  writeJitterMs: [number, number];
  /** Between steps of the chain. */
  stepPauseMs: [number, number];
  /** Between campaigns. */
  campaignPauseMs: [number, number];
  /** How many times a write is sent again after a read-back found nothing. */
  maxRetries: number;
  /** The first retry waits this long; each next one twice as long. */
  backoffBaseMs: number;
  /** How many failed read-backs in a row before giving up on the step. */
  maxReadBacks: number;
}

export const DEFAULT_QUEUE: QueueConfig = {
  readPauseMs: 0,
  writeJitterMs: [300, 800],
  stepPauseMs: [2000, 3000],
  campaignPauseMs: [5000, 10000],
  maxRetries: 3,
  backoffBaseMs: 2000,
  maxReadBacks: 3,
};

/**
 * The next thing to do with one write, from everything that has happened to
 * it. The history is the attempts in order: the write, the read-backs after
 * it, the next write, and so on.
 */
export function nextAction(history: readonly Attempt[], config: QueueConfig = DEFAULT_QUEUE): NextAction {
  const last = history[history.length - 1];
  if (last === undefined) return { action: 'send' };

  if (last.kind === 'write') {
    if (last.outcome.status === 'ok') return { action: 'done' };
    if (last.outcome.status === 'timeout' || last.outcome.code >= 500) return { action: 'read-back' };
    return { action: 'stop', reason: `платформа відповіла ${last.outcome.code} — запит треба виправити, а не повторювати` };
  }

  // The last attempt was a read-back.
  if (last.outcome.status === 'ok') {
    if (last.outcome.found === true) return { action: 'done' };
    const writes = history.filter(a => a.kind === 'write').length;
    if (writes > config.maxRetries) {
      return { action: 'stop', reason: `після ${writes} спроб платформа так і не створила сутність — зупиняюсь` };
    }
    return { action: 'retry', delayMs: config.backoffBaseMs * 2 ** (writes - 1) };
  }

  // The read-back itself did not come back. Reads are cheap and safe to
  // repeat — but not for ever.
  let failedReads = 0;
  for (let i = history.length - 1; i >= 0 && history[i]!.kind === 'read'; i--) {
    if (history[i]!.outcome.status !== 'ok') failedReads++;
  }
  if (failedReads >= config.maxReadBacks) {
    return { action: 'stop', reason: `платформа не відповідає на читання ${failedReads} рази поспіль — зупиняюсь` };
  }
  return { action: 'read-back' };
}

/** Where a pause goes: before a read, a write inside a step, a step, a campaign. */
export type PauseKind = 'read' | 'write' | 'step' | 'campaign';

const between = ([low, high]: [number, number], random: number): number =>
  Math.round(low + (high - low) * random);

/**
 * How long to wait before a call of this kind, in milliseconds. `random` is
 * a number in [0, 1) handed in rather than drawn, so the rule is testable and
 * the server decides where randomness comes from.
 */
export function pauseBefore(kind: PauseKind, config: QueueConfig = DEFAULT_QUEUE, random: () => number = Math.random): number {
  switch (kind) {
    case 'read': return config.readPauseMs;
    case 'write': return between(config.writeJitterMs, random());
    case 'step': return between(config.stepPauseMs, random());
    case 'campaign': return between(config.campaignPauseMs, random());
  }
}
