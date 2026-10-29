package com.archflux.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** Pending or settled workspace invite (V12). Only the token's SHA-256 hex is stored. */
@Entity
@Table(name = "workspace_invites")
public class WorkspaceInvite {

  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  @Column(name = "workspace_id", nullable = false, updatable = false)
  private UUID workspaceId;

  @Column(name = "email", nullable = false)
  private String email;

  @Column(name = "role", nullable = false)
  private String role;

  @Column(name = "token_hash", nullable = false, updatable = false)
  private String tokenHash;

  @Column(name = "invited_by", updatable = false)
  private UUID invitedBy;

  @Column(name = "expires_at", nullable = false)
  private Instant expiresAt;

  @Column(name = "accepted_at")
  private Instant acceptedAt;

  @Column(name = "revoked_at")
  private Instant revokedAt;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public WorkspaceInvite() {
  }

  public WorkspaceInvite(UUID workspaceId, String email, String role, String tokenHash,
      UUID invitedBy, Instant expiresAt) {
    this.workspaceId = workspaceId;
    this.email = email;
    this.role = role;
    this.tokenHash = tokenHash;
    this.invitedBy = invitedBy;
    this.expiresAt = expiresAt;
  }

  @PrePersist
  void prePersist() {
    if (id == null) {
      id = UUID.randomUUID();
    }
    if (createdAt == null) {
      createdAt = Instant.now();
    }
  }

  public boolean isPending(Instant now) {
    return acceptedAt == null && revokedAt == null && expiresAt.isAfter(now);
  }

  public UUID getId() {
    return id;
  }

  public UUID getWorkspaceId() {
    return workspaceId;
  }

  public String getEmail() {
    return email;
  }

  public String getRole() {
    return role;
  }

  public String getTokenHash() {
    return tokenHash;
  }

  public UUID getInvitedBy() {
    return invitedBy;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public Instant getAcceptedAt() {
    return acceptedAt;
  }

  public void setAcceptedAt(Instant acceptedAt) {
    this.acceptedAt = acceptedAt;
  }

  public Instant getRevokedAt() {
    return revokedAt;
  }

  public void setRevokedAt(Instant revokedAt) {
    this.revokedAt = revokedAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
