package com.archflux.config;

import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Prod-only startup guard: refuses template/dev placeholder secrets so a copied
 * {@code .env.example} can never serve production traffic (SVC-G33, §7).
 */
@Component
@Profile("prod")
public class ProdSecretGuard {

  static final String[] PLACEHOLDER_MARKERS = {"change-me", "changeme", "dev-only", "dev-secret", "placeholder"};

  public ProdSecretGuard(
      @Value("${app.jwt-secret:}") String jwtSecret,
      @Value("${app.api-token:}") String apiToken) {
    check(Map.of("JWT_SECRET", jwtSecret, "API_TOKEN", apiToken));
  }

  static void check(Map<String, String> secrets) {
    secrets.forEach((name, value) -> {
      String v = value == null ? "" : value.toLowerCase(Locale.ROOT);
      for (String marker : PLACEHOLDER_MARKERS) {
        if (v.contains(marker)) {
          throw new IllegalStateException("FATAL: " + name
              + " is a template placeholder — generate a real value (openssl rand -hex 32). Refusing to start.");
        }
      }
    });
  }
}
