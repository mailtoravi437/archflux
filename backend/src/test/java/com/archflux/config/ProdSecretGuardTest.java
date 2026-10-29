package com.archflux.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Map;
import org.junit.jupiter.api.Test;

/** SVC-G33: the .env.example placeholders boot locally but never in prod. */
class ProdSecretGuardTest {

  @Test
  void rejectsTemplatePlaceholders() {
    assertThrows(IllegalStateException.class, () -> ProdSecretGuard.check(
        Map.of("JWT_SECRET", "dev-only-change-me-openssl-rand-hex-32-xxxxxxxx", "API_TOKEN", "x".repeat(32))));
    assertThrows(IllegalStateException.class, () -> ProdSecretGuard.check(
        Map.of("JWT_SECRET", "a".repeat(64), "API_TOKEN", "change-me-openssl-rand-hex-16")));
  }

  @Test
  void acceptsGeneratedSecrets() {
    assertDoesNotThrow(() -> ProdSecretGuard.check(
        Map.of("JWT_SECRET", "9f2c4e1b7a5d3086c1e4f2a9b7d5c3e1f0a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9", "API_TOKEN", "4b1d9e7c2a5f8e3d")));
  }
}
