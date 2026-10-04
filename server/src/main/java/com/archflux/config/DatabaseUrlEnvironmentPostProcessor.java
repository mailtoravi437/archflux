package com.archflux.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Converts a {@code DATABASE_URL} of the form
 * {@code postgresql://user:pass@host:port/db?params} into the standard
 * {@code spring.datasource.*} properties (jdbc URL + credentials).
 *
 * <p>Precedence: explicit {@code spring.datasource.url} (i.e.
 * {@code SPRING_DATASOURCE_URL}) always wins. This post-processor only fills
 * in values that are still blank. Final fallback is a local-dev default.
 * Never logs credentials.
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
public class DatabaseUrlEnvironmentPostProcessor implements EnvironmentPostProcessor {

  static final String SOURCE_NAME = "archfluxDatabaseUrl";

  @Override
  public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
    String explicitUrl = environment.getProperty("spring.datasource.url", "");
    String databaseUrl = environment.getProperty("DATABASE_URL", "");
    Map<String, Object> props = new HashMap<>();

    if ((explicitUrl == null || explicitUrl.isBlank()) && databaseUrl != null && !databaseUrl.isBlank()) {
      ParsedDbUrl parsed = parse(databaseUrl.trim());
      if (parsed != null) {
        props.put("spring.datasource.url", parsed.jdbcUrl());
        if (isBlank(environment.getProperty("spring.datasource.username")) && parsed.username() != null) {
          props.put("spring.datasource.username", parsed.username());
        }
        if (isBlank(environment.getProperty("spring.datasource.password")) && parsed.password() != null) {
          props.put("spring.datasource.password", parsed.password());
        }
      }
    }

    if (isBlank(explicitUrl) && !props.containsKey("spring.datasource.url")
        && isBlank(environment.getProperty("DATABASE_URL"))) {
      // Local-dev default so a bare boot (no env) still has a target to probe.
      props.putIfAbsent("spring.datasource.url", "jdbc:postgresql://localhost:5432/archflux");
      if (isBlank(environment.getProperty("spring.datasource.username"))) {
        props.put("spring.datasource.username", "archflux");
      }
      if (isBlank(environment.getProperty("spring.datasource.password"))) {
        props.put("spring.datasource.password", "dev-postgres-pw");
      }
    }

    if (!props.isEmpty()) {
      environment.getPropertySources().addFirst(new MapPropertySource(SOURCE_NAME, props));
    }
  }

  /** Parses {@code postgresql://[user[:pass]@]host[:port]/db[?query]}. Returns null if unparseable. */
  static ParsedDbUrl parse(String databaseUrl) {
    try {
      String normalized = databaseUrl;
      int schemeEnd = normalized.indexOf("://");
      if (schemeEnd < 0) {
        return null;
      }
      // URI needs a scheme it knows; swap postgresql:// -> http:// for parsing.
      URI uri = new URI("http" + normalized.substring(schemeEnd));
      String host = uri.getHost();
      if (host == null || host.isBlank()) {
        return null;
      }
      int port = uri.getPort() == -1 ? 5432 : uri.getPort();
      String path = uri.getPath();
      String db = (path == null || path.isBlank() || path.equals("/")) ? "postgres" : path.substring(1);
      StringBuilder jdbc = new StringBuilder("jdbc:postgresql://").append(host).append(':').append(port)
          .append('/').append(db);
      if (uri.getQuery() != null && !uri.getQuery().isBlank()) {
        jdbc.append('?').append(uri.getQuery());
      }
      String username = null;
      String password = null;
      String userInfo = uri.getUserInfo();
      if (userInfo != null && !userInfo.isEmpty()) {
        int colon = userInfo.indexOf(':');
        if (colon < 0) {
          username = decode(userInfo);
        } else {
          username = decode(userInfo.substring(0, colon));
          password = decode(userInfo.substring(colon + 1));
        }
      }
      return new ParsedDbUrl(jdbc.toString(), username, password);
    } catch (Exception e) {
      return null;
    }
  }

  private static String decode(String s) {
    return URLDecoder.decode(s, StandardCharsets.UTF_8);
  }

  private static boolean isBlank(String s) {
    return s == null || s.isBlank();
  }

  record ParsedDbUrl(String jdbcUrl, String username, String password) {}
}
