package com.archflux.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Tenant boundary (PRODUCTIZATION_SPEC 5.4 / domain model 7). Every
 * tenant-owned record is scoped through a workspace plus an authorized
 * membership; PostgreSQL RLS is defense in depth.
 */
@Entity
@Table(name = "workspaces")
public class Workspace {

  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  @Column(name = "name", nullable = false)
  private String name = "";

  @Column(name = "plan", nullable = false)
  private String plan = "member";

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  public Workspace() {
  }

  public Workspace(String name) {
    this.name = name == null ? "" : name;
  }

  @PrePersist
  void prePersist() {
    if (id == null) {
      id = UUID.randomUUID();
    }
    if (createdAt == null) {
      createdAt = Instant.now();
    }
    if (name == null) {
      name = "";
    }
    if (plan == null || plan.isBlank()) {
      plan = "member";
    }
  }

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getPlan() {
    return plan;
  }

  public void setPlan(String plan) {
    this.plan = plan;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
