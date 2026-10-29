package com.archflux.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Body for {@code POST /api/v1/diagrams/{id}/access-requests} (R1-E07-T04). */
public class AccessRequestCreateRequest {

  @NotBlank(message = "role is required")
  @Pattern(regexp = "editor|commenter|viewer", message = "role must be editor, commenter or viewer")
  private String role;

  @Size(max = 500, message = "note must be at most 500 characters")
  private String note;

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public String getNote() {
    return note;
  }

  public void setNote(String note) {
    this.note = note;
  }
}
