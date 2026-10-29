package com.archflux.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** Body for {@code PATCH /api/v1/workspaces/current/members/{userId}}. */
public class WorkspaceMemberRoleRequest {

  @NotBlank(message = "role is required")
  @Pattern(regexp = "^(admin|editor|reviewer|viewer)$",
      message = "role must be admin, editor, reviewer or viewer")
  private String role;

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }
}
