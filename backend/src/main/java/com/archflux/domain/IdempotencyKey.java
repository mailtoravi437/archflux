package com.archflux.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Durable idempotency record for externally retried mutations. The client
 * supplies the key (UUID {@code Idempotency-Key} header); the first response
 * is stored and replayed verbatim for 24h. Rows past {@code expires_at} are
 * purged by a scheduled job.
 */
@Entity
@Table(name = "idempotency_keys")
public class IdempotencyKey {

  @Id
  @Column(name = "key", nullable = false, updatable = false)
  private UUID key;

  @Column(name = "user_id")
  private UUID userId;

  @Column(name = "status_code", nullable = false)
  private int statusCode;

  @Column(name = "response_body")
  private String responseBody = "";

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "expires_at", nullable = false)
  private Instant expiresAt;

  public IdempotencyKey() {
  }

  @PrePersist
  void prePersist() {
    if (createdAt == null) {
      createdAt = Instant.now();
    }
    if (responseBody == null) {
      responseBody = "";
    }
  }

  public UUID getKey() {
    return key;
  }

  public void setKey(UUID key) {
    this.key = key;
  }

  public UUID getUserId() {
    return userId;
  }

  public void setUserId(UUID userId) {
    this.userId = userId;
  }

  public int getStatusCode() {
    return statusCode;
  }

  public void setStatusCode(int statusCode) {
    this.statusCode = statusCode;
  }

  public String getResponseBody() {
    return responseBody;
  }

  public void setResponseBody(String responseBody) {
    this.responseBody = responseBody;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public void setExpiresAt(Instant expiresAt) {
    this.expiresAt = expiresAt;
  }

  public boolean isExpired() {
    return expiresAt != null && Instant.now().isAfter(expiresAt);
  }
}
