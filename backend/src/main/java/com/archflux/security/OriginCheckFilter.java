package com.archflux.security;

import com.archflux.config.AllowedOrigins;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * CSRF posture for cookie authentication (PROD-011). State-changing
 * {@code /api/v1/**} requests that carry a browser {@code Origin}/{@code Referer}
 * header whose origin is not in {@link AllowedOrigins} (SERVICES_SPEC §4.2) are rejected.
 * Requests without either header (non-browser API clients) pass through to
 * authentication untouched.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 11)
public class OriginCheckFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger(OriginCheckFilter.class);

  private final AllowedOrigins allowedOrigins;

  public OriginCheckFilter(
      @Value("${app.cors.allowed-origins:}") String configuredOrigins,
      @Value("${app.frontend-url:http://localhost:5173}") String frontendUrl) {
    this.allowedOrigins = AllowedOrigins.from(configuredOrigins, frontendUrl);
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    if (isStateChanging(request.getMethod()) && request.getRequestURI().startsWith("/api/v1/")) {
      String origin = headerValue(request, "Origin");
      String referer = headerValue(request, "Referer");
      String candidate = origin != null ? origin : referer;
      if (candidate != null && !allowedOrigins.isAllowed(candidate)) {
        log.info("Cross-origin {} to {} rejected (origin {})",
            request.getMethod(), request.getRequestURI(), candidate);
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.getWriter().write(
            "{\"error\":{\"code\":\"FORBIDDEN\",\"message\":\"Cross-origin request rejected\"}}");
        return;
      }
    }
    chain.doFilter(request, response);
  }

  private boolean isStateChanging(String method) {
    return "POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method)
        || "PATCH".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method);
  }

  private static String headerValue(HttpServletRequest request, String name) {
    String value = request.getHeader(name);
    return value == null || value.isBlank() ? null : value.trim();
  }
}
