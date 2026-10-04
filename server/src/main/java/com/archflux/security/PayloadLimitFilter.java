package com.archflux.security;

import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Rejects requests whose declared Content-Length exceeds 1 MiB with
 * 413 PAYLOAD_TOO_LARGE before the body is read.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class PayloadLimitFilter extends OncePerRequestFilter {

  static final long MAX_BYTES = 1024L * 1024L;

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    String contentLength = request.getHeader("Content-Length");
    if (contentLength != null) {
      try {
        if (Long.parseLong(contentLength.trim()) > MAX_BYTES) {
          response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
          response.setContentType("application/json");
          response.getWriter().write(
              "{\"error\":{\"code\":\"PAYLOAD_TOO_LARGE\",\"message\":\"Request body exceeds 1 MB limit\"}}");
          return;
        }
      } catch (NumberFormatException ignored) {
        // Fall through and let the container handle a malformed header.
      }
    }
    chain.doFilter(request, response);
  }
}
