import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// R1-BUG-17: the API relays y-websocket rooms at `/ws/diagram-<uuid>` (SERVICES_SPEC 4.4). The
// provider appends the room to its server URL, so the pair must stay `<wsUrl>/ws` + `diagram-<id>`.
const calls: Array<{ url: string; room: string }> = [];
vi.mock('y-websocket', () => ({
  WebsocketProvider: class {
    awareness = { clientID: 1, setLocalState() {}, on() {}, off() {}, getStates: () => new Map(), setLocalStateField() {} };
    constructor(url: string, room: string) { calls.push({ url, room }); }
    on() {}
    off() {}
    disconnect() {}
    destroy() {}
  },
}));

import { useCollaboration } from '../hooks/useCollaboration';
import { setConfigForTests } from '../lib/config';

beforeEach(() => {
  calls.length = 0;
  setConfigForTests({ apiUrl: 'http://localhost:23001/api', wsUrl: 'ws://localhost:23001' });
  localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: 'a@b.co' }));
});
afterEach(() => localStorage.clear());

describe('realtime relay URL', () => {
  it('joins <wsUrl>/ws/diagram-<uuid>', () => {
    const id = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
    renderHook(() => useCollaboration(id));
    expect(calls).toHaveLength(1);
    expect(`${calls[0].url}/${calls[0].room}`).toBe(`ws://localhost:23001/ws/diagram-${id}`);
  });
});
