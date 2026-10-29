package com.archflux.security;

import java.util.UUID;
import jakarta.servlet.http.HttpServletRequest;

/** Holds the authenticated dev user id for the current request. */
public final class RequestUser {

  public static final String ATTRIBUTE = "archflux.userId";
  public static final String ACTOR = "dev";

  private RequestUser() {
  }

  public static void set(HttpServletRequest request, UUID userId) {
    request.setAttribute(ATTRIBUTE, userId);
  }

  public static UUID get(HttpServletRequest request) {
    Object value = request.getAttribute(ATTRIBUTE);
    return value instanceof UUID uuid ? uuid : null;
  }
}
