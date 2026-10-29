package com.archflux.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Body for {@code POST /api/v1/workspaces/current/invites}. */
public class InviteRequest {

  @NotBlank(message = "email is required")
  @Email(message = "email is not valid")
  @Size(max = 254, message = "email must be at most 254 characters")
  private String email;

  @NotBlank(message = "role is required")
  @Pattern(regexp = "^(admin|editor|reviewer|viewer)$",
      message = "role must be admin, editor, reviewer or viewer")
  private String role;

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }
}
