package com.archflux.security;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * In-memory per-IP token buckets for POST /api/v1/sync and POST /api/v1/lint.
 * Fail-open: any internal error lets the request through.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RateLimitFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

  static final Set<String> LIMITED_PATHS = Set.of("/api/v1/sync", "/api/v1/lint");
  static final double CAPACITY = 60.0;
  static final double REFILL_PER_SECOND = 1.0;

  private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    try {
      if (!"POST".equalsIgnoreCase(request.getMethod())
          || !LIMITED_PATHS.contains(request.getRequestURI())) {
        chain.doFilter(request, response);
        return;
      }
      String key = clientIp(request) + "|" + request.getRequestURI();
      Bucket bucket = buckets.computeIfAbsent(key, k -> new Bucket());
      long retryAfter = bucket.tryConsume();
      if (retryAfter >= 0) {
        response.setStatus(429);
        response.setHeader("Retry-After", String.valueOf(retryAfter));
        response.setContentType("application/json");
        response.getWriter().write(
            "{\"error\":{\"code\":\"RATE_LIMITED\",\"message\":\"Rate limit exceeded, retry later\"}}");
        return;
      }
      chain.doFilter(request, response);
    } catch (Exception e) {
      // Fail open.
      log.warn("Rate limiter errored; failing open", e);
      chain.doFilter(request, response);
    }
  }

  static String clientIp(HttpServletRequest request) {
    String forwarded = request.getHeader("X-Forwarded-For");
    if (forwarded != null && !forwarded.isBlank()) {
      return forwarded.split(",")[0].trim();
    }
    String remote = request.getRemoteAddr();
    return remote == null ? "unknown" : remote;
  }

  /** Token bucket. tryConsume returns -1 when allowed, else seconds until retry. */
  static final class Bucket {
    private double tokens = CAPACITY;
    private long lastNanos = System.nanoTime();

    synchronized long tryConsume() {
      long now = System.nanoTime();
      double elapsedSeconds = (now - lastNanos) / 1_000_000_000.0;
      lastNanos = now;
      tokens = Math.min(CAPACITY, tokens + elapsedSeconds * REFILL_PER_SECOND);
      if (tokens >= 1.0) {
        tokens -= 1.0;
        return -1;
      }
      double deficit = 1.0 - tokens;
      return Math.max(1L, (long) Math.ceil(deficit / REFILL_PER_SECOND));
    }
  }
}
