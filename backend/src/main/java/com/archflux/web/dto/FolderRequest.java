package com.archflux.web.dto;

import java.util.UUID;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body for {@code POST /api/v1/folders} and {@code PATCH /api/v1/folders/{id}}.
 * {@code name} is required on create (validation group {@link OnCreate});
 * on PATCH each field is optional and {@link #isParentIdPresent()}
 * distinguishes "move to root" ({@code "parentId": null}) from "no move".
 */
public class FolderRequest {

  /** Validation group for create-only constraints. */
  public interface OnCreate {
  }

  @NotBlank(groups = OnCreate.class, message = "name is required")
  @Size(max = 120, message = "name must be at most 120 characters")
  private String name;

  private UUID parentId;
  private boolean parentIdPresent;

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public UUID getParentId() {
    return parentId;
  }

  public void setParentId(UUID parentId) {
    this.parentId = parentId;
    this.parentIdPresent = true;
  }

  public boolean isParentIdPresent() {
    return parentIdPresent;
  }
}
