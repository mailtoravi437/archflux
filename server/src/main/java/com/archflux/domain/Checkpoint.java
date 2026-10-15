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

@Entity
@Table(name = "checkpoints")
public class Checkpoint {

  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "diagram_id", nullable = false)
  @OnDelete(action = OnDeleteAction.CASCADE)
  private Diagram diagram;

  @Column(name = "title", nullable = false)
  private String title = "";

  @Column(name = "meta")
  private String meta;

  @Column(name = "branch", nullable = false)
  private String branch = "main";

  @org.hibernate.annotations.Type(OtherStringUserType.class)
  @Column(name = "snapshot", nullable = false, columnDefinition = "jsonb")
  private String snapshot = "{}";

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public Checkpoint() {
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
    if (branch == null || branch.isBlank()) {
      branch = "main";
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

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getMeta() {
    return meta;
  }

  public void setMeta(String meta) {
    this.meta = meta;
  }

  public String getBranch() {
    return branch;
  }

  public void setBranch(String branch) {
    this.branch = (branch == null || branch.isBlank()) ? "main" : branch;
  }

  public String getSnapshot() {
    return snapshot;
  }

  public void setSnapshot(String snapshot) {
    this.snapshot = snapshot;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
