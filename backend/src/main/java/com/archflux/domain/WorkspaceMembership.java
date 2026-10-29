package com.archflux.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * Workspace roster row: which users belong to a workspace, with role
 * ({@code admin|editor|reviewer|viewer}, enforced by V6 CHECK
 * {@code chk_memberships_role}) and status. Both foreign keys cascade, so
 * deleting a workspace or user removes its roster rows.
 */
@Entity
@Table(name = "workspace_memberships")
public class WorkspaceMembership {

  @EmbeddedId
  private WorkspaceMembershipId id = new WorkspaceMembershipId();

  @MapsId("workspaceId")
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "workspace_id", nullable = false)
  private Workspace workspace;

  @MapsId("userId")
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  @Column(name = "role", nullable = false)
  private String role = "member";

  @Column(name = "status", nullable = false)
  private String status = "active";

  @Column(name = "invited_by")
  private UUID invitedBy;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  public WorkspaceMembership() {
  }

  public WorkspaceMembership(Workspace workspace, User user, String role, String status) {
    this.workspace = workspace;
    this.user = user;
    this.role = role;
    this.status = status;
    this.id = new WorkspaceMembershipId(
        workspace == null ? null : workspace.getId(),
        user == null ? null : user.getId());
  }

  @PrePersist
  void prePersist() {
    Instant now = Instant.now();
    if (createdAt == null) {
      createdAt = now;
    }
    if (updatedAt == null) {
      updatedAt = now;
    }
    if (role == null || role.isBlank()) {
      role = "member";
    }
    if (status == null || status.isBlank()) {
      status = "active";
    }
    syncId();
  }

  @PreUpdate
  void preUpdate() {
    updatedAt = Instant.now();
    syncId();
  }

  private void syncId() {
    if (id == null) {
      id = new WorkspaceMembershipId();
    }
    if (id.getWorkspaceId() == null && workspace != null) {
      id.setWorkspaceId(workspace.getId());
    }
    if (id.getUserId() == null && user != null) {
      id.setUserId(user.getId());
    }
  }

  public WorkspaceMembershipId getId() {
    return id;
  }

  public Workspace getWorkspace() {
    return workspace;
  }

  public void setWorkspace(Workspace workspace) {
    this.workspace = workspace;
  }

  public User getUser() {
    return user;
  }

  public void setUser(User user) {
    this.user = user;
  }

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public UUID getInvitedBy() {
    return invitedBy;
  }

  public void setInvitedBy(UUID invitedBy) {
    this.invitedBy = invitedBy;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
