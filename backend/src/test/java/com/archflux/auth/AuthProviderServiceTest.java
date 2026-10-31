package com.archflux.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** H4: only providers with real (non-placeholder) credentials are offered. */
class AuthProviderServiceTest {

  private static final String P = "spring.security.oauth2.client.registration.";
  private static final String PLACEHOLDER_SECRET =
      "d5150374db41aa7b1bf23957bb3294c56d9bb94e7ef3e4358b4021ba96658c56";

  private static MockEnvironment placeholders() {
    return new MockEnvironment()
        .withProperty(P + "github.client-id", "Iv23lixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        .withProperty(P + "github.client-secret", PLACEHOLDER_SECRET)
        .withProperty(P + "google.client-id", "123456789012-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com")
        .withProperty(P + "google.client-secret", PLACEHOLDER_SECRET)
        .withProperty(P + "oidc.client-id", "archflux-oidc-prod")
        .withProperty(P + "oidc.client-secret", PLACEHOLDER_SECRET)
        .withProperty("spring.security.oauth2.client.provider.oidc.authorization-uri",
            "https://auth.example.com/realms/archflux/protocol/openid-connect/auth");
  }

  @Test
  void placeholderCredentialsOfferNothing() {
    assertTrue(new AuthProviderService(placeholders()).configured().isEmpty());
  }

  @Test
  void nothingSetOffersNothing() {
    assertTrue(new AuthProviderService(new MockEnvironment()).configured().isEmpty());
  }

  @Test
  void realGoogleCredentialsOfferOnlyGoogle() {
    var env = placeholders()
        .withProperty(P + "google.client-id", "1234-real.apps.googleusercontent.com")
        .withProperty(P + "google.client-secret", "GOCSPX-real-secret");
    assertEquals(List.of("google"), new AuthProviderService(env).configured());
  }

  @Test
  void githubNeedsBothIdAndSecret() {
    var env = placeholders().withProperty(P + "github.client-id", "Iv23liRealId1234");
    assertTrue(new AuthProviderService(env).configured().isEmpty());
    env.withProperty(P + "github.client-secret", "real-secret");
    assertEquals(List.of("github"), new AuthProviderService(env).configured());
  }

  @Test
  void oidcNeedsARealIssuerToo() {
    var env = placeholders()
        .withProperty(P + "oidc.client-id", "web").withProperty(P + "oidc.client-secret", "s3cret");
    assertTrue(new AuthProviderService(env).configured().isEmpty());
    env.withProperty("spring.security.oauth2.client.provider.oidc.authorization-uri",
        "https://login.corp.in/realms/x/protocol/openid-connect/auth");
    assertEquals(List.of("oidc"), new AuthProviderService(env).configured());
  }

  @Test
  void samlOnlyWhenEnabledAndAnIdpIsConfigured() {
    var env = new MockEnvironment().withProperty("app.saml.enabled", "true");
    assertTrue(new AuthProviderService(env).configured().isEmpty());
    env.withProperty("spring.security.oauth2.client.provider.x", "y");
    env.withProperty(AuthProviderService.SAML_SSO_URL_KEY, "https://auth.example.com/sso/saml");
    assertTrue(new AuthProviderService(env).configured().isEmpty());
    env.withProperty(AuthProviderService.SAML_SSO_URL_KEY, "https://idp.corp.in/sso");
    assertEquals(List.of("saml"), new AuthProviderService(env).configured());
    env.withProperty("app.saml.enabled", "false");
    assertTrue(new AuthProviderService(env).configured().isEmpty());
  }

  @Test
  void phoneIsOfferedOnlyWhenTheFirebaseProjectIdIsSet() {
    assertTrue(new AuthProviderService(new MockEnvironment()).configured().isEmpty());
    assertTrue(new AuthProviderService(new MockEnvironment().withProperty("app.firebase.project-id", " ")).configured().isEmpty());
    assertEquals(List.of("phone"), new AuthProviderService(
        new MockEnvironment().withProperty("app.firebase.project-id", "archflux-89085")).configured());
  }
}
