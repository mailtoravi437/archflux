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
 * In-memory per-IP token buckets for POST /api/v1/sync, POST /api/v1/lint,
 * and POST /api/v1/auth/magic-link (the last slows magic-link email abuse),
 * plus a stricter 30/min per-IP bucket for link-only requests (an
 * X-Share-Token without a JWT, R1-E07-T03) to slow token guessing.
 * Fail-open: any internal error lets the request through.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RateLimitFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

  static final Set<String> LIMITED_PATHS =
      Set.of("/api/v1/sync", "/api/v1/lint", "/api/v1/auth/magic-link");
  static final double CAPACITY = 60.0;
  static final double REFILL_PER_SECOND = 1.0;
  /** Link-only requests: 30 per minute per IP. */
  static final double SHARE_CAPACITY = 30.0;
  static final double SHARE_REFILL_PER_SECOND = 0.5;

  private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
  private final ConcurrentHashMap<String, Bucket> shareBuckets = new ConcurrentHashMap<>();

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    try {
      Bucket bucket;
      if (Boolean.TRUE.equals(request.getAttribute(ShareTokens.SHARE_ONLY_ATTRIBUTE))) {
        bucket = shareBuckets.computeIfAbsent(clientIp(request),
            k -> new Bucket(SHARE_CAPACITY, SHARE_REFILL_PER_SECOND));
      } else if ("POST".equalsIgnoreCase(request.getMethod())
          && LIMITED_PATHS.contains(request.getRequestURI())) {
        String key = clientIp(request) + "|" + request.getRequestURI();
        bucket = buckets.computeIfAbsent(key, k -> new Bucket());
      } else {
        chain.doFilter(request, response);
        return;
      }
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

  /**
   * The client address as resolved by Tomcat's RemoteIpValve
   * ({@code server.forward-headers-strategy: native}): X-Forwarded-For is
   * honoured only when it arrives from a trusted internal proxy, so a client
   * cannot pick its own bucket by sending the header (SVC-G27).
   */
  static String clientIp(HttpServletRequest request) {
    String remote = request.getRemoteAddr();
    return remote == null ? "unknown" : remote;
  }

  /** Token bucket. tryConsume returns -1 when allowed, else seconds until retry. */
  static final class Bucket {
    private final double capacity;
    private final double refillPerSecond;
    private double tokens;
    private long lastNanos = System.nanoTime();

    Bucket() {
      this(CAPACITY, REFILL_PER_SECOND);
    }

    Bucket(double capacity, double refillPerSecond) {
      this.capacity = capacity;
      this.refillPerSecond = refillPerSecond;
      this.tokens = capacity;
    }

    synchronized long tryConsume() {
      long now = System.nanoTime();
      double elapsedSeconds = (now - lastNanos) / 1_000_000_000.0;
      lastNanos = now;
      tokens = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);
      if (tokens >= 1.0) {
        tokens -= 1.0;
        return -1;
      }
      double deficit = 1.0 - tokens;
      return Math.max(1L, (long) Math.ceil(deficit / refillPerSecond));
    }
  }
}
