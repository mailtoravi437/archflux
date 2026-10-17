package com.archflux.web;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.archflux.security.RequestUser;
import com.archflux.service.GitHubArchFetcher;
import com.archflux.service.SyncService;
import com.archflux.service.WebhookEventService;
import com.archflux.web.dto.SyncRequest;
import jakarta.servlet.http.HttpServletRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/sync")
@Tag(name = "Sync", description = "Idempotent synchronization with upstream infrastructure")
public class SyncController {

  private final SyncService syncService;
  private final WebhookEventService webhookEvents;
  private final GitHubArchFetcher fetcher;

  @Value("${GITHUB_WEBHOOK_SECRET:}")
  private String webhookSecretProp;

  public SyncController(SyncService syncService, WebhookEventService webhookEvents,
      GitHubArchFetcher fetcher) {
    this.syncService = syncService;
    this.webhookEvents = webhookEvents;
    this.fetcher = fetcher;
  }

  @Operation(summary = "Sync diagram with upstream", description = "Idempotent sync - computes canonical SHA from diagram+upstream, returns noop if already processed")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Sync completed or noop"),
    @ApiResponse(responseCode = "401", description = "Unauthorized"),
    @ApiResponse(responseCode = "503", description = "Schema not ready")
  })
  @PostMapping
  public Map<String, Object> sync(HttpServletRequest request,
      @Parameter(description = "Sync request with diagram and upstream data", required = false) 
      @RequestBody(required = false) SyncRequest body) {
    UUID userId = RequestUser.get(request);
    SyncService.SyncOutcome outcome = syncService.sync(userId, RequestUser.ACTOR,
        body == null ? null : body.getDiagram(), body == null ? null : body.getUpstream());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("status", outcome.status());
    out.put("driftEvaluated", outcome.driftEvaluated());
    out.put("nodesSynced", outcome.nodesSynced());
    out.put("edgesSynced", outcome.edgesSynced());
    out.put("commitSha", outcome.commitSha());
    out.put("timestamp", outcome.timestamp() == null ? null : outcome.timestamp().toString());
    return out;
  }

  /**
   * Git webhook handler — durable inbox (persist-before-ack) with async
   * processing on the bounded webhook executor. Duplicate delivery IDs answer
   * success without reprocessing.
   */
  @Operation(summary = "Git webhook handler", description = "Receives push webhooks from GitHub and syncs changed .arch files (async)")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Webhook received (async processing) or duplicate"),
    @ApiResponse(responseCode = "401", description = "Invalid signature"),
    @ApiResponse(responseCode = "503", description = "Webhook secret not configured")
  })
  @PostMapping("/webhook/git")
  public ResponseEntity<Map<String, Object>> gitWebhook(
      HttpServletRequest request,
      @RequestHeader(value = "X-Hub-Signature-256", required = false) String signature,
      @RequestHeader(value = "X-GitHub-Event", required = false) String event,
      @RequestHeader(value = "X-GitHub-Delivery", required = false) String deliveryId,
      @RequestBody(required = false) String payload) {
    if (signature == null || signature.isBlank()) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .body(Map.of("error", "Missing signature"));
    }
    String secret = webhookSecretProp != null && !webhookSecretProp.isBlank()
        ? webhookSecretProp : System.getenv("GITHUB_WEBHOOK_SECRET");
    if (secret == null || secret.isBlank()) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(Map.of("error", "Webhook secret not configured"));
    }
    // Verify GitHub signature (constant-time compare)
    String raw = payload == null ? "" : payload;
    String expectedSignature = "sha256=" + hmacSha256(raw, secret);
    if (!MessageDigest.isEqual(expectedSignature.getBytes(StandardCharsets.UTF_8),
        signature.getBytes(StandardCharsets.UTF_8))) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .body(Map.of("error", "Invalid signature"));
    }

    String delivery = (deliveryId == null || deliveryId.isBlank())
        ? UUID.randomUUID().toString() : deliveryId;
    WebhookEventService.Receipt receipt =
        webhookEvents.receive("github", delivery, event, raw);
    if (receipt.duplicate()) {
      return ResponseEntity.ok(Map.of("status", "duplicate", "deliveryId", delivery));
    }

    // Only push events carry .arch changes — mark the rest processed inline.
    if (!"push".equals(event)) {
      webhookEvents.markProcessed(receipt.event().getId(), "ignored event " + event);
      return ResponseEntity.ok(Map.of("message", "Event ignored: " + event));
    }

    // Hand to the bounded async executor; terminal state lands on the event row.
    webhookEvents.processAsync(receipt.event().getId(), RequestUser.get(request),
        MDC.get("correlationId"));
    return ResponseEntity.ok(Map.of("status", "received", "deliveryId", delivery));
  }

  /**
   * Replays a terminally-failed delivery: unknown delivery → 404, non-failed
   * status → 409.
   */
  @Operation(summary = "Replay failed webhook", description = "Re-queues a failed webhook delivery for async processing")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Re-queued"),
    @ApiResponse(responseCode = "401", description = "Unauthorized"),
    @ApiResponse(responseCode = "404", description = "Unknown delivery"),
    @ApiResponse(responseCode = "409", description = "Event is not failed")
  })
  @PostMapping("/webhook/git/replay")
  public ResponseEntity<Map<String, Object>> replayWebhook(
      HttpServletRequest request,
      @RequestParam String deliveryId) {
    com.archflux.domain.WebhookEvent event =
        webhookEvents.replay(deliveryId, RequestUser.get(request), MDC.get("correlationId"));
    return ResponseEntity.ok(Map.of("status", "received", "deliveryId", event.getDeliveryId()));
  }

  static String hmacSha256(String data, String secret) {
    try {
      javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
      mac.init(new javax.crypto.spec.SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder(hash.length * 2);
      for (byte b : hash) {
        hex.append(String.format("%02x", b));
      }
      return hex.toString();
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  /**
   * Health check for GitHub API connectivity
   */
  @GetMapping("/webhook/git/health")
  public ResponseEntity<Map<String, Object>> gitWebhookHealth() {
    try {
      // Test GitHub API connectivity
      String probed = fetcher.fetch("github", "main", "docs/README.md");

      boolean healthy = probed != null && !probed.isEmpty();
      return ResponseEntity.ok(Map.of(
          "healthy", healthy
      ));
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(Map.of("healthy", false, "error", e.getMessage()));
    }
  }
}
