package com.archflux.web.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Body for {@code DELETE /api/v1/diagrams/{id}/purge}: the exact title, typed to confirm. */
public class DiagramPurgeRequest {

  @NotNull(message = "confirmTitle is required")
  @Size(max = 500, message = "confirmTitle must be at most 500 characters")
  private String confirmTitle;

  public String getConfirmTitle() {
    return confirmTitle;
  }

  public void setConfirmTitle(String confirmTitle) {
    this.confirmTitle = confirmTitle;
  }
}
