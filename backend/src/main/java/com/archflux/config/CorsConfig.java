package com.archflux.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * CORS for archflux-web on another origin (SERVICES_SPEC §4.2): exact origins
 * from {@link AllowedOrigins}, credentials allowed, never a wildcard. Picked up
 * by the security chain via {@code cors(withDefaults())}.
 */
@Configuration
public class CorsConfig {

  @Bean
  public CorsConfigurationSource corsConfigurationSource(
      @Value("${app.cors.allowed-origins:}") String allowedOrigins,
      @Value("${app.frontend-url:http://localhost:5173}") String frontendUrl) {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(AllowedOrigins.from(allowedOrigins, frontendUrl).asList());
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
    config.setAllowedHeaders(List.of("*"));
    config.setExposedHeaders(List.of("X-Correlation-ID", "ETag", "Retry-After"));
    config.setAllowCredentials(true);
    config.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
  }
}
