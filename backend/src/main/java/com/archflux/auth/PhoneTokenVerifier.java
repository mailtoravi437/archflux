package com.archflux.auth;

/**
 * Verifies a Firebase ID token for phone sign-in (R1-SEC-02). The production
 * implementation calls firebase-admin; tests replace this bean so Google is
 * never contacted.
 */
public interface PhoneTokenVerifier {

  /**
   * @return the verified phone number (E.164) from the token
   * @throws com.archflux.service.ApiException 401 {@code INVALID_FIREBASE_TOKEN} for an invalid,
   *     expired or non-phone token; 503 {@code PHONE_SIGNIN_UNAVAILABLE} when not configured
   */
  String verify(String idToken);
}
