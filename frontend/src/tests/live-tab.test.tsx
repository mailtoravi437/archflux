import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

// Live.dc.html "R1 STATE": the dock tab shows presence only, with honest states.
const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../hooks/useCollaboration', () => ({ useCollaboration: () => hook.value }));

import { CollaborationPanel, PresencePill } from '../components/CollaborationPanel';

const SERVER_ID = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
const me = { id: '1', name: 'ravi', color: '#059669' };
const maya = { id: '2', name: 'maya', color: '#DB2777' };

function setHook(over: Record<string, unknown>) {
  hook.value = { connected: false, synced: false, users: [], awareness: { clientID: 1 }, ...over };
}
function signIn() {
  localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: 'ravi@acme.io' }));
}

beforeEach(() => { localStorage.clear(); setHook({}); });
afterEach(() => cleanup());

describe('Live tab (CollaborationPanel)', () => {
  it('lists people here with you marked, status Connected and the count', () => {
    signIn();
    setHook({ connected: true, synced: true, users: [me, maya] });
    render(<CollaborationPanel diagramId={SERVER_ID} embedded />);
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('2 here')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'People here' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('ravi')).toBeTruthy();
    expect(within(items[0]).getByText('You')).toBeTruthy();
    expect(within(items[1]).getByText('maya')).toBeTruthy();
    expect(within(items[1]).queryByText('You')).toBeNull();
  });

  it('drops the old Collaboration heading, Offline badge and emoji status lines', () => {
    signIn();
    setHook({ connected: true, synced: true, users: [me] });
    const { container } = render(<CollaborationPanel diagramId={SERVER_ID} embedded />);
    expect(screen.queryByText('Collaboration')).toBeNull();
    expect(screen.queryByText('Offline')).toBeNull();
    expect(container.textContent).not.toMatch(/Collaborators \(|Status:|Sync:|🟢|🔴|🟡/);
  });

  it('says so when you are the only one here', () => {
    signIn();
    setHook({ connected: true, synced: true, users: [me] });
    render(<CollaborationPanel diagramId={SERVER_ID} embedded />);
    expect(screen.getByText('1 here')).toBeTruthy();
    expect(screen.getByText('Just you here. Share this diagram to work with others live.')).toBeTruthy();
  });

  it('is honest for a local-only diagram', () => {
    signIn();
    render(<CollaborationPanel diagramId="doc-first" embedded />);
    expect(screen.getByText('Live is off for this diagram')).toBeTruthy();
    expect(screen.getByText(/saved on this device only/i)).toBeTruthy();
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.queryByRole('list', { name: 'People here' })).toBeNull();
  });

  it('asks a guest to sign in instead of showing a red Offline state', () => {
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    render(<CollaborationPanel diagramId={SERVER_ID} embedded />);
    expect(screen.getByText('Sign in to work live')).toBeTruthy();
    expect(screen.queryByText('Offline')).toBeNull();
  });

  it('shows Not connected and Reconnecting for a cloud diagram without a socket', () => {
    signIn();
    setHook({ connected: false, users: [] });
    render(<CollaborationPanel diagramId={SERVER_ID} embedded />);
    expect(screen.getByText('Not connected')).toBeTruthy();
    expect(screen.getByText('Reconnecting')).toBeTruthy();
    expect(screen.getByText('Your edits stay on this device until the connection returns.')).toBeTruthy();
  });

  it('keeps comments and notifications out of R1 with one muted line', () => {
    signIn();
    setHook({ connected: true, synced: true, users: [me] });
    render(<CollaborationPanel diagramId={SERVER_ID} embedded />);
    expect(screen.getByText('Comment threads and the notifications inbox arrive in R2.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /resolve|reply|mark all/i })).toBeNull();
  });

  it('renders nothing without a diagram', () => {
    const { container } = render(<CollaborationPanel diagramId={null} embedded />);
    expect(container.textContent).toBe('');
  });
});

describe('PresencePill', () => {
  it('shows avatars and the count only while connected with 2+ people', () => {
    render(<PresencePill connected users={[me, maya]} selfId="1" />);
    const pill = screen.getByRole('status', { name: '2 people here' });
    expect(within(pill).getByText('2 here')).toBeTruthy();
    expect(within(pill).getByTitle('ravi (you)')).toBeTruthy();
    expect(within(pill).getByTitle('maya')).toBeTruthy();
  });

  it('renders nothing when alone or disconnected', () => {
    const { container, rerender } = render(<PresencePill connected users={[me]} selfId="1" />);
    expect(container.textContent).toBe('');
    rerender(<PresencePill connected={false} users={[me, maya]} selfId="1" />);
    expect(container.textContent).toBe('');
  });

  it('pins the R2 line to the bottom: last child of a full-height flex column', () => {
    signIn();
    setHook({ connected: true, synced: true, users: [me, maya] });
    const { container } = render(<CollaborationPanel diagramId={SERVER_ID} embedded />);
    const line = screen.getByText('Comment threads and the notifications inbox arrive in R2.');
    const col = container.querySelector('.collaboration-panel') as HTMLElement;
    expect(line.parentElement).toBe(col);
    expect(col.lastElementChild).toBe(line);
    expect(col.style.display).toBe('flex');
    expect(col.style.flexDirection).toBe('column');
    expect(col.style.height).toBe('100%');
    expect(col.style.minHeight).toBe('0px');
    expect(line.style.marginTop).toBe('auto');
  });
});
