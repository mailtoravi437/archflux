package com.archflux.web.dto;

import jakarta.validation.constraints.NotBlank;

public class CheckpointCreateRequest {

  @NotBlank(message = "title is required")
  private String title;

  private String meta;

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getMeta() {
    return meta;
  }

  public void setMeta(String meta) {
    this.meta = meta;
  }
}
