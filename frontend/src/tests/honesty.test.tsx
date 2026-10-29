import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import HonestyBadge from '../components/HonestyBadge';
import {
  CONNECTED,
  DEMO,
  NOT_CONNECTED,
  SIMULATED,
  SOURCE_MODES,
  badgeLabelForStatus,
  connectorDisplayStatus,
  isServerDocId,
  sourceModeForDoc,
  sourceModeLabel,
  sourceModeTooltip,
  surfaceBadge,
} from '../lib/honesty';

describe('sourceModeForDoc', () => {
  it('maps local doc-* ids to local', () => {
    expect(sourceModeForDoc('doc-123')).toBe('local');
    expect(sourceModeForDoc('doc-checkout-mesh')).toBe('local');
  });

  it('maps server UUID ids to cloud-document', () => {
    expect(sourceModeForDoc('123e4567-e89b-12d3-a456-426614174000')).toBe('cloud-document');
    expect(sourceModeForDoc('123E4567-E89B-12D3-A456-426614174000')).toBe('cloud-document');
  });

  it('defaults empty or non-UUID ids to local', () => {
    expect(sourceModeForDoc('')).toBe('local');
    expect(sourceModeForDoc(null)).toBe('local');
    expect(sourceModeForDoc(undefined)).toBe('local');
    expect(sourceModeForDoc('not-a-uuid')).toBe('local');
  });

  it('exposes all four contract source modes with labels and tooltips', () => {
    expect([...SOURCE_MODES]).toEqual(['local', 'cloud-document', 'git-managed', 'connected-source']);
    expect(sourceModeLabel('local')).toBe('Local');
    expect(sourceModeLabel('cloud-document')).toBe('Cloud document');
    for (const mode of SOURCE_MODES) {
      expect(sourceModeTooltip(mode)).toContain('Source of truth');
    }
  });
});

describe('isServerDocId', () => {
  it('accepts UUIDs and rejects local ids', () => {
    expect(isServerDocId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isServerDocId('doc-1')).toBe(false);
    expect(isServerDocId('')).toBe(false);
    expect(isServerDocId(null)).toBe(false);
  });
});

describe('connectorDisplayStatus', () => {
  it('never reports Connected from form validation alone', () => {
    expect(connectorDisplayStatus('verified')).toBe(NOT_CONNECTED);
    expect(connectorDisplayStatus('polling')).toBe(NOT_CONNECTED);
    expect(connectorDisplayStatus('drift')).toBe(NOT_CONNECTED);
    expect(connectorDisplayStatus('connected')).toBe(NOT_CONNECTED);
    expect(connectorDisplayStatus(null)).toBe(NOT_CONNECTED);
    expect(connectorDisplayStatus(undefined)).toBe(NOT_CONNECTED);
  });

  it('reports Connected only after real provider verification', () => {
    expect(connectorDisplayStatus('verified', true)).toBe(CONNECTED);
    expect(connectorDisplayStatus('connected', true)).toBe(CONNECTED);
    expect(connectorDisplayStatus('polling', true)).toBe(NOT_CONNECTED);
  });
});

describe('badge label mapping', () => {
  it('maps statuses to literal labels', () => {
    expect(badgeLabelForStatus('demo')).toBe(DEMO);
    expect(badgeLabelForStatus('connected')).toBe(CONNECTED);
    expect(badgeLabelForStatus('local-only')).toBe('Local only');
  });

  it('maps surfaces to the required literal badges', () => {
    expect(surfaceBadge('resync')).toBe(NOT_CONNECTED);
    expect(surfaceBadge('connector')).toBe(NOT_CONNECTED);
    expect(surfaceBadge('merge')).toBe(SIMULATED);
    expect(surfaceBadge('review-decision')).toBe(SIMULATED);
    expect(surfaceBadge('sandbox')).toBe(SIMULATED);
  });
});

describe('HonestyBadge', () => {
  it('renders text plus a non-color shape cue with an aria-label', () => {
    const { getByRole } = render(React.createElement(HonestyBadge, { label: DEMO, title: 'Why' }));
    const badge = getByRole('status');
    expect(badge.textContent).toContain(DEMO);
    // Shape cue: glyph prefix beyond the bare label text.
    expect((badge.textContent ?? '').length).toBeGreaterThan(DEMO.length);
    expect(badge.getAttribute('aria-label')).toContain(DEMO);
    expect(badge.getAttribute('title')).toContain('Why');
  });
});
