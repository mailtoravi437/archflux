// BUG-LIVE-025: the Git token lives in memory for the session only.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import SettingsConnectorsScreen from '../screens/SettingsConnectorsScreen';
import { SETTINGS_KEY, loadSettings, saveSettings, getGitToken, setGitToken } from '../state/settings';
import { clearSession } from '../state/session';

const SECRET = 'ghp_supersecrettoken123';
const dump = () => JSON.stringify(Object.fromEntries(Object.entries(localStorage)));
const mount = () => render(<MemoryRouter><DiagramProvider><SettingsConnectorsScreen /></DiagramProvider></MemoryRouter>);

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setGitToken(''); });
afterEach(cleanup);

describe('git token is session only (BUG-LIVE-025)', () => {
  it('typing a token never writes it to localStorage or sessionStorage', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: SECRET } });
    expect(getGitToken()).toBe(SECRET);
    expect(dump()).not.toContain(SECRET);
    expect(JSON.stringify(Object.fromEntries(Object.entries(sessionStorage)))).not.toContain(SECRET);
    // other connector fields still persist
    fireEvent.change(screen.getByLabelText('Target repository'), { target: { value: 'a/b' } });
    expect(localStorage.getItem(SETTINGS_KEY)).toContain('a/b');
    expect(localStorage.getItem(SETTINGS_KEY)).not.toContain(SECRET);
  });

  it('shows the honest session-only copy and drops the plain-text claim', () => {
    mount();
    expect(screen.getByText('Kept for this session only; you will be asked again after you reload.')).toBeTruthy();
    expect(screen.queryByText(/stored in plain text/i)).toBeNull();
  });

  it('remounting in the same session keeps it; a reload (fresh memory) does not', () => {
    setGitToken(SECRET);
    expect(loadSettings().pat).toBe(SECRET);
    setGitToken(''); // simulates a reload: module memory is gone
    expect(loadSettings().pat).toBe('');
  });

  it('purges a legacy plain-text token already stored by an older build', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ pat: SECRET, targetRepo: 'x/y' }));
    const s = loadSettings();
    expect(s.pat).toBe('');
    expect(s.targetRepo).toBe('x/y');
    expect(dump()).not.toContain(SECRET);
  });

  it('saveSettings strips the token even when handed one', () => {
    saveSettings({ ...loadSettings(), pat: SECRET });
    expect(dump()).not.toContain(SECRET);
  });

  it('is cleared on sign-out / session clear', () => {
    setGitToken(SECRET);
    clearSession();
    expect(getGitToken()).toBe('');
  });
});
