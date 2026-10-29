package com.archflux.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.ShareLink;

public interface ShareLinkRepository extends JpaRepository<ShareLink, UUID> {

  List<ShareLink> findByDiagramIdOrderByCreatedAtDesc(UUID diagramId);

  Optional<ShareLink> findByIdAndDiagramId(UUID id, UUID diagramId);
}
