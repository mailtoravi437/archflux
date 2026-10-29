package com.archflux.repo;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.AccessRequest;

public interface AccessRequestRepository extends JpaRepository<AccessRequest, UUID> {

  boolean existsByDiagramIdAndRequesterIdAndStatus(UUID diagramId, UUID requesterId, String status);

  List<AccessRequest> findByDiagramIdInAndStatusOrderByCreatedAtAsc(Collection<UUID> diagramIds,
      String status);
}
