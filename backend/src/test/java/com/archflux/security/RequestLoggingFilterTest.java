package com.archflux.security;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** SVC-G28: credentials in query strings never reach the access log. */
class RequestLoggingFilterTest {

  @Test
  void redactsSensitiveParamsAndKeepsOthers() {
    assertEquals("token=***", RequestLoggingFilter.redactQuery("token=fba45ae7-ee70-47a4-8d0e-91ee2abdb513"));
    assertEquals("page=2&code=***&State=***&limit=20",
        RequestLoggingFilter.redactQuery("page=2&code=abc&State=xyz&limit=20"));
    assertEquals("q=token", RequestLoggingFilter.redactQuery("q=token"));
    assertEquals("flag", RequestLoggingFilter.redactQuery("flag"));
  }
}
