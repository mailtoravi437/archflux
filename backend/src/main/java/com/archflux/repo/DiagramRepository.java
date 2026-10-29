package com.archflux.repo;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.archflux.domain.Diagram;

public interface DiagramRepository extends JpaRepository<Diagram, UUID> {

  Optional<Diagram> findByIdAndOwner_Id(UUID id, UUID ownerId);

  Page<Diagram> findByOwner_Id(UUID ownerId, Pageable pageable);

  long countByOwner_Id(UUID ownerId);

  /**
   * Title search with LIKE; the pattern must already have %, _, \ escaped by
   * the caller (see LikeEscape) and wrapped in %...%.
   */
  @Query("SELECT d FROM Diagram d WHERE d.owner.id = :ownerId "
      + "AND LOWER(d.title) LIKE LOWER(:pattern) ESCAPE '\\' ")
  Page<Diagram> searchByOwnerAndTitle(@Param("ownerId") UUID ownerId,
      @Param("pattern") String pattern, Pageable pageable);

  @Query("SELECT COUNT(d) FROM Diagram d WHERE d.owner.id = :ownerId "
      + "AND LOWER(d.title) LIKE LOWER(:pattern) ESCAPE '\\' ")
  long countSearchByOwnerAndTitle(@Param("ownerId") UUID ownerId,
      @Param("pattern") String pattern);

  /**
   * Workspace-scoped feed (Phase 1 isolation): diagrams in any of the given
   * workspaces. Owner-scoped finders above are retained for compatibility.
   */
  Page<Diagram> findByWorkspace_IdIn(Collection<UUID> workspaceIds, Pageable pageable);

  long countByWorkspace_IdIn(Collection<UUID> workspaceIds);

  @Query("SELECT d FROM Diagram d WHERE d.workspace.id IN :workspaceIds "
      + "AND LOWER(d.title) LIKE LOWER(:pattern) ESCAPE '\\' ")
  Page<Diagram> searchByWorkspacesAndTitle(@Param("workspaceIds") Collection<UUID> workspaceIds,
      @Param("pattern") String pattern, Pageable pageable);

  @Query("SELECT COUNT(d) FROM Diagram d WHERE d.workspace.id IN :workspaceIds "
      + "AND LOWER(d.title) LIKE LOWER(:pattern) ESCAPE '\\' ")
  long countSearchByWorkspacesAndTitle(@Param("workspaceIds") Collection<UUID> workspaceIds,
      @Param("pattern") String pattern);

  /** Moves the live diagrams in the given folders to the trash with one shared timestamp. */
  @Modifying
  @Query("UPDATE Diagram d SET d.deletedAt = :at WHERE d.workspace.id = :ws "
      + "AND d.folderId IN :folderIds AND d.deletedAt IS NULL")
  int trashInFolders(@Param("ws") UUID workspaceId, @Param("folderIds") List<UUID> folderIds,
      @Param("at") Instant at);

  /** Restores only the diagrams trashed in the same batch (same timestamp). */
  @Modifying
  @Query("UPDATE Diagram d SET d.deletedAt = NULL WHERE d.workspace.id = :ws "
      + "AND d.folderId IN :folderIds AND d.deletedAt = :at")
  int restoreInFolders(@Param("ws") UUID workspaceId, @Param("folderIds") List<UUID> folderIds,
      @Param("at") Instant at);
}
