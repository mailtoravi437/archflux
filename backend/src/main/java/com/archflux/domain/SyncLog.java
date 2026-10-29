package com.archflux.domain;

import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.type.SqlTypes;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * A staged sync commit. {@code diagram_id} is NOT NULL in V1 (fixed schema),
 * so diagram-less syncs are answered statelessly without persisting a row.
 */
@Entity
@Table(name = "sync_log")
public class SyncLog {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "id", nullable = false, updatable = false)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "diagram_id", nullable = false)
  @OnDelete(action = OnDeleteAction.CASCADE)
  private Diagram diagram;

  @Column(name = "actor", nullable = false)
  private String actor = "";

  @Column(name = "commit_sha")
  private String commitSha;

  @Column(name = "delta")
  private String delta;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public SyncLog() {
  }

  @PrePersist
  void prePersist() {
    if (createdAt == null) {
      createdAt = Instant.now();
    }
  }

  public Long getId() {
    return id;
  }

  public Diagram getDiagram() {
    return diagram;
  }

  public void setDiagram(Diagram diagram) {
    this.diagram = diagram;
  }

  public String getActor() {
    return actor;
  }

  public void setActor(String actor) {
    this.actor = actor;
  }

  public String getCommitSha() {
    return commitSha;
  }

  public void setCommitSha(String commitSha) {
    this.commitSha = commitSha;
  }

  public String getDelta() {
    return delta;
  }

  public void setDelta(String delta) {
    this.delta = delta;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
