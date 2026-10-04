package com.archflux.config;

import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.env.Environment;

import jakarta.annotation.PostConstruct;

/**
 * Auth/token configuration. Single-token dev identity with a fixed UUID
 * (seeded by db/seed.dev.sql as dev@archflux.local).
 */
@Configuration
public class AppProperties {

  /** Fixed dev identity — matches db/seed.dev.sql. */
  public static final UUID DEV_USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

  public static final String DEFAULT_DEV_TOKEN = "dev-token";

  private final String configuredToken;
  private final Environment environment;
  private volatile String effectiveToken;

  public AppProperties(@Value("${app.api-token:}") String configuredToken, Environment environment) {
    this.configuredToken = configuredToken == null ? "" : configuredToken.trim();
    this.environment = environment;
  }

  @PostConstruct
  @Lazy(false)
  public void init() {
    boolean prod = isProd();
    if (configuredToken.isBlank()) {
      if (prod) {
        // Fail fast in prod when no token is configured (also enforced in main()).
        throw new IllegalStateException(
            "APP_API_TOKEN (or API_TOKEN) must be set when profile 'prod' is active. Refusing to start.");
      }
      effectiveToken = DEFAULT_DEV_TOKEN;
      org.slf4j.LoggerFactory.getLogger(AppProperties.class)
          .warn("APP_API_TOKEN/API_TOKEN is not set — using the default dev token. Do not use in production.");
    } else {
      effectiveToken = configuredToken;
    }
  }

  public String effectiveToken() {
    String token = effectiveToken;
    if (token == null) {
      // init() has not run yet (lazy boot): resolve without logging side effects.
      return configuredToken.isBlank() && !isProd() ? DEFAULT_DEV_TOKEN : configuredToken;
    }
    return token;
  }

  public boolean isProd() {
    for (String profile : environment.getActiveProfiles()) {
      if (profile.equalsIgnoreCase("prod") || profile.equalsIgnoreCase("production")) {
        return true;
      }
    }
    return false;
  }

  public UUID currentUserId() {
    return DEV_USER_ID;
  }
}
