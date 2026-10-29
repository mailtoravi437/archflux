import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShapeLibrary } from '../design-system/components/ShapeLibrary';
import { parseIconManifest } from '../lib/icons';
import { ThemeProvider } from '../design-system/components/ThemeProvider';
import type { ArchNode } from '../types';

// R1-E05-T04: the Shapes panel runs against the real generated icon manifest.
const entries = parseIconManifest(JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'icons', 'manifest.json'), 'utf8')));

function setup(extra: Partial<React.ComponentProps<typeof ShapeLibrary>> = {}) {
  const onInsert = vi.fn<(n: ArchNode) => void>();
  render(
    <ThemeProvider>
      <ShapeLibrary entries={entries} viewportCenter={{ x: 500, y: 300 }} pageId="pg-1" onInsert={onInsert} {...extra} />
    </ThemeProvider>,
  );
  return { onInsert };
}

describe('Shapes panel', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('search "queue" shows Queue element and Amazon SQS', () => {
    setup();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search shapes' }), { target: { value: 'queue' } });
    expect(screen.getByRole('button', { name: 'Queue element' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Amazon SQS' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Person element' })).toBeNull();
  });

  it('Enter inserts element at viewport centre with iconRef', () => {
    const { onInsert } = setup({ docDefaults: { displayStyle: 'icon', size: 'S' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search shapes' }), { target: { value: 'sqs' } });
    const tile = screen.getByRole('button', { name: 'Amazon SQS' });
    tile.focus();
    fireEvent.keyDown(tile, { key: 'Enter' });
    expect(onInsert).toHaveBeenCalledTimes(1);
    const node = onInsert.mock.calls[0][0];
    expect(node.kind).toBe('queue');
    expect(node.iconRef).toEqual({ set: 'aws', id: 'aws/amazon-simple-queue-service' });
    expect(node.technology).toBe('Amazon SQS');
    expect(node.displayStyle).toBe('icon');
    expect(node.pageId).toBe('pg-1');
    // S = 64x64, centred on (500, 300).
    expect([node.x + node.w / 2, node.y + node.h / 2]).toEqual([500, 300]);
    expect(JSON.parse(window.localStorage.getItem('archflux:recent-shapes:v1') ?? '[]')[0]).toBe('ic:aws/amazon-simple-queue-service');
  });

  it('boundary tiles create boundary nodes', () => {
    const { onInsert } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'VPC boundary' }));
    const node = onInsert.mock.calls[0][0];
    expect(node.kind).toBe('boundary');
    expect(node.boundaryKind).toBe('vpc');
    expect(node.iconRef).toBeUndefined();
  });

  it('arrow keys move through tiles and element tiles insert their kind', () => {
    const { onInsert } = setup();
    const first = screen.getByRole('button', { name: 'Person element' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Client app element' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });
    expect(onInsert.mock.calls[0][0].kind).toBe('client');
  });

  it('shows an honest empty state when nothing matches', () => {
    setup();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search shapes' }), { target: { value: 'zzzz-nothing' } });
    expect(screen.getByText(/No shapes match/)).toBeTruthy();
  });
});
