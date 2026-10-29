package com.archflux.service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.IdempotencyKey;
import com.archflux.repo.IdempotencyKeyRepository;

/**
 * Durable idempotency store (Phase 2, PRODUCTIZATION_SPEC §6.2). Replaces the
 * previous in-memory map: keys persist in PostgreSQL with a 24h TTL and are
 * scoped to the requesting user (or null for unauthenticated callers).
 */
@Service
public class IdempotencyService {

  static final long TTL_SECONDS = 24 * 60 * 60;

  private final IdempotencyKeyRepository keys;

  public IdempotencyService(IdempotencyKeyRepository keys) {
    this.keys = keys;
  }

  public record Stored(int status, byte[] body) {
  }

  /** Returns the stored response when the key is a live hit for this user. */
  @Transactional
  public Optional<Stored> replay(UUID key, UUID userId) {
    Optional<IdempotencyKey> row = keys.findById(key);
    if (row.isEmpty()) {
      return Optional.empty();
    }
    IdempotencyKey record = row.get();
    if (!java.util.Objects.equals(record.getUserId(), userId)) {
      return Optional.empty();
    }
    if (record.isExpired()) {
      keys.delete(record);
      return Optional.empty();
    }
    byte[] body = record.getResponseBody() == null ? new byte[0]
        : record.getResponseBody().getBytes(StandardCharsets.UTF_8);
    return Optional.of(new Stored(record.getStatusCode(), body));
  }

  /** Stores the first response (upsert — a concurrent duplicate keeps first). */
  @Transactional
  public void store(UUID key, UUID userId, int status, byte[] body) {
    try {
      IdempotencyKey record = keys.findById(key).orElseGet(IdempotencyKey::new);
      if (record.getKey() == null) {
        record.setKey(key);
        record.setUserId(userId);
        record.setExpiresAt(Instant.now().plusSeconds(TTL_SECONDS));
      }
      record.setStatusCode(status);
      record.setResponseBody(
          body == null ? "" : new String(body, StandardCharsets.UTF_8));
      keys.save(record);
    } catch (Exception e) {
      org.slf4j.LoggerFactory.getLogger(IdempotencyService.class)
          .warn("Idempotency store failed for key {}: {}", key, e.getMessage());
    }
  }

  /** Hourly purge of expired rows (scheduled via AsyncConfig). */
  @Transactional
  public long purgeExpired() {
    try {
      return keys.deleteByExpiresAtBefore(Instant.now());
    } catch (Exception e) {
      org.slf4j.LoggerFactory.getLogger(IdempotencyService.class)
          .warn("Idempotency purge failed: {}", e.getMessage());
      return 0;
    }
  }

  @org.springframework.scheduling.annotation.Scheduled(fixedRate = 60 * 60 * 1000)
  public void scheduledPurge() {
    purgeExpired();
  }
}
