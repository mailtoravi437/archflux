package com.archflux.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import com.archflux.config.AppProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Custom Bearer-token auth (no Spring Security). All /api/v1/** require
 * {@code Authorization: Bearer <token>}; /api/health and /api/ready are public.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class AuthFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger(AuthFilter.class);

  private static final Set<String> PUBLIC_PATHS = Set.of("/api/health", "/api/ready");

  private final AppProperties appProperties;

  public AuthFilter(AppProperties appProperties) {
    this.appProperties = appProperties;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    String path = request.getRequestURI();
    if (PUBLIC_PATHS.contains(path) || path.equals("/error")) {
      chain.doFilter(request, response);
      return;
    }
    if (!path.startsWith("/api/v1/")) {
      chain.doFilter(request, response);
      return;
    }
    String header = request.getHeader("Authorization");
    String presented = null;
    if (header != null && header.startsWith("Bearer ")) {
      presented = header.substring("Bearer ".length()).trim();
    }
    if (presented == null || presented.isEmpty()
        || !MessageDigest.isEqual(presented.getBytes(StandardCharsets.UTF_8),
            appProperties.effectiveToken().getBytes(StandardCharsets.UTF_8))) {
      log.info("Unauthenticated request to {}", path);
      writeUnauthorized(response);
      return;
    }
    RequestUser.set(request, appProperties.currentUserId());
    chain.doFilter(request, response);
  }

  static void writeUnauthorized(HttpServletResponse response) throws IOException {
    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
    response.setContentType("application/json");
    response.getWriter().write("{\"error\":{\"code\":\"UNAUTHENTICATED\",\"message\":\"Missing or invalid bearer token\"}}");
  }
}
