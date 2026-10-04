package com.archflux.repo;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.archflux.domain.Diagram;

public interface DiagramRepository extends JpaRepository<Diagram, UUID> {

  Optional<Diagram> findByIdAndOwner_Id(UUID id, UUID ownerId);

  Page<Diagram> findByOwner_Id(UUID ownerId, Pageable pageable);

  long countByOwner_Id(UUID ownerId);

  /**
   * Title search with LIKE; the pattern must already have %, _, \ escaped by
   * the caller (see LikeEscape) and wrapped in %...%.
   */
  @Query("SELECT d FROM Diagram d WHERE d.owner.id = :ownerId "
      + "AND LOWER(d.title) LIKE LOWER(:pattern) ESCAPE '\\' ")
  Page<Diagram> searchByOwnerAndTitle(@Param("ownerId") UUID ownerId,
      @Param("pattern") String pattern, Pageable pageable);

  @Query("SELECT COUNT(d) FROM Diagram d WHERE d.owner.id = :ownerId "
      + "AND LOWER(d.title) LIKE LOWER(:pattern) ESCAPE '\\' ")
  long countSearchByOwnerAndTitle(@Param("ownerId") UUID ownerId,
      @Param("pattern") String pattern);
}
