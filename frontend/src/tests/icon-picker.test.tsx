import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IconPicker } from '../components/IconPicker';
import { RECENT_ICONS_KEY } from '../lib/recentIcons';
import { NodeIconPicker } from '../components/NodeIconPicker';
import { DiagramProvider } from '../state/store';
import { parseIconManifest } from '../lib/icons';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';

const iconEntries = parseIconManifest(JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'icons', 'manifest.json'), 'utf8')));

// R1-E05-T03: the picker is exercised against the real generated manifest.

function setup(extra: Partial<React.ComponentProps<typeof IconPicker>> = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const utils = render(<IconPicker kind="queue" entries={iconEntries} onPick={onPick} onClose={onClose} {...extra} />);
  return { onPick, onClose, ...utils };
}

describe('IconPicker', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('search filters by name', () => {
    setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search icons' }), { target: { value: 'queue' } });
    const names = screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'));
    expect(names).toContain('Amazon SQS');
    expect(names).not.toContain('Amazon RDS');
  });

  it('every option has an accessible name and no duplicates', () => {
    setup();
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(8);
    const names = options.map((o) => o.getAttribute('aria-label') ?? '');
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    expect(screen.getByRole('group', { name: 'Suggested for queue' })).toBeTruthy();
  });

  it('Enter on option sets iconRef and closes', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ version: 1, sets: {}, icons: iconEntries }) })));
    const store: { v: ReturnType<typeof useDiagram> | null } = { v: null };
    function Harness() {
      const d = useDiagram();
      useEffect(() => { store.v = d; });
      const [open, setOpen] = useState(true);
      const node = d.nodes[0];
      return (
        <>
          <p data-testid="icon">{JSON.stringify(node?.iconRef ?? 'unset')}</p>
          {open && node ? <NodeIconPicker node={node} onClose={() => setOpen(false)} /> : <p>closed</p>}
        </>
      );
    }
    render(<DiagramProvider><Harness /></DiagramProvider>);
    act(() => seedSampleDiagram(store.v!));
    return screen.findByRole('option', { name: 'Amazon SQS' }).then((opt) => {
      act(() => { fireEvent.keyDown(opt, { key: 'Enter' }); });
      expect(screen.getByTestId('icon').textContent).toBe(JSON.stringify({ set: 'aws', id: 'aws/amazon-simple-queue-service' }));
      expect(screen.getByText('closed')).toBeTruthy();
      vi.unstubAllGlobals();
    });
  });

  it('Enter on option reports the icon ref and records it as recent', () => {
    const { onPick } = setup();
    const opt = screen.getByRole('option', { name: 'Amazon SQS' });
    fireEvent.keyDown(opt, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith({ set: 'aws', id: 'aws/amazon-simple-queue-service' });
    expect(JSON.parse(window.localStorage.getItem(RECENT_ICONS_KEY) ?? '[]')[0]).toEqual({ set: 'aws', id: 'aws/amazon-simple-queue-service' });
  });

  it('arrow keys move through the grid', () => {
    setup();
    const options = screen.getAllByRole('option');
    options[0].focus();
    fireEvent.keyDown(options[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(options[1], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[5]);
  });

  it('No icon sets null', () => {
    const { onPick } = setup({ current: { set: 'aws', id: 'aws/amazon-rds' } });
    fireEvent.click(screen.getByRole('button', { name: 'No icon' }));
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('Uploaded tab shows an honest empty state', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Uploaded' }));
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/Icon uploads arrive with workspace libraries \(R2\)/)).toBeTruthy();
  });

  it('Esc closes and returns focus', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { onClose, unmount } = setup();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search icons' }));
    fireEvent.keyDown(within(screen.getByRole('dialog')).getByRole('textbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
