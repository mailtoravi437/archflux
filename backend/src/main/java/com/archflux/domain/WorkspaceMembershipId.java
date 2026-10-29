package com.archflux.domain;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * Composite key for {@link WorkspaceMembership}: (workspace_id, user_id).
 * Kept as a plain UUID pair; the entity binds the managed associations via
 * {@code @MapsId}.
 */
@Embeddable
public class WorkspaceMembershipId implements Serializable {

  @Column(name = "workspace_id")
  private UUID workspaceId;

  @Column(name = "user_id")
  private UUID userId;

  public WorkspaceMembershipId() {
  }

  public WorkspaceMembershipId(UUID workspaceId, UUID userId) {
    this.workspaceId = workspaceId;
    this.userId = userId;
  }

  public UUID getWorkspaceId() {
    return workspaceId;
  }

  public void setWorkspaceId(UUID workspaceId) {
    this.workspaceId = workspaceId;
  }

  public UUID getUserId() {
    return userId;
  }

  public void setUserId(UUID userId) {
    this.userId = userId;
  }

  @Override
  public boolean equals(Object other) {
    if (this == other) {
      return true;
    }
    if (!(other instanceof WorkspaceMembershipId that)) {
      return false;
    }
    return Objects.equals(workspaceId, that.workspaceId)
        && Objects.equals(userId, that.userId);
  }

  @Override
  public int hashCode() {
    return Objects.hash(workspaceId, userId);
  }
}
