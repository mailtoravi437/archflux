package com.archflux.security;

import java.io.IOException;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * Request logging filter that adds correlation IDs to all requests
 * and logs request/response info.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class RequestLoggingFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);
  private static final String CORRELATION_ID_HEADER = "X-Correlation-ID";
  private static final String MDC_KEY = "correlationId";
  /** Query parameters that carry credentials and must never reach logs (SVC-G28). */
  private static final Set<String> SENSITIVE_PARAMS =
      Set.of("token", "code", "state", "access_token", "id_token", "refresh_token", "samlresponse", "password", "secret");

  static String redactQuery(String query) {
    StringBuilder out = new StringBuilder(query.length());
    for (String pair : query.split("&", -1)) {
      if (out.length() > 0) {
        out.append('&');
      }
      int eq = pair.indexOf('=');
      String name = eq < 0 ? pair : pair.substring(0, eq);
      if (eq >= 0 && SENSITIVE_PARAMS.contains(name.toLowerCase(Locale.ROOT))) {
        out.append(name).append("=***");
      } else {
        out.append(pair);
      }
    }
    return out.toString();
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    String correlationId = request.getHeader(CORRELATION_ID_HEADER);
    if (correlationId == null || correlationId.isBlank()) {
      correlationId = UUID.randomUUID().toString();
    }
    MDC.put(MDC_KEY, correlationId);
    response.setHeader(CORRELATION_ID_HEADER, correlationId);

    long start = System.nanoTime();
    String method = request.getMethod();
    String uri = request.getRequestURI();
    String query = request.getQueryString();
    String fullUri = query != null ? uri + "?" + redactQuery(query) : uri;

    try {
      log.info("→ {} {}", method, fullUri);
      chain.doFilter(request, response);
    } finally {
      long durationMs = (System.nanoTime() - start) / 1_000_000;
      log.info("← {} {} {}ms status={}", method, fullUri, durationMs, response.getStatus());
      MDC.remove(MDC_KEY);
    }
  }
}