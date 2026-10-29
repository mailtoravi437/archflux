package com.archflux.web.dto;

import java.time.Instant;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** Body for {@code POST /api/v1/diagrams/{id}/links} (R1-E07-T03). Links never grant editing. */
public class ShareLinkCreateRequest {

  @NotBlank(message = "role is required")
  @Pattern(regexp = "viewer|commenter", message = "role must be viewer or commenter")
  private String role;

  @NotBlank(message = "audience is required")
  @Pattern(regexp = "workspace|anyone", message = "audience must be workspace or anyone")
  private String audience;

  /** Optional; must be in the future. */
  private Instant expiresAt;

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public String getAudience() {
    return audience;
  }

  public void setAudience(String audience) {
    this.audience = audience;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public void setExpiresAt(Instant expiresAt) {
    this.expiresAt = expiresAt;
  }
}
