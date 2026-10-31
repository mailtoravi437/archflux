import type { FirebaseWebConfig } from './config';

/**
 * Phone sign-in through Firebase Authentication (R1-SEC-02, SERVICES_SPEC §4.1a P1).
 * The Firebase SDK is loaded on demand so it stays out of the main bundle. It only proves the
 * phone number: the ID token is exchanged for ArchFlux's own cookie session, and the Firebase
 * session is discarded.
 */
export interface PhoneAuthFlow {
  /** Sends the SMS code. Resolves only after Firebase accepted the request. */
  sendCode(phoneE164: string): Promise<void>;
  /** Checks the code and returns a Firebase ID token for POST /v1/auth/firebase. */
  confirm(code: string): Promise<string>;
  /** Releases the reCAPTCHA widget. */
  dispose(): void;
}

export const E164_RE = /^\+[1-9][0-9]{6,14}$/;

/** Honest, human copy for the Firebase auth error codes a user can reach. */
export function phoneAuthErrorMessage(err: unknown): string {
  const code = typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code : '';
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'That phone number is not valid. Use the international format, for example +919876543210.';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'Too many attempts. Wait a while, then try again.';
    case 'auth/invalid-verification-code':
      return 'That code is not correct. Check the SMS and try again.';
    case 'auth/code-expired':
      return 'That code has expired. Go back and send a new one.';
    case 'auth/captcha-check-failed':
    case 'auth/missing-app-credential':
      return 'The human check failed. Reload the page and try again.';
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection and try again.';
    case 'auth/operation-not-allowed':
    case 'auth/unauthorized-domain':
      return 'Phone sign-in is not available on this site.';
    default:
      return err instanceof Error && err.message ? `Phone sign-in failed: ${err.message}` : 'Phone sign-in failed.';
  }
}

export function createPhoneAuth(cfg: FirebaseWebConfig, recaptchaContainer: HTMLElement): PhoneAuthFlow {
  let verifier: import('firebase/auth').RecaptchaVerifier | null = null;
  let confirmation: import('firebase/auth').ConfirmationResult | null = null;
  let auth: import('firebase/auth').Auth | null = null;

  async function load() {
    const [{ initializeApp, getApps, getApp }, authMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ]);
    const app = getApps().some((a) => a.name === 'archflux-phone')
      ? getApp('archflux-phone')
      : initializeApp(cfg, 'archflux-phone');
    auth = authMod.getAuth(app);
    return authMod;
  }

  return {
    async sendCode(phone) {
      const mod = await load();
      verifier?.clear();
      verifier = new mod.RecaptchaVerifier(auth!, recaptchaContainer, { size: 'invisible' });
      try {
        confirmation = await mod.signInWithPhoneNumber(auth!, phone, verifier);
      } catch (e) {
        verifier.clear();
        verifier = null;
        throw e;
      }
    },
    async confirm(code) {
      if (!confirmation) throw new Error('Send a code first.');
      const cred = await confirmation.confirm(code);
      const token = await cred.user.getIdToken();
      // ArchFlux's cookie is the only session; drop the Firebase one.
      await auth?.signOut().catch(() => undefined);
      return token;
    },
    dispose() {
      verifier?.clear();
      verifier = null;
      confirmation = null;
    },
  };
}
