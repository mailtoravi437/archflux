package com.archflux.web.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

public class ThreadCreateRequest {

  @NotBlank(message = "author is required")
  private String author;

  @JsonProperty("pinned_to")
  @JsonAlias("pinnedTo")
  private String pinnedTo;

  @NotBlank(message = "text is required")
  private String text;

  private Boolean resolved;

  public String getAuthor() {
    return author;
  }

  public void setAuthor(String author) {
    this.author = author;
  }

  public String getPinnedTo() {
    return pinnedTo;
  }

  public void setPinnedTo(String pinnedTo) {
    this.pinnedTo = pinnedTo;
  }

  public String getText() {
    return text;
  }

  public void setText(String text) {
    this.text = text;
  }

  public Boolean getResolved() {
    return resolved;
  }

  public void setResolved(Boolean resolved) {
    this.resolved = resolved;
  }
}
