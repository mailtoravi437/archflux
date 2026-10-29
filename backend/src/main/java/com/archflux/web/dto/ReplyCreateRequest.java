package com.archflux.web.dto;

import jakarta.validation.constraints.NotBlank;

public class ReplyCreateRequest {

  @NotBlank(message = "author is required")
  private String author;

  @NotBlank(message = "text is required")
  private String text;

  public String getAuthor() {
    return author;
  }

  public void setAuthor(String author) {
    this.author = author;
  }

  public String getText() {
    return text;
  }

  public void setText(String text) {
    this.text = text;
  }
}
