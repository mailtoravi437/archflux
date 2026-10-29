package com.archflux.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** Body for {@code PUT /api/v1/diagrams/{id}/members/{userId}} (diagram roles). */
public class MemberRoleRequest {

  @NotBlank(message = "role is required")
  @Pattern(regexp = "^(owner|editor|commenter|viewer)$",
      message = "role must be owner, editor, commenter or viewer")
  private String role;

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }
}
