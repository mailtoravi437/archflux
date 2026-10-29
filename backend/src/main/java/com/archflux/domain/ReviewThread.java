package com.archflux.domain;

import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** A review thread on a diagram. Named ReviewThread to avoid java.lang.Thread. */
@Entity
@Table(name = "threads")
public class ReviewThread {

  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "diagram_id", nullable = false)
  @OnDelete(action = OnDeleteAction.CASCADE)
  private Diagram diagram;

  @Column(name = "author", nullable = false)
  private String author = "";

  @Column(name = "pinned_to")
  private String pinnedTo;

  @Column(name = "text", nullable = false)
  private String text = "";

  @Column(name = "resolved", nullable = false)
  private boolean resolved;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public ReviewThread() {
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

  public void setId(UUID id) {
    this.id = id;
  }

  public Diagram getDiagram() {
    return diagram;
  }

  public void setDiagram(Diagram diagram) {
    this.diagram = diagram;
  }

  public String getAuthor() {
    return author;
  }

  public void setAuthor(String author) {
    this.author = author;
  }

  public String getPinnedTo() {
    return pinnedTo;
  }

  public void setPinnedTo(String pinnedTo) {
    this.pinnedTo = pinnedTo;
  }

  public String getText() {
    return text;
  }

  public void setText(String text) {
    this.text = text;
  }

  public boolean isResolved() {
    return resolved;
  }

  public void setResolved(boolean resolved) {
    this.resolved = resolved;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
