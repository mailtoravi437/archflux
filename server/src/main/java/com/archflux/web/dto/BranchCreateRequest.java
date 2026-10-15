package com.archflux.web.dto;

import jakarta.validation.constraints.NotBlank;

public class BranchCreateRequest {

  @NotBlank(message = "title is required")
  private String title;

  private String branchName;

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getBranchName() {
    return branchName;
  }

  public void setBranchName(String branchName) {
    this.branchName = branchName;
  }
}
