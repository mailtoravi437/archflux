package com.archflux.web.dto;

import jakarta.validation.constraints.Pattern;

/** Optional body for {@code POST /api/v1/access-requests/{id}/approve}: a different (e.g. lower) role. */
public class AccessDecisionRequest {

  @Pattern(regexp = "editor|commenter|viewer", message = "role must be editor, commenter or viewer")
  private String role;

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }
}
