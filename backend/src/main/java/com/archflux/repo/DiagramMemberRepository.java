package com.archflux.repo;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.archflux.domain.DiagramMember;

public interface DiagramMemberRepository extends JpaRepository<DiagramMember, DiagramMember.Key> {

  @Query("SELECT m FROM DiagramMember m WHERE m.id.diagramId = :diagramId ORDER BY m.createdAt ASC")
  List<DiagramMember> findByDiagram(@Param("diagramId") UUID diagramId);

  @Query("SELECT m FROM DiagramMember m WHERE m.id.userId = :userId AND m.id.diagramId IN :diagramIds")
  List<DiagramMember> findForUserAmong(@Param("userId") UUID userId,
      @Param("diagramIds") Collection<UUID> diagramIds);

  @Query("SELECT COUNT(m) FROM DiagramMember m WHERE m.id.diagramId = :diagramId AND m.role = 'owner'")
  long countOwners(@Param("diagramId") UUID diagramId);

  @Query("SELECT m.id.userId FROM DiagramMember m WHERE m.id.diagramId = :diagramId AND m.role = 'owner'")
  List<UUID> ownerIds(@Param("diagramId") UUID diagramId);
}
