package com.archflux.domain;

import java.time.Instant;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Durable webhook inbox row. Persisted before acknowledging the delivery;
 * deduplicated by the unique {@code delivery_id}. The raw {@code payload} is
 * retained (V8) so failed events can be replayed after the request body is
 * gone. Lifecycle: received → processing → processed / failed.
 */
@Entity
@Table(name = "webhook_events")
public class WebhookEvent {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "id", nullable = false, updatable = false)
  private Long id;

  @Column(name = "provider", nullable = false)
  private String provider = "github";

  @Column(name = "delivery_id", nullable = false, unique = true)
  private String deliveryId;

  @Column(name = "event_type")
  private String eventType;

  @Column(name = "payload_hash")
  private String payloadHash;

  @Column(name = "payload")
  private String payload;

  @Column(name = "status", nullable = false)
  private String status = "received";

  @Column(name = "retry_count", nullable = false)
  private int retryCount = 0;

  @Column(name = "error")
  private String error;

  @Column(name = "received_at", nullable = false, updatable = false)
  private Instant receivedAt;

  @Column(name = "processed_at")
  private Instant processedAt;

  public WebhookEvent() {
  }

  @PrePersist
  void prePersist() {
    if (receivedAt == null) {
      receivedAt = Instant.now();
    }
    if (provider == null || provider.isBlank()) {
      provider = "github";
    }
    if (status == null || status.isBlank()) {
      status = "received";
    }
  }

  public Long getId() {
    return id;
  }

  public String getProvider() {
    return provider;
  }

  public void setProvider(String provider) {
    this.provider = provider;
  }

  public String getDeliveryId() {
    return deliveryId;
  }

  public void setDeliveryId(String deliveryId) {
    this.deliveryId = deliveryId;
  }

  public String getEventType() {
    return eventType;
  }

  public void setEventType(String eventType) {
    this.eventType = eventType;
  }

  public String getPayloadHash() {
    return payloadHash;
  }

  public void setPayloadHash(String payloadHash) {
    this.payloadHash = payloadHash;
  }

  public String getPayload() {
    return payload;
  }

  public void setPayload(String payload) {
    this.payload = payload;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public int getRetryCount() {
    return retryCount;
  }

  public void setRetryCount(int retryCount) {
    this.retryCount = retryCount;
  }

  public String getError() {
    return error;
  }

  public void setError(String error) {
    this.error = error;
  }

  public Instant getReceivedAt() {
    return receivedAt;
  }

  public Instant getProcessedAt() {
    return processedAt;
  }

  public void setProcessedAt(Instant processedAt) {
    this.processedAt = processedAt;
  }
}
