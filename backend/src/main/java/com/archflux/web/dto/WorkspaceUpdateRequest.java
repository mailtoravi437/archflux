package com.archflux.web.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Body for {@code PATCH /api/v1/workspaces/current}. Absent fields are left unchanged. */
public class WorkspaceUpdateRequest {

  @Size(min = 1, max = 120, message = "name must be 1 to 120 characters")
  private String name;

  @Pattern(regexp = "^[a-z0-9-]{3,40}$", message = "slug must match ^[a-z0-9-]{3,40}$")
  private String slug;

  @Pattern(regexp = "^(invite|request|auto)$", message = "joinPolicy must be invite, request or auto")
  private String joinPolicy;

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getSlug() {
    return slug;
  }

  public void setSlug(String slug) {
    this.slug = slug;
  }

  public String getJoinPolicy() {
    return joinPolicy;
  }

  public void setJoinPolicy(String joinPolicy) {
    this.joinPolicy = joinPolicy;
  }
}
