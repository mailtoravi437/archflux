// R1-E11-T05: Getting-started checklist logic.
import { beforeEach, describe, expect, it } from 'vitest';
import { computeChecklist, dismissChecklist, isChecklistDismissed, visibleChecklistSteps } from '../lib/checklist';
import type { ArchEdge, ArchNode, DiagramDoc } from '../types';

function node(i: number): ArchNode {
  return { id: `n${i}`, label: `N${i}`, x: i * 10, y: 0, w: 100, h: 60 } as ArchNode;
}
function doc(nodes: number, edges: Partial<ArchEdge>[] = []): DiagramDoc {
  return {
    id: 'd', title: 't', nodes: Array.from({ length: nodes }, (_, i) => node(i)),
    edges: edges.map((e, i) => ({ id: `e${i}`, from: 'n0', label: '', ...e }) as ArchEdge),
    createdAt: 0, updatedAt: 0,
  } as DiagramDoc;
}
const base = { invitesSent: 0, sharesMade: 0, githubConnected: false, plan: 'free' };

describe('checklist (R1-E11-T05)', () => {
  beforeEach(() => localStorage.clear());

  it('add_5_elements true when any doc has ≥5 nodes', () => {
    expect(computeChecklist({ ...base, docs: [doc(4)] }).add_5_elements).toBe(false);
    expect(computeChecklist({ ...base, docs: [doc(2), doc(5)] }).add_5_elements).toBe(true);
  });

  it('nothing is ticked for an empty library', () => {
    const r = computeChecklist({ ...base, docs: [doc(0)] });
    expect(Object.values(r).every((v) => v === false)).toBe(true);
  });

  it('connect_two needs a connector with both ends', () => {
    expect(computeChecklist({ ...base, docs: [doc(2, [{ to: undefined, isDangling: true }])] }).connect_two).toBe(false);
    expect(computeChecklist({ ...base, docs: [doc(2, [{ to: 'n1' }])] }).connect_two).toBe(true);
  });

  it('server-derived steps follow their inputs', () => {
    const r = computeChecklist({ ...base, docs: [], invitesSent: 1, sharesMade: 1, githubConnected: true });
    expect(r.invite_teammate && r.share_or_publish && r.connect_github).toBe(true);
  });

  it('github step hidden on free', () => {
    expect(visibleChecklistSteps('free')).not.toContain('connect_github');
    expect(visibleChecklistSteps('member')).not.toContain('connect_github');
    expect(visibleChecklistSteps('team')).toContain('connect_github');
  });

  it('dismiss persists', () => {
    expect(isChecklistDismissed('a@x.com')).toBe(false);
    dismissChecklist('a@x.com');
    expect(isChecklistDismissed('a@x.com')).toBe(true);
    expect(isChecklistDismissed('b@x.com')).toBe(false);
    expect(localStorage.getItem('archflux:checklist:v1')).toContain('a@x.com');
  });
});
