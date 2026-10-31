import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import LoginScreen from '../screens/LoginScreen';
import { api } from '../lib/api';
import { getConfig, setConfigForTests } from '../lib/config';

// R1-SEC-02: phone sign-in through Firebase. The Firebase SDK is replaced by a flow double:
// no network, no Google.
const flow = vi.hoisted(() => ({
  sendCode: vi.fn(),
  confirm: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../lib/firebasePhone', async (orig) => {
  const real = await orig<typeof import('../lib/firebasePhone')>();
  return { ...real, createPhoneAuth: () => flow };
});

const FIREBASE = {
  apiKey: 'test-key',
  authDomain: 'demo.firebaseapp.com',
  projectId: 'demo',
  appId: '1:1:web:1',
};
const original = getConfig();

beforeEach(() => {
  localStorage.clear();
  flow.sendCode.mockReset();
  flow.confirm.mockReset();
  setConfigForTests({ ...original, firebase: FIREBASE });
});
afterEach(() => {
  vi.restoreAllMocks();
  setConfigForTests(original);
});

function renderLogin() {
  vi.spyOn(api, 'getAuthProviders').mockResolvedValue({ data: { providers: [{ id: 'phone' }] } });
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <DiagramProvider>
        <LoginScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

async function openPhoneTab() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Phone' }));
}

describe('login phone tab', () => {
  it('shows the Phone tab only when the server lists phone and the web config has firebase', async () => {
    setConfigForTests({ ...original });
    renderLogin();
    await waitFor(() => expect(api.getAuthProviders).toHaveBeenCalled());
    expect(screen.queryByRole('tab', { name: 'Phone' })).toBeNull();
  });

  it('shows the phone field, then the code step after the code is sent', async () => {
    flow.sendCode.mockResolvedValue(undefined);
    renderLogin();
    await openPhoneTab();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));
    expect(await screen.findByLabelText('Verification code')).toBeTruthy();
    expect(flow.sendCode).toHaveBeenCalledWith('+919876543210');
    expect(screen.queryByLabelText('Phone number')).toBeNull();
  });

  it('exchanges the code for a session through the API', async () => {
    flow.sendCode.mockResolvedValue(undefined);
    flow.confirm.mockResolvedValue('id-token');
    const exchange = vi.spyOn(api, 'signInWithFirebase').mockResolvedValue({ data: { user: { id: 'u1' } } });
    renderLogin();
    await openPhoneTab();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));
    fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => expect(exchange).toHaveBeenCalledWith('id-token'));
    expect(flow.confirm).toHaveBeenCalledWith('123456');
  });

  it('rejects a malformed number without calling Firebase', async () => {
    renderLogin();
    await openPhoneTab();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '98765' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/international format/i);
    expect(flow.sendCode).not.toHaveBeenCalled();
  });

  it('shows a Firebase failure honestly and stays on the phone step', async () => {
    flow.sendCode.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/too-many-requests' }));
    renderLogin();
    await openPhoneTab();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/too many attempts/i);
    expect(screen.queryByLabelText('Verification code')).toBeNull();
  });

  it('shows the API rejection of a token honestly', async () => {
    flow.sendCode.mockResolvedValue(undefined);
    flow.confirm.mockResolvedValue('id-token');
    vi.spyOn(api, 'signInWithFirebase').mockRejectedValue(new Error('Phone sign-in could not be verified'));
    renderLogin();
    await openPhoneTab();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));
    fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be verified/i);
  });
});
