package com.archflux.repo;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.SyncLog;

public interface SyncLogRepository extends JpaRepository<SyncLog, Long> {

  Optional<SyncLog> findFirstByCommitShaOrderByCreatedAtAsc(String commitSha);
}
