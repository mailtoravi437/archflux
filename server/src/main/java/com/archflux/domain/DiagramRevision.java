package com.archflux.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

/**
 * Immutable diagram snapshot. One row per diagram mutation (create / update /
 * restore / branch); the parent chain gives full lineage. Rows are never
 * updated or deleted through the application (RLS denies both for the app
 * role); deletion cascades from the owning diagram.
 */
@Entity
@Table(name = "diagram_revisions")
public class DiagramRevision {

  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "diagram_id", nullable = false)
  @OnDelete(action = OnDeleteAction.CASCADE)
  private Diagram diagram;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "parent_revision_id")
  @OnDelete(action = OnDeleteAction.SET_NULL)
  private DiagramRevision parentRevision;

  @Column(name = "content_hash", nullable = false)
  private String contentHash = "";

  @org.hibernate.annotations.Type(OtherStringUserType.class)
  @Column(name = "snapshot", nullable = false, columnDefinition = "jsonb")
  private String snapshot = "{}";

  @Column(name = "author_id")
  private UUID authorId;

  @Column(name = "source", nullable = false)
  private String source = "manual";

  @Column(name = "message")
  private String message;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public DiagramRevision() {
  }

  @PrePersist
  void prePersist() {
    if (id == null) {
      id = UUID.randomUUID();
    }
    if (createdAt == null) {
      createdAt = Instant.now();
    }
    if (snapshot == null) {
      snapshot = "{}";
    }
    if (source == null || source.isBlank()) {
      source = "manual";
    }
  }

  public UUID getId() {
    return id;
  }

  public Diagram getDiagram() {
    return diagram;
  }

  public void setDiagram(Diagram diagram) {
    this.diagram = diagram;
  }

  public DiagramRevision getParentRevision() {
    return parentRevision;
  }

  public void setParentRevision(DiagramRevision parentRevision) {
    this.parentRevision = parentRevision;
  }

  public UUID parentRevisionId() {
    try {
      if (parentRevision == null) {
        return null;
      }
      return parentRevision.getId();
    } catch (Exception e) {
      return null;
    }
  }

  public String getContentHash() {
    return contentHash;
  }

  public void setContentHash(String contentHash) {
    this.contentHash = contentHash;
  }

  public String getSnapshot() {
    return snapshot;
  }

  public void setSnapshot(String snapshot) {
    this.snapshot = snapshot;
  }

  public UUID getAuthorId() {
    return authorId;
  }

  public void setAuthorId(UUID authorId) {
    this.authorId = authorId;
  }

  public String getSource() {
    return source;
  }

  public void setSource(String source) {
    this.source = source;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
