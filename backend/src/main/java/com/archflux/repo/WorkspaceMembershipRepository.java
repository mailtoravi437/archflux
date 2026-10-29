package com.archflux.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.domain.WorkspaceMembershipId;

public interface WorkspaceMembershipRepository
    extends JpaRepository<WorkspaceMembership, WorkspaceMembershipId> {

  List<WorkspaceMembership> findById_UserId(UUID userId);

  Optional<WorkspaceMembership> findById_WorkspaceIdAndId_UserId(UUID workspaceId, UUID userId);

  boolean existsById_WorkspaceIdAndId_UserId(UUID workspaceId, UUID userId);

  @Query("SELECT m FROM WorkspaceMembership m JOIN FETCH m.user WHERE m.id.workspaceId = :ws "
      + "ORDER BY m.createdAt ASC")
  List<WorkspaceMembership> findRoster(@Param("ws") UUID workspaceId);

  @Query("SELECT COUNT(m) FROM WorkspaceMembership m WHERE m.id.workspaceId = :ws "
      + "AND m.role = 'admin' AND m.status = 'active'")
  long countActiveAdmins(@Param("ws") UUID workspaceId);
}
