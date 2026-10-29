import { describe, expect, it, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BlueprintThumb, loadCustomBlueprints, persistCustomBlueprints } from '../screens/BlueprintsScreen';
import { deriveCheckpointPRs } from '../screens/GitScreen';
import { isTeamUnconfigured, resolveReviewers } from '../screens/ReviewsScreen';
import { pushRecentShape } from '../screens/CanvasScreen';
import { previewShapesForProviders } from '../screens/OnboardingScreen';
import type { ArchEdge, ArchNode } from '../types';
import React from 'react';

const node = (over: Partial<ArchNode> = {}): ArchNode => ({
  id: 'n1',
  type: 'service',
  label: 'Order Service',
  tag: 'Spring Boot',
  health: 'Healthy',
  x: 100,
  y: 100,
  w: 170,
  h: 70,
  stroke: '#2563EB',
  ...over,
});

describe('BlueprintThumb', () => {
  it('renders one rect per node and one line per resolved edge', () => {
    const nodes = [node(), node({ id: 'n2', x: 400, label: 'DB' })];
    const edges: ArchEdge[] = [
      { id: 'e1', from: 'n1', to: 'n2', label: 'POST /orders', color: '#2563EB' },
    ];
    const { container } = render(React.createElement(BlueprintThumb, { nodes, edges, title: 'T' }));
    expect(container.querySelectorAll('rect').length).toBe(2);
    expect(container.querySelectorAll('line').length).toBe(1);
  });

  it('skips dangling edges and renders empty state', () => {
    const edges: ArchEdge[] = [
      { id: 'dangle', from: 'n1', to: null, label: 'Unresolved', color: '#DC2626', isDangling: true },
    ];
    const { container } = render(React.createElement(BlueprintThumb, { nodes: [node()], edges, title: 'T' }));
    expect(container.querySelectorAll('line').length).toBe(0);
    const { container: empty } = render(React.createElement(BlueprintThumb, { nodes: [], edges: [], title: 'E' }));
    expect(empty.textContent).toContain('Empty');
  });
});

describe('custom blueprints persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips valid entries and drops invalid ones', () => {
    expect(loadCustomBlueprints()).toEqual([]);
    persistCustomBlueprints([
      {
        id: 'custom-1', title: 'Mine', category: 'Custom', icon: '⭐', desc: 'd',
        nodeCount: 1, edgeCount: 0, nodes: [node()], edges: [], custom: true,
      },
    ]);
    expect(loadCustomBlueprints().map((b) => b.id)).toEqual(['custom-1']);
    localStorage.setItem('archflux:blueprints:custom:v1', JSON.stringify([{ nope: true }, null]));
    expect(loadCustomBlueprints()).toEqual([]);
  });
});

describe('deriveCheckpointPRs', () => {
  it('maps checkpoints newest-first with active status', () => {
    const prs = deriveCheckpointPRs([
      { id: 'a', title: 'v1', meta: 'm', active: true, nodes: [{ label: 'S', tag: 't' }], edges: [] },
      { id: 'b', title: 'v2', meta: 'm2', nodes: [], edges: [] },
    ]);
    expect(prs.map((p) => p.id)).toEqual(['cp-a', 'cp-b']);
    expect(prs[0].status).toContain('Checks Passed');
    expect(prs[1].status).toContain('Draft');
    expect(prs[0].diff[0].text).toContain('S');
  });
});

describe('pushRecentShape', () => {
  it('moves to front, dedupes, and caps at 8', () => {
    expect(pushRecentShape([], 'a')).toEqual(['a']);
    expect(pushRecentShape(['a', 'b'], 'b')).toEqual(['b', 'a']);
    const full = ['1', '2', '3', '4', '5', '6', '7', '8'];
    expect(pushRecentShape(full, 'new')).toEqual(['new', '1', '2', '3', '4', '5', '6', '7']);
  });
});

describe('StorageFooter thresholds', () => {
  // R1-E14-T04: the Storage card became a footer line (Library.dc.html).
  it('warns at 80%, errors at 95%, and offers free-up', async () => {
    const { StorageFooter } = await import('../screens/DashboardScreen');
    const noop = () => {};
    const { container, unmount } = render(
      React.createElement(StorageFooter, { docCount: 20, usedKB: '10', onFreeUp: noop, onManage: noop }),
    );
    expect(container.textContent).toContain('nearly full');
    expect(container.querySelector('button')?.textContent).toContain('Free up space');
    unmount();
    const full = render(
      React.createElement(StorageFooter, { docCount: 24, usedKB: '10', onFreeUp: noop, onManage: noop }),
    );
    expect(full.container.textContent).toContain('full');
    full.unmount();
    const ok = render(
      React.createElement(StorageFooter, { docCount: 5, usedKB: '10', onFreeUp: noop, onManage: noop }),
    );
    expect(ok.container.textContent).not.toContain('nearly full');
    expect(ok.container.querySelector('button')).toBeNull();
    expect(ok.container.querySelector('a')?.textContent).toContain('Manage storage');
    ok.unmount();
  });
});

describe('previewShapesForProviders', () => {
  it('returns everything on empty selection and filters AWS', () => {
    const all = previewShapesForProviders([]);
    expect(all.length).toBeGreaterThan(0);
    const aws = previewShapesForProviders(['AWS']);
    expect(aws.length).toBeGreaterThan(0);
    expect(aws.length).toBeLessThan(all.length);
    expect(aws.every((s) => `${s.provider} ${s.tag} ${s.label}`.toLowerCase().includes('aws'))).toBe(true);
  });

  it('maps Google Cloud to GCP shapes', () => {
    const gcp = previewShapesForProviders(['Google Cloud']);
    expect(gcp.length).toBeGreaterThan(0);
    expect(gcp.every((s) => `${s.provider} ${s.tag} ${s.label}`.toLowerCase().match(/gcp|google/))).toBeTruthy();
  });
});

describe('resolveReviewers', () => {
  const TEAM = JSON.stringify([
    { name: 'Ada A.', role: 'Admin', status: 'active' },
    { name: 'Bob B.', role: 'Editor', status: 'active' },
    { name: 'Cid C.', role: 'Reviewer', status: 'invited' },
  ]);

  it('uses team members with Admins pre-approved and flagged auto', () => {
    const r = resolveReviewers(TEAM, null, 'You');
    expect(r.map((x) => x.name)).toEqual(['Ada A.', 'Bob B.']);
    expect(r[0].approved).toBe(true);
    expect(r[0].auto).toBe(true);
    expect(r[1].approved).toBe(false);
    expect(r[1].auto).toBeUndefined();
  });

  it('approves non-admins on decision and falls back when empty', () => {
    expect(resolveReviewers(TEAM, 'approved', 'You')[1].approved).toBe(true);
    const fallback = resolveReviewers(null, null, 'You');
    expect(fallback.map((x) => x.name)).toEqual(['You']);
    expect(resolveReviewers('not-json', null, 'Dana').map((x) => x.name)).toEqual(['Dana']);
  });

  it('detects an unconfigured team for empty, invalid, or invited-only teams', () => {
    expect(isTeamUnconfigured(null)).toBe(true);
    expect(isTeamUnconfigured('not-json')).toBe(true);
    expect(isTeamUnconfigured('[]')).toBe(true);
    expect(isTeamUnconfigured(TEAM)).toBe(false);
  });
});
