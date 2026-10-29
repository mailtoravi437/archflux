package com.archflux.web.dto;

import jakarta.validation.constraints.NotBlank;

public class CheckpointCreateRequest {

  @NotBlank(message = "title is required")
  private String title;

  private String meta;

  private String branch;

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

  public String getBranch() {
    return branch;
  }

  public void setBranch(String branch) {
    this.branch = branch;
  }
}
