package com.archflux.auth;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** H1: a provider email is trusted only when the provider asserts it is verified. */
class OAuthEmailTest {

  private static DefaultOidcUser oidc(Map<String, Object> extra) {
    Map<String, Object> claims = new HashMap<>(Map.of("sub", "s-1"));
    claims.putAll(extra);
    OidcIdToken token = new OidcIdToken("t", Instant.now(), Instant.now().plusSeconds(60), claims);
    return new DefaultOidcUser(Collections.emptyList(), token);
  }

  private static DefaultOAuth2User oauth(Map<String, Object> attrs) {
    return new DefaultOAuth2User(Collections.emptyList(), attrs, "id");
  }

  @Test
  void oidcVerifiedEmailIsAccepted() {
    var r = OAuthEmail.resolve(oidc(Map.of("email", "a@b.co", "email_verified", true)));
    assertEquals("a@b.co", r.email());
    assertNull(r.error());
  }

  @Test
  void oidcUnverifiedEmailIsRejected() {
    var r = OAuthEmail.resolve(oidc(Map.of("email", "victim@b.co", "email_verified", false)));
    assertNull(r.email());
    assertEquals("email_not_verified", r.error());
  }

  @Test
  void oidcMissingVerifiedClaimIsRejected() {
    var r = OAuthEmail.resolve(oidc(Map.of("email", "victim@b.co")));
    assertEquals("email_not_verified", r.error());
  }

  @Test
  void oidcWithoutEmailIsNoEmail() {
    assertEquals("no_email", OAuthEmail.resolve(oidc(Map.of())).error());
  }

  @Test
  void oauth2EmailNeedsExplicitVerifiedFlag() {
    assertEquals("email_not_verified",
        OAuthEmail.resolve(oauth(Map.of("id", 1, "email", "x@y.co"))).error());
    assertEquals("email_not_verified",
        OAuthEmail.resolve(oauth(Map.of("id", 1, "email", "x@y.co", "email_verified", false))).error());
    var ok = OAuthEmail.resolve(oauth(Map.of("id", 1, "email", "x@y.co", "email_verified", true)));
    assertEquals("x@y.co", ok.email());
  }

  @Test
  void aLoginNameThatLooksLikeAnEmailIsNeverUsed() {
    var r = OAuthEmail.resolve(oauth(Map.of("id", 1, "login", "victim@b.co")));
    assertEquals("no_email", r.error());
  }
}
