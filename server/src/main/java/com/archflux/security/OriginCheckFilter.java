package com.archflux.security;

import java.io.IOException;
import java.net.URI;
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
 * header whose host differs from the configured frontend host are rejected.
 * Requests without either header (non-browser API clients) pass through to
 * authentication untouched.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 11)
public class OriginCheckFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger(OriginCheckFilter.class);

  private final String frontendHost;

  public OriginCheckFilter(@Value("${app.frontend-url:http://localhost:5173}") String frontendUrl) {
    this.frontendHost = hostOf(frontendUrl);
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    if (isStateChanging(request.getMethod()) && request.getRequestURI().startsWith("/api/v1/")) {
      String origin = headerValue(request, "Origin");
      String referer = headerValue(request, "Referer");
      String candidate = origin != null ? origin : referer;
      if (candidate != null && !hostMatches(candidate)) {
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

  private boolean hostMatches(String candidate) {
    String host = hostOf(candidate);
    return host != null && !host.isBlank() && host.equalsIgnoreCase(frontendHost);
  }

  private boolean isStateChanging(String method) {
    return "POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method)
        || "PATCH".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method);
  }

  private static String headerValue(HttpServletRequest request, String name) {
    String value = request.getHeader(name);
    return value == null || value.isBlank() ? null : value.trim();
  }

  static String hostOf(String url) {
    try {
      String host = URI.create(url).getHost();
      if (host != null) {
        return host.toLowerCase();
      }
    } catch (IllegalArgumentException ignored) {
      // Unparsable candidate — treated as non-matching by the caller.
    }
    return null;
  }
}
