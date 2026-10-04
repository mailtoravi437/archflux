package com.archflux.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.ReviewThread;

public interface ThreadRepository extends JpaRepository<ReviewThread, UUID> {

  List<ReviewThread> findByDiagram_IdOrderByCreatedAtAsc(UUID diagramId);

  Optional<ReviewThread> findByIdAndDiagram_Id(UUID id, UUID diagramId);
}
