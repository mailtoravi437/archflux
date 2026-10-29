import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { BANNER_COPY, EmptyState, NotFoundState, Skeleton, StatusBanner, type BannerKind } from '../components/states';

afterEach(() => vi.useRealTimers());

describe('system states (R1-E12-T01)', () => {
  it('skeleton hidden before 300ms, visible after', () => {
    vi.useFakeTimers();
    render(<Skeleton label="Loading library" />);
    expect(screen.queryByLabelText('Loading library')).toBeNull();
    act(() => { vi.advanceTimersByTime(299); });
    expect(screen.queryByLabelText('Loading library')).toBeNull();
    act(() => { vi.advanceTimersByTime(2); });
    const el = screen.getByLabelText('Loading library');
    expect(el.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText(/server is slow/)).toBeNull();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByText(/Still loading — the server is slow/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep waiting' })).toBeTruthy();
  });

  it('banner roles: alert for save_failed, status for offline', () => {
    const { unmount } = render(<StatusBanner kind="save_failed" onPrimary={() => {}} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    unmount();
    render(<StatusBanner kind="offline" onPrimary={() => {}} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('copy matches BANNER_COPY', () => {
    expect(BANNER_COPY.offline).toEqual({
      title: 'Offline — editing locally',
      body: 'Changes are saved on this device and upload when you reconnect.',
      safe: 'N unsynced edits stored locally; closing the tab keeps them.',
      primary: 'Retry now',
      secondary: 'Download copy',
    });
    for (const kind of Object.keys(BANNER_COPY) as BannerKind[]) {
      const { unmount } = render(<StatusBanner kind={kind} onPrimary={() => {}} onSecondary={() => {}} />);
      expect(screen.getByText(BANNER_COPY[kind].title)).toBeTruthy();
      expect(screen.getByRole('button', { name: BANNER_COPY[kind].primary })).toBeTruthy();
      expect(screen.getByRole('button', { name: BANNER_COPY[kind].secondary! })).toBeTruthy();
      unmount();
    }
  });

  it('banner shows real detail instead of example data', () => {
    render(<StatusBanner kind="offline" detail="x" safeDetail="14 unsynced edits stored locally." onPrimary={() => {}} />);
    expect(screen.getByText(/14 unsynced edits/)).toBeTruthy();
  });

  it('NotFoundState never renders a diagram title prop', () => {
    // @ts-expect-error NotFoundState has no `title` prop: a diagram title can never leak (checked by type).
    render(<NotFoundState title="Secret roadmap" signedInAs="a@b.co" errorId="af-1" />);
    expect(screen.queryByText(/Secret roadmap/)).toBeNull();
    expect(screen.getByText(/Signed in as a@b\.co/)).toBeTruthy();
    expect(screen.getByText('Error ID af-1')).toBeTruthy();
  });

  it('EmptyState renders its action', () => {
    const fn = vi.fn();
    render(<EmptyState title="No proposals yet" body="b" action={{ label: 'Start a proposal', onClick: fn }} />);
    screen.getByRole('button', { name: 'Start a proposal' }).click();
    expect(fn).toHaveBeenCalled();
  });
});
