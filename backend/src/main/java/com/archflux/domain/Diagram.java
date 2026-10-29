package com.archflux.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.type.SqlTypes;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "diagrams")
public class Diagram {

  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "owner_id", nullable = false)
  @OnDelete(action = OnDeleteAction.CASCADE)
  private User owner;

  // Owning workspace (NOT NULL since V6). Assigned explicitly by
  // WorkspaceService on the service path; rows persisted without one are
  // backstopped by DiagramWorkspaceIntegrator (personal workspace).
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "workspace_id", nullable = false)
  private Workspace workspace;

  @Column(name = "title", nullable = false)
  private String title = "";

  // text[] mapped with Hibernate's native ARRAY support (binds via
  // Connection.createArrayOf, i.e. java.sql.Array). Note: a JPA
  // AttributeConverter cannot back a plural JDBC type in Hibernate 6
  // (bootstrap ClassCastException), so no converter is used here.
  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(name = "tags", nullable = false, columnDefinition = "text[]")
  private List<String> tags = List.of();

  // jsonb stored as String; (de)serialization handled with Jackson in the
  // service/mapper layer. JsonbStringUserType declares Types.OTHER so
  // ddl-auto: validate matches the jsonb column.
  @org.hibernate.annotations.Type(OtherStringUserType.class)
  @Column(name = "graph", nullable = false, columnDefinition = "jsonb")
  private String graph = "{}";

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "parent_diagram_id")
  @OnDelete(action = OnDeleteAction.SET_NULL)
  private Diagram parentDiagram;

  @Column(name = "branch_name", nullable = false)
  private String branchName = "main";

  // Optimistic concurrency counter (NOT NULL since V7). Services bump it
  // explicitly per mutation; stale writes resolve to 409 — never silent
  // overwrite (PRODUCTIZATION_SPEC §6.2).
  @Column(name = "version", nullable = false)
  private Long version = 1L;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  // Kept in sync by the DB trigger trg_diagrams_updated_at on UPDATE.
  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  // Containing library folder (V10); null = root. SET NULL on folder purge.
  @Column(name = "folder_id")
  private UUID folderId;

  public Diagram() {
  }

  @PrePersist
  void prePersist() {
    if (id == null) {
      id = UUID.randomUUID();
    }
    Instant now = Instant.now();
    if (createdAt == null) {
      createdAt = now;
    }
    if (updatedAt == null) {
      updatedAt = now;
    }
    if (tags == null) {
      tags = List.of();
    }
    if (graph == null) {
      graph = "{}";
    }
    if (branchName == null || branchName.isBlank()) {
      branchName = "main";
    }
    if (version == null) {
      version = 1L;
    }
  }

  @PreUpdate
  void preUpdate() {
    if (updatedAt == null) {
      updatedAt = Instant.now();
    }
  }

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public User getOwner() {
    return owner;
  }

  public void setOwner(User owner) {
    this.owner = owner;
  }

  public Workspace getWorkspace() {
    return workspace;
  }

  public void setWorkspace(Workspace workspace) {
    this.workspace = workspace;
  }

  // Non-bean name on purpose (same reason as ownerId()): avoids shadowing
  // the workspace.id traversal in Spring Data derived queries. Returns null
  // when the association is unavailable instead of throwing.
  public UUID workspaceId() {
    try {
      if (workspace == null) return null;
      return workspace.getId();
    } catch (Exception e) {
      return null;
    }
  }  // Non-bean name on purpose: a getOwnerId() getter would shadow the
  // owner.id traversal in Spring Data derived queries.
  public UUID ownerId() {
    return owner == null ? null : owner.getId();
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public List<String> getTags() {
    return tags;
  }

  public void setTags(List<String> tags) {
    this.tags = tags == null ? List.of() : List.copyOf(tags);
  }

  public String getGraph() {
    return graph;
  }

  public void setGraph(String graph) {
    this.graph = graph;
  }

  public Diagram getParentDiagram() {
    return parentDiagram;
  }

  public void setParentDiagram(Diagram parentDiagram) {
    this.parentDiagram = parentDiagram;
  }

  public UUID parentDiagramId() {
    try {
      if (parentDiagram == null) return null;
      return parentDiagram.getId();
    } catch (Exception e) {
      return null;
    }
  }

  public String getBranchName() {
    return branchName;
  }

  public void setBranchName(String branchName) {
    this.branchName = (branchName == null || branchName.isBlank()) ? "main" : branchName;
  }

  public Long getVersion() {
    return version;
  }

  public void setVersion(Long version) {
    this.version = version;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(Instant updatedAt) {
    this.updatedAt = updatedAt;
  }

  public Instant getDeletedAt() {
    return deletedAt;
  }

  public void setDeletedAt(Instant deletedAt) {
    this.deletedAt = deletedAt;
  }

  public UUID getFolderId() {
    return folderId;
  }

  public void setFolderId(UUID folderId) {
    this.folderId = folderId;
  }
}
