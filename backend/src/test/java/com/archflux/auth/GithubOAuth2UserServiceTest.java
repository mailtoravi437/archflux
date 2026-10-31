package com.archflux.auth;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** H2: GitHub private-email users are resolved through the verified-emails endpoint. */
class GithubOAuth2UserServiceTest {

  private static final OAuth2UserRequest REQUEST = new OAuth2UserRequest(
      ClientRegistration.withRegistrationId("github")
          .clientId("id").clientSecret("s")
          .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
          .redirectUri("http://localhost/cb")
          .authorizationUri("http://localhost/a").tokenUri("http://localhost/t")
          .userInfoUri("http://localhost/u").userNameAttributeName("id").build(),
      new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "tok",
          Instant.now(), Instant.now().plusSeconds(60)));

  private static OAuth2User profile(Map<String, Object> attrs) {
    return new DefaultOAuth2User(Collections.emptyList(), attrs, "id");
  }

  private static GithubOAuth2UserService service(Map<String, Object> attrs, List<Map<String, Object>> emails) {
    return new GithubOAuth2UserService(r -> profile(attrs), token -> emails);
  }

  @Test
  void privateEmailResolvesToVerifiedPrimary() {
    var user = service(Map.of("id", 7, "login", "octo"), List.of(
        Map.of("email", "other@x.co", "primary", false, "verified", true),
        Map.of("email", "me@x.co", "primary", true, "verified", true))).loadUser(REQUEST);
    assertEquals("me@x.co", user.getAttributes().get("email"));
    assertEquals(true, user.getAttributes().get("email_verified"));
    assertEquals("7", user.getName());
  }

  @Test
  void publicProfileEmailIsNotTrustedOverTheVerifiedList() {
    var user = service(Map.of("id", 7, "email", "victim@x.co"), List.of(
        Map.of("email", "me@x.co", "primary", true, "verified", true))).loadUser(REQUEST);
    assertEquals("me@x.co", user.getAttributes().get("email"));
  }

  @Test
  void unverifiedPrimaryIsFlaggedNotVerified() {
    var user = service(Map.of("id", 7), List.of(
        Map.of("email", "me@x.co", "primary", true, "verified", false))).loadUser(REQUEST);
    assertEquals(false, user.getAttributes().get("email_verified"));
    assertEquals("email_not_verified", OAuthEmail.resolve(user).error());
  }

  @Test
  void noEmailsAtAllIsNoEmail() {
    var user = service(Map.of("id", 7, "email", "victim@x.co"), List.of()).loadUser(REQUEST);
    assertNull(user.getAttributes().get("email"));
    assertEquals("no_email", OAuthEmail.resolve(user).error());
  }

  @Test
  void lookupFailureNeverFallsBackToTheProfileEmail() {
    var svc = new GithubOAuth2UserService(r -> profile(Map.of("id", 7, "email", "victim@x.co")),
        token -> { throw new IllegalStateException("403"); });
    var user = svc.loadUser(REQUEST);
    assertNull(user.getAttributes().get("email"));
    assertEquals("no_email", OAuthEmail.resolve(user).error());
  }
}
