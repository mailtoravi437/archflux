package com.archflux.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** SERVICES_SPEC §4.2: CSRF Origin check honours the shared allow-list. */
class OriginCheckFilterTest {

  private final OriginCheckFilter filter =
      new OriginCheckFilter("https://app.example.com,http://localhost:8080", "https://ignored.example.com");

  private int run(String method, String origin, String referer) throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest(method, "/api/v1/diagrams");
    if (origin != null) request.addHeader("Origin", origin);
    if (referer != null) request.addHeader("Referer", referer);
    MockHttpServletResponse response = new MockHttpServletResponse();
    filter.doFilter(request, response, new MockFilterChain());
    return response.getStatus();
  }

  @Test
  void allowsListedOrigins() throws Exception {
    assertThat(run("POST", "https://app.example.com", null)).isEqualTo(200);
    assertThat(run("PUT", "http://localhost:8080", null)).isEqualTo(200);
    assertThat(run("DELETE", null, "https://app.example.com/#/canvas")).isEqualTo(200);
  }

  @Test
  void rejectsUnlistedOrigins() throws Exception {
    assertThat(run("POST", "https://evil.example.com", null)).isEqualTo(403);
    // Same host, different port: no longer accepted (was host-only before).
    assertThat(run("POST", "http://localhost:5173", null)).isEqualTo(403);
  }

  @Test
  void ignoresSafeMethodsAndHeaderlessClients() throws Exception {
    assertThat(run("GET", "https://evil.example.com", null)).isEqualTo(200);
    assertThat(run("POST", null, null)).isEqualTo(200);
  }
}
