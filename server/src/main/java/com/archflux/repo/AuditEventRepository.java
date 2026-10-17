package com.archflux.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.AuditEvent;

public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {

  List<AuditEvent> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId, Pageable pageable);

  List<AuditEvent> findByWorkspaceIdAndActionOrderByCreatedAtDesc(UUID workspaceId,
      String action, Pageable pageable);

  List<AuditEvent> findByActionOrderByCreatedAtDesc(String action, Pageable pageable);
}
