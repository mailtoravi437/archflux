package com.archflux.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.UUID;
import com.archflux.domain.User;
import org.junit.jupiter.api.Test;

/** Pure unit tests: issuer/audience/expiry enforcement and rotation fallback. */
class JwtServiceTest {

  private static final String SECRET_A = "0123456789abcdef-SECRET-A-0123456789abcdef";
  private static final String SECRET_B = "0123456789abcdef-SECRET-B-0123456789abcdef";
  private static final String ISSUER = "archflux";
  private static final String AUDIENCE = "archflux-api";

  private JwtService service(String secret, String prevSecret) {
    return new JwtService(secret, prevSecret, ISSUER, AUDIENCE, 60, 30);
  }

  private User user() {
    User user = new User(UUID.randomUUID(), "jwt-" + UUID.randomUUID() + "@archflux.local",
        "Jwt User", "member");
    user.setProvider("email");
    return user;
  }

  @Test
  void roundTripPreservesIdentityAndRole() {
    JwtService svc = service(SECRET_A, "");
    User user = user();
    String token = svc.generateToken(user, "session-1");

    assertTrue(svc.isTokenValid(token));
    assertEquals(user.getId(), svc.getUserId(token));
    assertEquals("member", svc.getRole(token));
    assertEquals("session-1", svc.getSessionIdFromToken(token));
  }

  @Test
  void previousSecretFallbackValidatesPreRotationTokens() {
    JwtService before = service(SECRET_B, "");
    String oldToken = before.generateToken(user(), "session-old");

    JwtService after = service(SECRET_A, SECRET_B);
    assertTrue(after.isTokenValid(oldToken));
    assertEquals("session-old", after.getSessionIdFromToken(oldToken));

    // Current-secret tokens keep validating too.
    assertTrue(after.isTokenValid(after.generateToken(user(), "session-new")));
  }

  @Test
  void withoutPreviousSecretOldTokensAreRejected() {
    String oldToken = service(SECRET_B, "").generateToken(user(), "session-old");
    assertThrows(Exception.class, () -> service(SECRET_A, "").validateToken(oldToken));
  }

  @Test
  void wrongIssuerIsRejected() {
    JwtService foreign = new JwtService(SECRET_A, "", "someone-else", AUDIENCE, 60, 30);
    String token = foreign.generateToken(user(), "s");
    assertThrows(Exception.class, () -> service(SECRET_A, "").validateToken(token));
  }

  @Test
  void wrongAudienceIsRejected() {
    JwtService foreign = new JwtService(SECRET_A, "", ISSUER, "other-api", 60, 30);
    String token = foreign.generateToken(user(), "s");
    assertThrows(Exception.class, () -> service(SECRET_A, "").validateToken(token));
  }

  @Test
  void expiredTokenIsRejected() {
    JwtService shortLived = new JwtService(SECRET_A, "", ISSUER, AUDIENCE, -5, 30);
    String token = shortLived.generateToken(user(), "s");
    assertThrows(Exception.class, () -> service(SECRET_A, "").validateToken(token));
  }

  @Test
  void tamperedTokenIsRejected() {
    JwtService svc = service(SECRET_A, "");
    String token = svc.generateToken(user(), "s");
    char last = token.charAt(token.length() - 1);
    String tampered = token.substring(0, token.length() - 1) + (last == 'a' ? 'b' : 'a');
    assertThrows(Exception.class, () -> svc.validateToken(tampered));
  }
}
