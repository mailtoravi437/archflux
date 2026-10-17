package com.archflux.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;
import com.archflux.security.RequestUser;
import com.archflux.service.IdempotencyService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Idempotency key filter backed by durable PostgreSQL storage
 * ({@link IdempotencyService}, 24h TTL, per-user scope).
 * Header: {@code Idempotency-Key} (client-generated UUID).
 * Response headers: {@code Idempotency-Key}, {@code Idempotency-Replay: true/false}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 15)
public class IdempotencyFilter extends OncePerRequestFilter {

  private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";
  private static final String REPLAY_HEADER = "Idempotency-Replay";

  private final IdempotencyService idempotency;

  public IdempotencyFilter(IdempotencyService idempotency) {
    this.idempotency = idempotency;
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
    UUID uuid;
    try {
      uuid = UUID.fromString(key.trim());
    } catch (Exception e) {
      response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
      response.setContentType("application/json");
      response.getWriter().write(
          "{\"error\":{\"code\":\"IDEMPOTENCY_KEY_INVALID\",\"message\":\"Idempotency-Key must be a valid UUID\"}}");
      return;
    }

    UUID userId = RequestUser.get(request);
    Optional<IdempotencyService.Stored> hit = idempotency.replay(uuid, userId);
    if (hit.isPresent()) {
      IdempotencyService.Stored stored = hit.get();
      response.setStatus(stored.status());
      response.setHeader(REPLAY_HEADER, "true");
      response.setHeader(IDEMPOTENCY_HEADER, key);
      response.setContentType("application/json");
      response.getOutputStream().write(stored.body());
      return;
    }

    ContentCachingResponseWrapper wrapper = new ContentCachingResponseWrapper(response);
    try {
      chain.doFilter(request, wrapper);
    } finally {
      byte[] body = wrapper.getContentAsByteArray();
      if (wrapper.getStatus() < 500) {
        idempotency.store(uuid, userId, wrapper.getStatus(), body);
      }
      // Headers before the body hits the wire (commits on flush).
      response.setHeader(IDEMPOTENCY_HEADER, key);
      response.setHeader(REPLAY_HEADER, "false");
      wrapper.copyBodyToResponse();
    }
  }

  /** Visible for tests: mirrors the wire header names. */
  static String headerName() {
    return IDEMPOTENCY_HEADER;
  }

  /** Visible for tests: mirrors the wire header names. */
  static String replayHeaderName() {
    return REPLAY_HEADER;
  }
}
