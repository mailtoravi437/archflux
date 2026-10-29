package com.archflux.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Share link (R1-E07-T03, V11 {@code share_links}). Holds ONLY the SHA-256
 * hex hash of the token; the raw token is returned once at creation and is
 * never stored or logged. {@link #toString()} is deliberately not overridden
 * with field values.
 */
@Entity
@Table(name = "share_links")
public class ShareLink {

  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  @Column(name = "diagram_id", nullable = false, updatable = false)
  private UUID diagramId;

  @Column(name = "workspace_id", nullable = false, updatable = false)
  private UUID workspaceId;

  @Column(name = "token_hash", nullable = false, updatable = false)
  private String tokenHash;

  /** viewer | commenter (V11 CHECK: links never grant editing). */
  @Column(name = "role", nullable = false)
  private String role;

  /** workspace | anyone. */
  @Column(name = "audience", nullable = false)
  private String audience;

  @Column(name = "expires_at")
  private Instant expiresAt;

  @Column(name = "revoked_at")
  private Instant revokedAt;

  @Column(name = "created_by")
  private UUID createdBy;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public ShareLink() {
  }

  public ShareLink(UUID diagramId, UUID workspaceId, String tokenHash, String role,
      String audience, Instant expiresAt, UUID createdBy) {
    this.diagramId = diagramId;
    this.workspaceId = workspaceId;
    this.tokenHash = tokenHash;
    this.role = role;
    this.audience = audience;
    this.expiresAt = expiresAt;
    this.createdBy = createdBy;
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

  public UUID getId() {
    return id;
  }

  public UUID getDiagramId() {
    return diagramId;
  }

  public UUID getWorkspaceId() {
    return workspaceId;
  }

  public String getTokenHash() {
    return tokenHash;
  }

  public String getRole() {
    return role;
  }

  public String getAudience() {
    return audience;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public Instant getRevokedAt() {
    return revokedAt;
  }

  public void setRevokedAt(Instant revokedAt) {
    this.revokedAt = revokedAt;
  }

  public UUID getCreatedBy() {
    return createdBy;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
