package com.archflux.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** SERVICES_SPEC §4.2 (SVC-G8/G9): one exact allow-list, never a wildcard. */
class AllowedOriginsTest {

  @Test
  void blankConfigMeansFrontendUrlPlusDevOrigins() {
    AllowedOrigins origins = AllowedOrigins.from("", "https://app.example.com/");
    assertThat(origins.asList()).first().isEqualTo("https://app.example.com");
    assertThat(origins.isAllowed("http://localhost:5173")).isTrue();
    assertThat(origins.isAllowed("http://localhost:8080")).isTrue();
  }

  @Test
  void explicitConfigReplacesDefaults() {
    AllowedOrigins origins = AllowedOrigins.from(" https://app.example.com , https://admin.example.com",
        "http://localhost:5173");
    assertThat(origins.asList()).containsExactly("https://app.example.com", "https://admin.example.com");
    assertThat(origins.isAllowed("http://localhost:5173")).isFalse();
  }

  @Test
  void comparesFullOriginIncludingSchemeAndPort() {
    AllowedOrigins origins = AllowedOrigins.from("https://app.example.com", "");
    assertThat(origins.isAllowed("https://APP.example.com")).isTrue();
    assertThat(origins.isAllowed("https://app.example.com:443")).isTrue();
    assertThat(origins.isAllowed("https://app.example.com/#/canvas?x=1")).isTrue(); // Referer form
    assertThat(origins.isAllowed("http://app.example.com")).isFalse();
    assertThat(origins.isAllowed("https://app.example.com:8443")).isFalse();
    assertThat(origins.isAllowed("https://app.example.com.evil.test")).isFalse();
    assertThat(origins.isAllowed("null")).isFalse();
    assertThat(origins.isAllowed(null)).isFalse();
  }
}
