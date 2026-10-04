package com.archflux.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.Checkpoint;

public interface CheckpointRepository extends JpaRepository<Checkpoint, UUID> {

  List<Checkpoint> findByDiagram_IdOrderByCreatedAtDesc(UUID diagramId);
}
