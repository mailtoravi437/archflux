package com.archflux.web.dto;

/** Body for {@code PATCH /api/v1/diagrams/{id}/revisions/{revId}}; length limits are enforced (422) by the service. */
public class RevisionNameRequest {

  private String name;
  private String description;

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }
}
