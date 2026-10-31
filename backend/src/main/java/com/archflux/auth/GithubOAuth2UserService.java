package com.archflux.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * GitHub's {@code /user} omits the email of users with a private email, and its public email is not
 * proof of ownership. This service always asks {@code /user/emails} (scope {@code user:email}) and
 * exposes the primary verified address as {@code email} with {@code email_verified=true}
 * (H1/H2, 2026-10-31). Without a verified primary it exposes the primary address with
 * {@code email_verified=false} (login fails with email_not_verified), or no email at all.
 * The profile email is never used as a fallback.
 */
@Component
public class GithubOAuth2UserService implements OAuth2UserService<OAuth2UserRequest, OAuth2User> {

  private static final Logger log = LoggerFactory.getLogger(GithubOAuth2UserService.class);

  /** Fetches {@code /user/emails} for an access token. */
  @FunctionalInterface
  interface EmailFetcher {
    List<Map<String, Object>> fetch(String accessToken);
  }

  private final OAuth2UserService<OAuth2UserRequest, OAuth2User> delegate;
  private final EmailFetcher emails;

  @org.springframework.beans.factory.annotation.Autowired
  public GithubOAuth2UserService(@Value("${app.github.api-url:https://api.github.com}") String apiUrl) {
    this(new DefaultOAuth2UserService(), httpFetcher(apiUrl));
  }

  GithubOAuth2UserService(OAuth2UserService<OAuth2UserRequest, OAuth2User> delegate, EmailFetcher emails) {
    this.delegate = delegate;
    this.emails = emails;
  }

  private static EmailFetcher httpFetcher(String apiUrl) {
    RestClient client = RestClient.builder().baseUrl(apiUrl).build();
    return token -> client.get().uri("/user/emails")
        .header("Authorization", "Bearer " + token)
        .header("Accept", "application/vnd.github+json")
        .retrieve()
        .body(new org.springframework.core.ParameterizedTypeReference<List<Map<String, Object>>>() {});
  }

  @Override
  public OAuth2User loadUser(OAuth2UserRequest request) throws OAuth2AuthenticationException {
    OAuth2User profile = delegate.loadUser(request);
    Map<String, Object> attrs = new HashMap<>(profile.getAttributes());
    attrs.remove("email");
    attrs.remove("email_verified");

    List<Map<String, Object>> list = List.of();
    try {
      List<Map<String, Object>> fetched = emails.fetch(request.getAccessToken().getTokenValue());
      if (fetched != null) list = fetched;
    } catch (RuntimeException e) {
      // Never log the token; the class name is enough to diagnose scope/network problems.
      log.warn("GitHub /user/emails lookup failed: {}", e.getClass().getSimpleName());
    }
    for (Map<String, Object> e : list) {
      if (Boolean.TRUE.equals(e.get("primary")) && e.get("email") instanceof String s && !s.isBlank()) {
        attrs.put("email", s);
        attrs.put("email_verified", Boolean.TRUE.equals(e.get("verified")));
        break;
      }
    }
    String nameKey = request.getClientRegistration().getProviderDetails()
        .getUserInfoEndpoint().getUserNameAttributeName();
    return new DefaultOAuth2User(profile.getAuthorities(), attrs, nameKey);
  }
}
