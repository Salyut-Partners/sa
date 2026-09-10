import { describe, expect, it } from 'vitest';
import { emptyCampaignState } from './campaign-plan.ts';
import { emptyState } from './plan.ts';
import { builtOf, checkStatuses, DEFAULT_TICKET_STATUSES as S, nextStatus, planTicketSync } from './ticket-sync.ts';

const ticket = (name: string, status: string, id = 't-' + name) => ({ id, name, url: 'https://app.clickup.com/t/' + id, status });

describe('nextStatus', () => {
  it('raises «to do» to «in progress» once a campaign is built, whatever the case of the names', () => {
    expect(nextStatus(true, 'TO DO', S)).toBe('in progress');
    expect(nextStatus(true, 'to do', S)).toBe('in progress');
  });

  it('never lowers, and never touches «complete» or a status it does not know', () => {
    expect(nextStatus(false, 'in progress', S)).toBeNull();
    expect(nextStatus(false, 'to do', S)).toBeNull();
    expect(nextStatus(true, 'in progress', S)).toBeNull();
    expect(nextStatus(true, 'complete', S)).toBeNull();
    expect(nextStatus(true, 'review', S)).toBeNull();
  });
});

describe('planTicketSync', () => {
  it('files a ticket for a folder the list has never heard of', () => {
    const plan = planTicketSync([{ launchKey: 'ai-a-b', built: false, ticket: null }], [], S);
    expect(plan.actions).toEqual([{ kind: 'create', launchKey: 'ai-a-b' }]);
  });

  it('adopts a ticket found by name when the state lost it, instead of making a twin', () => {
    const plan = planTicketSync([{ launchKey: 'ai-a-b', built: false, ticket: null }], [ticket('AI-A-B', 'to do')], S);
    expect(plan.actions).toEqual([{ kind: 'adopt', launchKey: 'ai-a-b', ticket: { id: 't-AI-A-B', url: 'https://app.clickup.com/t/t-AI-A-B' } }]);
  });

  it('finds the ticket by the id in the state even after it was renamed', () => {
    const list = [ticket('renamed by hand', 'to do', 'x1')];
    const plan = planTicketSync([{ launchKey: 'ai-a-b', built: true, ticket: { id: 'x1', url: 'u' } }], list, S);
    expect(plan.actions).toEqual([{ kind: 'status', launchKey: 'ai-a-b', ticket: { id: 'x1', url: list[0]!.url }, from: 'to do', to: 'in progress' }]);
  });

  it('raises the ticket a buyer moved back by hand while the folder has a built campaign', () => {
    const plan = planTicketSync([{ launchKey: 'ai-a-b', built: true, ticket: null }], [ticket('ai-a-b', 'to do')], S);
    expect(plan.actions.map(a => a.kind)).toEqual(['adopt', 'status']);
  });

  it('does nothing for a folder whose ticket is where it should be', () => {
    const t = ticket('ai-a-b', 'in progress');
    const plan = planTicketSync([{ launchKey: 'ai-a-b', built: true, ticket: { id: t.id, url: t.url } }], [t], S);
    expect(plan.actions).toEqual([]);
    expect(plan.notes).toEqual({});
  });

  it('refuses to choose between two tickets of one name', () => {
    const plan = planTicketSync([{ launchKey: 'ai-a-b', built: false, ticket: null }], [ticket('ai-a-b', 'to do', '1'), ticket('ai-a-b', 'to do', '2')], S);
    expect(plan.actions).toEqual([]);
    expect(plan.notes['ai-a-b']).toMatch(/кілька тікетів/);
  });
});

describe('builtOf and checkStatuses', () => {
  it('is built once any campaign of the state has a builder', () => {
    const state = { ...emptyState(), campaigns: { 'de-a': emptyCampaignState(), 'de-b': { ...emptyCampaignState(), builder: { id: 1, campaign_id: null, campaign_name: null } } } };
    expect(builtOf(emptyState())).toBe(false);
    expect(builtOf(state)).toBe(true);
  });

  it('names the status the list lacks', () => {
    expect(checkStatuses(['To Do', 'In Progress', 'Complete'], S)).toBeNull();
    expect(checkStatuses(['new', 'in progress'], S)).toMatch(/«to do»/);
  });
});
