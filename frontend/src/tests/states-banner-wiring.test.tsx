// R1-E12-T02: banner selection from real store signals (offline, save failure, newer version, role downgrade).
// session_expired and rate_limited have no client signal yet and are not raised (documented in the epic).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

type Ctx = { isOnline: boolean; syncError: string | null; saveConflict: object | null; role: string | null; activeDocId: string; saveActiveDoc: () => void; exportArch: () => void };
const ctx: Ctx = { isOnline: true, syncError: null, saveConflict: null, role: 'editor', activeDocId: 'd1', saveActiveDoc: vi.fn(), exportArch: vi.fn() };
vi.mock('../state/useDiagram', () => ({ useDiagram: () => ctx }));

import { api, resetAuthFailure, setUnauthorizedHandler } from '../lib/api';
import { parseRetryAfter, resetApiSignals } from '../lib/apiSignals';
import { setSession } from '../state/session';
import { act } from '@testing-library/react';
import AppStatusBanner from '../components/states/AppStatusBanner';
import { selectBanner } from '../components/states/selectBanner';

const set = (p: Partial<Ctx>) => Object.assign(ctx, { isOnline: true, syncError: null, saveConflict: null, role: 'editor' }, p);
afterEach(() => { cleanup(); resetApiSignals(); resetAuthFailure(); setUnauthorizedHandler(null); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('banner wiring (R1-E12-T02)', () => {
  it('offline shows offline banner and retry saves', () => {
    set({ isOnline: false });
    render(<AppStatusBanner onReviewConflict={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('Offline — editing locally');
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(ctx.saveActiveDoc).toHaveBeenCalled();
  });

  it('save failure shows alert with the real error, not the offline banner', () => {
    set({ syncError: 'Server returned 500' });
    render(<AppStatusBanner onReviewConflict={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain("Couldn't save to cloud");
    expect(screen.getByText('Server returned 500')).toBeTruthy();
  });

  it('newer version banner reopens the conflict dialog', () => {
    set({ saveConflict: {} });
    const open = vi.fn();
    render(<AppStatusBanner onReviewConflict={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review & merge' }));
    expect(open).toHaveBeenCalled();
  });

  it('banner priority picks access_changed over offline', () => {
    set({ isOnline: false, role: 'editor' });
    const { rerender } = render(<AppStatusBanner onReviewConflict={() => {}} />);
    expect(screen.queryByText('Your access changed')).toBeNull();
    ctx.role = 'viewer';
    rerender(<AppStatusBanner onReviewConflict={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('Your access changed');
    expect(screen.queryByText('Offline — editing locally')).toBeNull();
    expect(selectBanner({ offline: true, access_changed: true, rate_limited: true })).toBe('access_changed');
    expect(selectBanner({ rate_limited: true, offline: true })).toBe('offline');
  });

  it('no banner when everything is healthy, and a viewer from the start is not a downgrade', () => {
    set({ role: 'viewer' });
    const { container } = render(<AppStatusBanner onReviewConflict={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('429 shows rate_limited with countdown', async () => {
    set({});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '30' }), json: async () => ({}) } as unknown as Response);
    render(<AppStatusBanner onReviewConflict={() => {}} />);
    expect(screen.queryByText('Slow down — too many requests')).toBeNull();
    vi.useFakeTimers();
    await act(async () => { await api.listDiagrams().catch(() => undefined); });
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(screen.getByRole('status').textContent).toContain('Slow down — too many requests');
    expect(screen.getByText('You hit the request limit. Try again in 30 s.')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText('You hit the request limit. Try again in 20 s.')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(21_000); });
    expect(screen.queryByText('Slow down — too many requests')).toBeNull();
  });

  it('Retry-After parses seconds and dates, defaults to 30 s', () => {
    expect(parseRetryAfter('12')).toBe(12);
    expect(parseRetryAfter(null)).toBe(30);
    expect(parseRetryAfter('garbage')).toBe(30);
    expect(parseRetryAfter(new Date(1_000_000 + 45_000).toUTCString(), Math.floor(1_000_000 / 1000) * 1000)).toBeGreaterThan(0);
  });

  it('401 on a real session shows session_expired before the redirect, and Sign in dismisses it', async () => {
    set({});
    setSession({ mode: 'github', email: 'a@x.com' });
    const seen: string[] = [];
    setUnauthorizedHandler(() => { seen.push(document.body.textContent ?? ''); });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401, headers: new Headers(), json: async () => ({}) } as unknown as Response);
    render(<AppStatusBanner onReviewConflict={() => {}} />);
    await act(async () => { await api.listDiagrams().catch(() => undefined); });
    expect(screen.getByRole('status').textContent).toContain('Session expired');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.queryByText('Session expired')).toBeNull();
    expect(window.location.hash).toBe('#/login');
  });

  it('401 for a guest or a probe raises no banner', async () => {
    set({});
    setSession({ mode: 'guest' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401, headers: new Headers(), json: async () => ({}) } as unknown as Response);
    setUnauthorizedHandler(() => {});
    const { container } = render(<AppStatusBanner onReviewConflict={() => {}} />);
    await act(async () => { await api.listDiagrams().catch(() => undefined); });
    expect(container.textContent).toBe('');
  });
});
