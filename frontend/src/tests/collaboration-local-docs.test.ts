import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Routes audit: a signed-in user opening a local-only diagram (id "doc-...") made the canvas open
// a realtime socket for a diagram the server has never seen. Every attempt ended in a 404
// handshake and console errors. Only server diagrams (UUID ids) can have a realtime session.
const created: string[] = [];
vi.mock('y-websocket', () => ({
  WebsocketProvider: class {
    awareness = { clientID: 1, setLocalState() {}, on() {}, off() {}, getStates: () => new Map(), setLocalStateField() {} };
    constructor(_url: string, room: string) { created.push(room); }
    on() {}
    off() {}
    disconnect() {}
    destroy() {}
  },
}));

import { useCollaboration } from '../hooks/useCollaboration';

beforeEach(() => {
  created.length = 0;
  localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: 'a@b.co' }));
});
afterEach(() => localStorage.clear());

describe('useCollaboration session gating', () => {
  it('opens no realtime session for a local-only diagram', () => {
    renderHook(() => useCollaboration('doc-first'));
    expect(created).toEqual([]);
  });

  it('opens one for a server diagram', () => {
    const id = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
    renderHook(() => useCollaboration(id));
    expect(created).toEqual([`diagram-${id}`]);
  });
});
