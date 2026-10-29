package com.archflux.domain;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** Explicit per-diagram role (R1-E07, V11 {@code diagram_members}). */
@Entity
@Table(name = "diagram_members")
public class DiagramMember {

  @EmbeddedId
  private Key id;

  /** owner | editor | commenter | viewer (V11 CHECK). */
  @Column(name = "role", nullable = false)
  private String role;

  @Column(name = "added_by")
  private UUID addedBy;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public DiagramMember() {
  }

  public DiagramMember(UUID diagramId, UUID userId, String role, UUID addedBy) {
    this.id = new Key(diagramId, userId);
    this.role = role;
    this.addedBy = addedBy;
  }

  @PrePersist
  void prePersist() {
    if (createdAt == null) {
      createdAt = Instant.now();
    }
  }

  public Key getId() {
    return id;
  }

  public UUID diagramId() {
    return id == null ? null : id.getDiagramId();
  }

  public UUID userId() {
    return id == null ? null : id.getUserId();
  }

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public UUID getAddedBy() {
    return addedBy;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  /** Composite primary key (diagram_id, user_id). */
  @Embeddable
  public static class Key implements Serializable {

    @Column(name = "diagram_id", nullable = false)
    private UUID diagramId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    public Key() {
    }

    public Key(UUID diagramId, UUID userId) {
      this.diagramId = diagramId;
      this.userId = userId;
    }

    public UUID getDiagramId() {
      return diagramId;
    }

    public UUID getUserId() {
      return userId;
    }

    @Override
    public boolean equals(Object other) {
      return other instanceof Key key && Objects.equals(diagramId, key.diagramId)
          && Objects.equals(userId, key.userId);
    }

    @Override
    public int hashCode() {
      return Objects.hash(diagramId, userId);
    }
  }
}
