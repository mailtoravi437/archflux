package com.archflux.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Append-oriented audit trail row: who did what to which resource, with what
 * outcome and correlation ID. Metadata is deliberately minimized (no secrets,
 * no diagram contents). Rows are written best-effort and never updated.
 */
@Entity
@Table(name = "audit_events")
public class AuditEvent {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "id", nullable = false, updatable = false)
  private Long id;

  @Column(name = "actor_id")
  private UUID actorId;

  @Column(name = "workspace_id")
  private UUID workspaceId;

  @Column(name = "action", nullable = false)
  private String action;

  @Column(name = "resource_type")
  private String resourceType;

  @Column(name = "resource_id")
  private String resourceId;

  @Column(name = "outcome", nullable = false)
  private String outcome = "ok";

  @Column(name = "correlation_id")
  private String correlationId;

  @org.hibernate.annotations.Type(OtherStringUserType.class)
  @Column(name = "metadata", columnDefinition = "jsonb")
  private String metadata = "{}";

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public AuditEvent() {
  }

  @PrePersist
  void prePersist() {
    if (createdAt == null) {
      createdAt = Instant.now();
    }
    if (outcome == null || outcome.isBlank()) {
      outcome = "ok";
    }
    if (metadata == null) {
      metadata = "{}";
    }
  }

  public Long getId() {
    return id;
  }

  public UUID getActorId() {
    return actorId;
  }

  public void setActorId(UUID actorId) {
    this.actorId = actorId;
  }

  public UUID getWorkspaceId() {
    return workspaceId;
  }

  public void setWorkspaceId(UUID workspaceId) {
    this.workspaceId = workspaceId;
  }

  public String getAction() {
    return action;
  }

  public void setAction(String action) {
    this.action = action;
  }

  public String getResourceType() {
    return resourceType;
  }

  public void setResourceType(String resourceType) {
    this.resourceType = resourceType;
  }

  public String getResourceId() {
    return resourceId;
  }

  public void setResourceId(String resourceId) {
    this.resourceId = resourceId;
  }

  public String getOutcome() {
    return outcome;
  }

  public void setOutcome(String outcome) {
    this.outcome = outcome;
  }

  public String getCorrelationId() {
    return correlationId;
  }

  public void setCorrelationId(String correlationId) {
    this.correlationId = correlationId;
  }

  public String getMetadata() {
    return metadata;
  }

  public void setMetadata(String metadata) {
    this.metadata = metadata;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
