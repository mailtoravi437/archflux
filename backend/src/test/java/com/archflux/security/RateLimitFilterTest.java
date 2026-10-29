package com.archflux.security;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** SVC-G27: the client cannot choose its rate-limit bucket via X-Forwarded-For. */
class RateLimitFilterTest {

  private static MockHttpServletRequest lint(String remote, String forwardedFor) {
    MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/lint");
    req.setRemoteAddr(remote);
    if (forwardedFor != null) {
      req.addHeader("X-Forwarded-For", forwardedFor);
    }
    return req;
  }

  @Test
  void clientIpIgnoresClientSuppliedForwardedFor() {
    assertEquals("203.0.113.9", RateLimitFilter.clientIp(lint("203.0.113.9", "198.51.100.1")));
  }

  @Test
  void rotatingForwardedForDoesNotEscapeTheLimit() throws Exception {
    RateLimitFilter filter = new RateLimitFilter();
    int limited = 0;
    for (int i = 0; i < (int) RateLimitFilter.CAPACITY + 10; i++) {
      MockHttpServletResponse res = new MockHttpServletResponse();
      filter.doFilter(lint("203.0.113.9", "198.51.100." + i), res, new MockFilterChain());
      if (res.getStatus() == 429) {
        limited++;
      }
    }
    assertEquals(10, limited);
  }

  /** R1-E07-T03: link-only requests (X-Share-Token, no JWT) get a stricter 30/min bucket. */
  @Test
  void tokenOnlyRequestsHaveStricterBucket() throws Exception {
    RateLimitFilter filter = new RateLimitFilter();
    int limited = 0;
    for (int i = 0; i < (int) RateLimitFilter.SHARE_CAPACITY + 5; i++) {
      MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/diagrams/x");
      req.setRemoteAddr("203.0.113.7");
      req.setAttribute(ShareTokens.SHARE_ONLY_ATTRIBUTE, Boolean.TRUE);
      MockHttpServletResponse res = new MockHttpServletResponse();
      filter.doFilter(req, res, new MockFilterChain());
      if (res.getStatus() == 429) {
        limited++;
      }
    }
    assertEquals(5, limited);
    assertEquals(30.0, RateLimitFilter.SHARE_CAPACITY);
    // Signed-in GETs are not limited by this bucket.
    MockHttpServletRequest signedIn = new MockHttpServletRequest("GET", "/api/v1/diagrams/x");
    signedIn.setRemoteAddr("203.0.113.7");
    MockHttpServletResponse res = new MockHttpServletResponse();
    filter.doFilter(signedIn, res, new MockFilterChain());
    assertEquals(200, res.getStatus());
  }
}
