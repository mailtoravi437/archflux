package com.archflux.auth;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Which sign-in providers have real credentials (H4, 2026-10-31). application.yml ships
 * non-functional placeholders so the server boots without SSO material; those must never be
 * offered to users because the provider would reject the login.
 */
@Service
public class AuthProviderService {

  static final String P = "spring.security.oauth2.client.registration.";
  static final String SAML_SSO_URL_KEY =
      "spring.security.saml2.relyingparty.registration.archflux.assertingparty.singlesignon.url";
  private static final String PLACEHOLDER_SECRET =
      "d5150374db41aa7b1bf23957bb3294c56d9bb94e7ef3e4358b4021ba96658c56";

  private final Environment env;

  public AuthProviderService(Environment env) {
    this.env = env;
  }

  /** Provider ids (github, google, oidc, saml, phone) that can actually sign a user in. */
  public List<String> configured() {
    List<String> out = new ArrayList<>();
    if (realClient("github")) out.add("github");
    if (realClient("google")) out.add("google");
    if (realClient("oidc") && !placeholderHost(
        env.getProperty("spring.security.oauth2.client.provider.oidc.authorization-uri"))) {
      out.add("oidc");
    }
    if (env.getProperty("app.saml.enabled", Boolean.class, false)
        && !isBlank(env.getProperty(SAML_SSO_URL_KEY))
        && !placeholderHost(env.getProperty(SAML_SSO_URL_KEY))) {
      out.add("saml");
    }
    if (!isBlank(env.getProperty("app.firebase.project-id"))) {
      out.add("phone");
    }
    return out;
  }

  private boolean realClient(String id) {
    String clientId = env.getProperty(P + id + ".client-id");
    String secret = env.getProperty(P + id + ".client-secret");
    if (isBlank(clientId) || isBlank(secret)) return false;
    return !clientId.contains("xxxxxxxx")
        && !"archflux-oidc-prod".equals(clientId)
        && !PLACEHOLDER_SECRET.equals(secret);
  }

  private static boolean placeholderHost(String url) {
    return isBlank(url) || url.contains("auth.example.com");
  }

  private static boolean isBlank(String s) {
    return s == null || s.isBlank();
  }
}
