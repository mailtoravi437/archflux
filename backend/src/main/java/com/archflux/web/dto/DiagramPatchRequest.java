package com.archflux.web.dto;

import java.util.UUID;

/**
 * Body for {@code PATCH /api/v1/diagrams/{id}}: {@code {"folderId": uuid|null}}
 * (null = move to the library root). {@link #isFolderIdPresent()} tells an
 * explicit null apart from a missing field.
 */
public class DiagramPatchRequest {

  private UUID folderId;
  private boolean folderIdPresent;

  public UUID getFolderId() {
    return folderId;
  }

  public void setFolderId(UUID folderId) {
    this.folderId = folderId;
    this.folderIdPresent = true;
  }

  public boolean isFolderIdPresent() {
    return folderIdPresent;
  }
}
