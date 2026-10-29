package com.archflux.repo;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.archflux.domain.DiagramStar;

public interface DiagramStarRepository extends JpaRepository<DiagramStar, DiagramStar.Key> {

  /** Which of the given diagrams the user has starred. */
  @Query("SELECT s.id.diagramId FROM DiagramStar s WHERE s.id.userId = :userId "
      + "AND s.id.diagramId IN :diagramIds")
  List<UUID> starredAmong(@Param("userId") UUID userId,
      @Param("diagramIds") Collection<UUID> diagramIds);
}
