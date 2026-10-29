package com.archflux.config;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The single browser-origin allow-list (SERVICES_SPEC §4.2) shared by CORS,
 * the CSRF Origin check and the WebSocket handshake. Built from
 * {@code app.cors.allowed-origins} (comma-separated); when that is blank the
 * list is {@code app.frontend-url} plus the local dev origins.
 */
public final class AllowedOrigins {

  static final List<String> DEV_ORIGINS = List.of(
      "http://localhost:5173",  // Vite dev server
      "http://localhost:8080",  // web container
      "http://127.0.0.1:5173",
      "http://127.0.0.1:8080");

  private final Set<String> origins;

  private AllowedOrigins(Set<String> origins) {
    this.origins = origins;
  }

  public static AllowedOrigins from(String configured, String frontendUrl) {
    Set<String> out = new LinkedHashSet<>();
    if (configured == null || configured.isBlank()) {
      addNormalized(out, frontendUrl);
      DEV_ORIGINS.forEach(o -> addNormalized(out, o));
    } else {
      for (String part : configured.split(",")) {
        addNormalized(out, part);
      }
    }
    return new AllowedOrigins(out);
  }

  /** True when the origin of {@code originOrUrl} (an Origin header or a full Referer URL) is allowed. */
  public boolean isAllowed(String originOrUrl) {
    String origin = normalize(originOrUrl);
    return origin != null && origins.contains(origin);
  }

  public List<String> asList() {
    return new ArrayList<>(origins);
  }

  /** {@code scheme://host[:port]}, lower-cased, default ports dropped; null if unparsable. */
  static String normalize(String url) {
    if (url == null || url.isBlank()) {
      return null;
    }
    try {
      URI uri = URI.create(url.trim());
      String scheme = uri.getScheme();
      String host = uri.getHost();
      if (scheme == null || host == null) {
        return null;
      }
      scheme = scheme.toLowerCase(Locale.ROOT);
      int port = uri.getPort();
      boolean defaultPort = port == -1
          || ("http".equals(scheme) && port == 80)
          || ("https".equals(scheme) && port == 443);
      return scheme + "://" + host.toLowerCase(Locale.ROOT) + (defaultPort ? "" : ":" + port);
    } catch (IllegalArgumentException e) {
      return null;
    }
  }

  private static void addNormalized(Set<String> out, String url) {
    String origin = normalize(url);
    if (origin != null) {
      out.add(origin);
    }
  }
}
