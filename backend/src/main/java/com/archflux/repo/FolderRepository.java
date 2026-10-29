package com.archflux.repo;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.archflux.domain.Folder;

public interface FolderRepository extends JpaRepository<Folder, UUID> {

  List<Folder> findByWorkspaceIdAndDeletedAtIsNullOrderByNameAsc(UUID workspaceId);

  List<Folder> findByWorkspaceIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(UUID workspaceId);

  /** Live sibling with the same name (case-insensitive); parentId null = root. */
  @Query("SELECT COUNT(f) > 0 FROM Folder f WHERE f.workspaceId = :ws "
      + "AND ((:parentId IS NULL AND f.parentId IS NULL) OR f.parentId = :parentId) "
      + "AND LOWER(f.name) = LOWER(:name) AND f.deletedAt IS NULL "
      + "AND (:excludeId IS NULL OR f.id <> :excludeId)")
  boolean existsLiveSibling(@Param("ws") UUID workspaceId, @Param("parentId") UUID parentId,
      @Param("name") String name, @Param("excludeId") UUID excludeId);

  /** Ids of the folder and every descendant (any trash state). */
  @Query(value = "WITH RECURSIVE sub AS ("
      + " SELECT id FROM public.folders WHERE id = :id"
      + " UNION SELECT f.id FROM public.folders f JOIN sub ON f.parent_id = sub.id"
      + ") SELECT id FROM sub", nativeQuery = true)
  List<UUID> subtreeIds(@Param("id") UUID id);

  /** Height of the subtree rooted at the folder (1 = no children). */
  @Query(value = "WITH RECURSIVE sub AS ("
      + " SELECT id, 1 AS depth FROM public.folders WHERE id = :id"
      + " UNION ALL SELECT f.id, sub.depth + 1 FROM public.folders f"
      + " JOIN sub ON f.parent_id = sub.id WHERE f.deleted_at IS NULL AND sub.depth < 64"
      + ") SELECT MAX(depth) FROM sub", nativeQuery = true)
  Integer subtreeHeight(@Param("id") UUID id);

  @Modifying
  @Query("UPDATE Folder f SET f.deletedAt = :at WHERE f.id IN :ids AND f.deletedAt IS NULL")
  int trashAll(@Param("ids") List<UUID> ids, @Param("at") Instant at);

  @Modifying
  @Query("UPDATE Folder f SET f.deletedAt = NULL WHERE f.id IN :ids AND f.deletedAt = :at")
  int restoreBatch(@Param("ids") List<UUID> ids, @Param("at") Instant at);
}
