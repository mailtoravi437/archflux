package com.archflux.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.domain.WorkspaceMembershipId;

public interface WorkspaceMembershipRepository
    extends JpaRepository<WorkspaceMembership, WorkspaceMembershipId> {

  List<WorkspaceMembership> findById_UserId(UUID userId);

  Optional<WorkspaceMembership> findById_WorkspaceIdAndId_UserId(UUID workspaceId, UUID userId);

  boolean existsById_WorkspaceIdAndId_UserId(UUID workspaceId, UUID userId);
}
