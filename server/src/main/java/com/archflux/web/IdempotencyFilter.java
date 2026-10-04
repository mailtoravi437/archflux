package com.archflux.web;

import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Idempotency key filter. Stores processed keys in memory (dev) with TTL.
 * For production, replace with Redis-backed store.
 * Header: {@code Idempotency-Key} (client-generated UUID).
 * Response headers: {@code Idempotency-Key}, {@code Idempotency-Replay: true/false}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 15)
public class IdempotencyFilter extends OncePerRequestFilter {

  private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";
  private static final String REPLAY_HEADER = "Idempotency-Replay";
  private static final java.util.concurrent.ConcurrentHashMap<String, IdempotencyRecord> store =
      new java.util.concurrent.ConcurrentHashMap<>();

  private static class IdempotencyRecord {
    final int status;
    final byte[] body;
    final long expiresAt;

    IdempotencyRecord(int status, byte[] body, long ttlMs) {
      this.status = status;
      this.body = body;
      this.expiresAt = System.currentTimeMillis() + ttlMs;
    }

    boolean isExpired() {
      return System.currentTimeMillis() > expiresAt;
    }
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    String method = request.getMethod();
    if (!"POST".equalsIgnoreCase(method) && !"PUT".equalsIgnoreCase(method)
        && !"PATCH".equalsIgnoreCase(method)) {
      chain.doFilter(request, response);
      return;
    }

    String key = request.getHeader(IDEMPOTENCY_HEADER);
    if (key == null || key.isBlank()) {
      chain.doFilter(request, response);
      return;
    }
    if (!isValidUuid(key)) {
      response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
      response.setContentType("application/json");
      response.getWriter().write(
          "{\"error\":{\"code\":\"IDEMPOTENCY_KEY_INVALID\",\"message\":\"Idempotency-Key must be a valid UUID\"}}");
      return;
    }

    // Cleanup expired entries periodically
    if (store.size() > 10000) {
      cleanupExpired();
    }

    IdempotencyRecord existing = store.get(key);
    if (existing != null && !existing.isExpired()) {
      // Replay response
      response.setStatus(existing.status);
      response.setHeader(REPLAY_HEADER, "true");
      response.setHeader(IDEMPOTENCY_HEADER, key);
      response.setContentType("application/json");
      response.getOutputStream().write(existing.body);
      return;
    }

    // Capture response
    CapturedResponseWrapper wrapper = new CapturedResponseWrapper(response);
    try {
      chain.doFilter(request, wrapper);
    } finally {
      if (wrapper.getStatus() < 500) {
        byte[] body = wrapper.getCapture();
        store.put(key, new IdempotencyRecord(wrapper.getStatus(), body, 24 * 60 * 60 * 1000L)); // 24h TTL
      }
    }
    response.setHeader(IDEMPOTENCY_HEADER, key);
    response.setHeader(REPLAY_HEADER, "false");
  }

  private void cleanupExpired() {
    store.entrySet().removeIf(e -> e.getValue().isExpired());
  }

  private boolean isValidUuid(String s) {
    try {
      UUID.fromString(s);
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  /** Response wrapper that captures body for idempotency replay. */
  private static class CapturedResponseWrapper extends jakarta.servlet.http.HttpServletResponseWrapper {
    private final java.io.ByteArrayOutputStream capture = new java.io.ByteArrayOutputStream();
    private int status = HttpServletResponse.SC_OK;

    CapturedResponseWrapper(HttpServletResponse response) {
      super(response);
    }

    @Override
    public jakarta.servlet.ServletOutputStream getOutputStream() {
      return new jakarta.servlet.ServletOutputStream() {
        @Override
        public void write(int b) {
          capture.write(b);
        }

        @Override
        public void write(byte[] b, int off, int len) {
          capture.write(b, off, len);
        }

        @Override
        public boolean isReady() {
          return true;
        }

        @Override
        public void setWriteListener(jakarta.servlet.WriteListener listener) {
        }
      };
    }

    @Override
    public void setStatus(int sc) {
      super.setStatus(sc);
      this.status = sc;
    }

    public byte[] getCapture() {
      return capture.toByteArray();
    }

    public int getStatus() {
      return status;
    }
  }
}