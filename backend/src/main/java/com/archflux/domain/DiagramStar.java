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

/** Per-user starred diagram (R1-E06-T02, V10 {@code diagram_stars}). */
@Entity
@Table(name = "diagram_stars")
public class DiagramStar {

  @EmbeddedId
  private Key id;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public DiagramStar() {
  }

  public DiagramStar(UUID userId, UUID diagramId) {
    this.id = new Key(userId, diagramId);
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

  public Instant getCreatedAt() {
    return createdAt;
  }

  /** Composite primary key (user_id, diagram_id). */
  @Embeddable
  public static class Key implements Serializable {

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "diagram_id", nullable = false)
    private UUID diagramId;

    public Key() {
    }

    public Key(UUID userId, UUID diagramId) {
      this.userId = userId;
      this.diagramId = diagramId;
    }

    public UUID getUserId() {
      return userId;
    }

    public UUID getDiagramId() {
      return diagramId;
    }

    @Override
    public boolean equals(Object other) {
      return other instanceof Key key && Objects.equals(userId, key.userId)
          && Objects.equals(diagramId, key.diagramId);
    }

    @Override
    public int hashCode() {
      return Objects.hash(userId, diagramId);
    }
  }
}
