package com.archflux.repo;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.archflux.domain.IdempotencyKey;

public interface IdempotencyKeyRepository extends JpaRepository<IdempotencyKey, UUID> {

  long deleteByExpiresAtBefore(Instant cutoff);
}
