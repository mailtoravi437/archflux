package com.archflux.auth;

import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal;

import java.util.List;

/**
 * Resolves the email a sign-in provider asserts for a user (H1, 2026-10-31).
 * An email is returned only when the provider says it is verified, because the
 * email is the account join key: an unverified address must never reach
 * {@code provision_user}, which would adopt an existing account with that email.
 * Error codes are the {@code ?error=} values shown on /login.
 */
public final class OAuthEmail {

  public static final String NO_EMAIL = "no_email";
  public static final String EMAIL_NOT_VERIFIED = "email_not_verified";

  public record Result(String email, String error) {
    public boolean ok() {
      return error == null;
    }
  }

  private OAuthEmail() {}

  public static Result resolve(Object principal) {
    if (principal instanceof OidcUser oidc) {
      String email = oidc.getEmail();
      if (email == null || email.isBlank()) return new Result(null, NO_EMAIL);
      return Boolean.TRUE.equals(oidc.getEmailVerified())
          ? new Result(email, null)
          : new Result(null, EMAIL_NOT_VERIFIED);
    }
    if (principal instanceof OAuth2User oauth2) {
      // Only the "email" attribute is considered. A login name that merely looks like an
      // address is never an email, and an email is trusted only with an explicit verified flag
      // (set by GithubOAuth2UserService from GitHub's verified-emails endpoint).
      Object email = oauth2.getAttributes().get("email");
      if (!(email instanceof String s) || s.isBlank()) return new Result(null, NO_EMAIL);
      Object verified = oauth2.getAttributes().get("email_verified");
      boolean isVerified = Boolean.TRUE.equals(verified) || "true".equals(verified);
      return isVerified ? new Result(s, null) : new Result(null, EMAIL_NOT_VERIFIED);
    }
    if (principal instanceof Saml2AuthenticatedPrincipal saml) {
      // SAML: the operator-configured IdP is the trust anchor (disabled in production).
      for (String key : List.of("email", "Email", "emailaddress", "nameID")) {
        Object v = saml.getAttributes().get(key);
        if (v instanceof String s && !s.isBlank()) return new Result(s, null);
        if (v instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof String s && !s.isBlank()) {
          return new Result(s, null);
        }
      }
      String name = saml.getName();
      if (name != null && name.contains("@")) return new Result(name, null);
    }
    return new Result(null, NO_EMAIL);
  }
}
