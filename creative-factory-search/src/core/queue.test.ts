import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUEUE, nextAction, pauseBefore, type Attempt, type QueueConfig,
} from './queue.ts';

const write = (outcome: Attempt['outcome']): Attempt => ({ kind: 'write', outcome });
const read = (outcome: Attempt['outcome']): Attempt => ({ kind: 'read', outcome });

describe('nextAction after a write', () => {
  it('is done when the platform answered ok', () => {
    expect(nextAction([write({ status: 'ok' })])).toEqual({ action: 'done' });
  });

  it('reads back rather than retrying after a timeout — the entity may exist', () => {
    expect(nextAction([write({ status: 'timeout' })])).toEqual({ action: 'read-back' });
  });

  it('reads back after a 5xx too: the server may have written before it fell over', () => {
    expect(nextAction([write({ status: 'error', code: 502 })])).toEqual({ action: 'read-back' });
    expect(nextAction([write({ status: 'error', code: 500 })])).toEqual({ action: 'read-back' });
  });

  it('stops on a 4xx: the request was wrong, and sending it again will not make it right', () => {
    const next = nextAction([write({ status: 'error', code: 422 })]);
    expect(next.action).toBe('stop');
    expect(next.action === 'stop' && next.reason).toMatch(/422/);
  });

  it('retries with backoff once a read-back found nothing', () => {
    const first = nextAction([write({ status: 'timeout' }), read({ status: 'ok', found: false })]);
    expect(first).toEqual({ action: 'retry', delayMs: DEFAULT_QUEUE.backoffBaseMs });
    const second = nextAction([
      write({ status: 'timeout' }), read({ status: 'ok', found: false }),
      write({ status: 'timeout' }), read({ status: 'ok', found: false }),
    ]);
    expect(second).toEqual({ action: 'retry', delayMs: DEFAULT_QUEUE.backoffBaseMs * 2 });
  });

  it('never retries once a read-back found the entity', () => {
    expect(nextAction([write({ status: 'timeout' }), read({ status: 'ok', found: true })]))
      .toEqual({ action: 'done' });
  });

  it('reads back again when the read-back itself failed, and stops when reads keep failing', () => {
    expect(nextAction([write({ status: 'timeout' }), read({ status: 'timeout' })]))
      .toEqual({ action: 'read-back' });
    const exhausted = nextAction([
      write({ status: 'timeout' }),
      read({ status: 'timeout' }), read({ status: 'timeout' }), read({ status: 'timeout' }),
    ]);
    expect(exhausted.action).toBe('stop');
  });

  it('stops after the retries are used up', () => {
    const history: Attempt[] = [];
    for (let i = 0; i <= DEFAULT_QUEUE.maxRetries; i++) {
      history.push(write({ status: 'timeout' }), read({ status: 'ok', found: false }));
    }
    const next = nextAction(history);
    expect(next.action).toBe('stop');
    expect(next.action === 'stop' && next.reason).toMatch(/спроб/);
  });

  it('starts with a write, so an empty history is asked to send', () => {
    expect(nextAction([])).toEqual({ action: 'send' });
  });
});

describe('pauseBefore', () => {
  const config: QueueConfig = {
    ...DEFAULT_QUEUE,
    writeJitterMs: [300, 800],
    stepPauseMs: [2000, 3000],
    campaignPauseMs: [5000, 10000],
  };

  it('never pauses before a read', () => {
    expect(pauseBefore('read', config, () => 0.5)).toBe(0);
  });

  it('jitters between writes inside a step, pauses longer between steps, longest between campaigns', () => {
    const at = (r: number) => ({
      write: pauseBefore('write', config, () => r),
      step: pauseBefore('step', config, () => r),
      campaign: pauseBefore('campaign', config, () => r),
    });
    expect(at(0)).toEqual({ write: 300, step: 2000, campaign: 5000 });
    expect(at(1)).toEqual({ write: 800, step: 3000, campaign: 10000 });
    const mid = at(0.5);
    expect(mid.write).toBeLessThan(mid.step);
    expect(mid.step).toBeLessThan(mid.campaign);
  });
});
