package com.archflux.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Body for {@code POST /api/v1/diagrams/{id}/members} (R1-E07-T02). */
public class MemberAddRequest {

  @NotBlank(message = "email is required")
  @Email(message = "email must be a valid address")
  @Size(max = 320, message = "email must be at most 320 characters")
  private String email;

  @NotBlank(message = "role is required")
  @Pattern(regexp = "owner|editor|commenter|viewer",
      message = "role must be owner, editor, commenter or viewer")
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
