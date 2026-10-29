package com.archflux.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Share-link tokens (R1-E07-T03). A token is 32 bytes from
 * {@link SecureRandom}, base64url without padding (43 characters). Only its
 * SHA-256 hex digest is ever stored; lookups go through the hash, so there is
 * no byte-by-byte comparison of secrets. Tokens travel only in the
 * {@code X-Share-Token} header, never in a query string, and this class never
 * logs anything.
 */
public final class ShareTokens {

  public static final String HEADER = "X-Share-Token";

  /** Request attribute: the token was presented without a JWT (link-only request). */
  public static final String SHARE_ONLY_ATTRIBUTE = "archflux.shareOnly";

  private static final Pattern FORMAT = Pattern.compile("^[A-Za-z0-9_-]{43}$");
  private static final SecureRandom RANDOM = new SecureRandom();

  private ShareTokens() {
  }

  /** A fresh 32-byte random token, base64url without padding. */
  public static String generate() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  /** True when the value has the shape of a token we issue. */
  public static boolean wellFormed(String token) {
    return token != null && FORMAT.matcher(token).matches();
  }

  /** Lower-case SHA-256 hex digest of the token's UTF-8 bytes. */
  public static String hash(String token) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 unavailable", e);
    }
  }

  /** The well-formed token presented on this request, else null. */
  public static String fromRequest(HttpServletRequest request) {
    if (request == null) {
      return null;
    }
    String value = request.getHeader(HEADER);
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return wellFormed(trimmed) ? trimmed : null;
  }

  /** The well-formed token on the current servlet request, else null. */
  public static String current() {
    if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
      return fromRequest(attrs.getRequest());
    }
    return null;
  }

  /** SHA-256 of the current request's token, else null. */
  public static String currentHash() {
    String token = current();
    return token == null ? null : hash(token);
  }
}
