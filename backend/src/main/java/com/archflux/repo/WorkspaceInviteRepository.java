package com.archflux.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.WorkspaceInvite;

public interface WorkspaceInviteRepository extends JpaRepository<WorkspaceInvite, UUID> {

  Optional<WorkspaceInvite> findByTokenHash(String tokenHash);

  Optional<WorkspaceInvite> findByIdAndWorkspaceId(UUID id, UUID workspaceId);

  List<WorkspaceInvite> findByWorkspaceIdAndAcceptedAtIsNullAndRevokedAtIsNullOrderByCreatedAtDesc(
      UUID workspaceId);

  List<WorkspaceInvite> findByWorkspaceIdAndEmailIgnoreCaseAndAcceptedAtIsNullAndRevokedAtIsNull(
      UUID workspaceId, String email);
}
