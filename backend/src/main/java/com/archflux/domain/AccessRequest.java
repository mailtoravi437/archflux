package com.archflux.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** Request for diagram access (R1-E07-T04, V11 {@code access_requests}). */
@Entity
@Table(name = "access_requests")
public class AccessRequest {

  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  @Column(name = "diagram_id", nullable = false, updatable = false)
  private UUID diagramId;

  @Column(name = "requester_id", nullable = false, updatable = false)
  private UUID requesterId;

  /** editor | commenter | viewer. */
  @Column(name = "role", nullable = false)
  private String role;

  @Column(name = "note")
  private String note;

  /** pending | approved | denied. */
  @Column(name = "status", nullable = false)
  private String status = "pending";

  @Column(name = "decided_by")
  private UUID decidedBy;

  @Column(name = "decided_at")
  private Instant decidedAt;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public AccessRequest() {
  }

  public AccessRequest(UUID diagramId, UUID requesterId, String role, String note) {
    this.diagramId = diagramId;
    this.requesterId = requesterId;
    this.role = role;
    this.note = note;
  }

  @PrePersist
  void prePersist() {
    if (id == null) {
      id = UUID.randomUUID();
    }
    if (createdAt == null) {
      createdAt = Instant.now();
    }
    if (status == null) {
      status = "pending";
    }
  }

  public UUID getId() {
    return id;
  }

  public UUID getDiagramId() {
    return diagramId;
  }

  public UUID getRequesterId() {
    return requesterId;
  }

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public String getNote() {
    return note;
  }

  public String getStatus() {
    return status;
  }

  public UUID getDecidedBy() {
    return decidedBy;
  }

  public Instant getDecidedAt() {
    return decidedAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public void decide(String status, UUID decidedBy, Instant at) {
    this.status = status;
    this.decidedBy = decidedBy;
    this.decidedAt = at;
  }
}
