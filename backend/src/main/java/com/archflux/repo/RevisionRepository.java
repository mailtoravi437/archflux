package com.archflux.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.DiagramRevision;

public interface RevisionRepository extends JpaRepository<DiagramRevision, UUID> {

  List<DiagramRevision> findByDiagram_IdOrderByCreatedAtDesc(UUID diagramId);

  List<DiagramRevision> findByDiagram_IdAndNameIsNotNullOrderByCreatedAtDesc(UUID diagramId);

  Optional<DiagramRevision> findFirstByDiagram_IdOrderByCreatedAtDesc(UUID diagramId);

  long countByDiagram_Id(UUID diagramId);
}
