import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LimitDialogHost } from '../components/LimitDialog';
import { api, ApiError, formatLimitValue, isLimitReachedError, LIMIT_REACHED_EVENT } from '../lib/api';

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}
const limitBody = { error: { code: 'LIMIT_REACHED', message: 'Plan limit reached', limit: 'cloudDiagrams', current: 3, max: 3 } };
const ws = (role: string) => ({ data: { id: 'w', name: 'W', plan: 'free', role, limits: {}, usage: {} } });

function mockFetch(role: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/workspaces/current')) return respond(200, ws(role));
    if (url.includes('/diagrams') ) return respond(402, limitBody);
    return respond(404, {});
  });
}

describe('limit dialog (R1-E11-T06)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('402 on create keeps doc local and opens dialog', async () => {
    mockFetch('admin');
    render(<LimitDialogHost />);
    let caught: unknown;
    await act(async () => {
      try { await api.createDiagram('x'); } catch (e) { caught = e; }
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect(isLimitReachedError(caught)).toBe(true);
    expect((caught as ApiError).limit).toEqual({ limit: 'cloudDiagrams', current: 3, max: 3 });
    const dlg = await screen.findByRole('dialog', { name: 'Limit reached' });
    expect(dlg.textContent).toContain('Save a 4th diagram to the cloud with Team');
    expect(dlg.textContent).toContain('3 of 3 cloud diagrams');
    await waitFor(() => expect(dlg.textContent).toContain('Free plan'));
    expect(screen.queryByRole('button', { name: 'Ask an admin' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keep on this device' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('non-admin sees Ask an admin', async () => {
    mockFetch('editor');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<LimitDialogHost />);
    act(() => {
      window.dispatchEvent(new CustomEvent(LIMIT_REACHED_EVENT, { detail: { limit: 'cloudDiagrams', current: 3, max: 3 } }));
    });
    const btn = await screen.findByRole('button', { name: 'Ask an admin' });
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect((await screen.findByRole('status')).textContent).toMatch(/nobody has been notified/i);
  });

  it('existing cloud docs still save while at limit', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(200, { data: { id: 'd', version: 4 } }));
    const seen = vi.fn();
    window.addEventListener(LIMIT_REACHED_EVENT, seen);
    const r = await api.updateDiagram('d', { title: 't' }, { version: 3 });
    window.removeEventListener(LIMIT_REACHED_EVENT, seen);
    expect(spy).toHaveBeenCalled();
    expect(r).toBeTruthy();
    expect(seen).not.toHaveBeenCalled();
  });

  it('shows unlimited as infinity', () => {
    expect(formatLimitValue(2147483647)).toBe('∞');
    expect(formatLimitValue(3)).toBe('3');
  });
});
