package com.archflux.service;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.WebhookEvent;
import com.archflux.repo.WebhookEventRepository;
import com.archflux.util.JsonCanonicals;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;

/**
 * Durable webhook inbox (PRODUCTIZATION_SPEC §10): persist-before-ack with
 * dedup on the provider delivery ID, asynchronous processing on a bounded
 * executor, terminal failure with a replay mechanism.
 */
@Service
public class WebhookEventService {

  private static final Logger log = LoggerFactory.getLogger(WebhookEventService.class);

  private final WebhookEventRepository events;
  private final DiagramService diagrams;
  private final CheckpointService checkpoints;
  private final GitHubArchFetcher fetcher;
  private final AuditService audit;
  private final MeterRegistry meters;
  private final ObjectMapper mapper = JsonCanonicals.baseMapper();

  public WebhookEventService(WebhookEventRepository events, DiagramService diagrams,
      CheckpointService checkpoints, GitHubArchFetcher fetcher, AuditService audit,
      MeterRegistry meters) {
    this.events = events;
    this.diagrams = diagrams;
    this.checkpoints = checkpoints;
    this.fetcher = fetcher;
    this.audit = audit;
    this.meters = meters;
  }

  public record Receipt(WebhookEvent event, boolean duplicate) {
  }

  /**
   * Persists the delivery as {@code received} BEFORE any processing. A
   * duplicate delivery ID returns the existing row flagged duplicate (callers
   * answer success without reprocessing).
   */
  @Transactional
  public Receipt receive(String provider, String deliveryId, String eventType, String rawPayload) {
    return events.findByDeliveryId(deliveryId).map(existing -> {
      meters.counter("archflux.webhook.events", Tags.of("status", "duplicate")).increment();
      return new Receipt(existing, true);
    }).orElseGet(() -> {
      WebhookEvent event = new WebhookEvent();
      event.setProvider(provider == null || provider.isBlank() ? "github" : provider);
      event.setDeliveryId(deliveryId);
      event.setEventType(eventType);
      event.setPayloadHash(JsonCanonicals.sha256Hex(rawPayload == null ? "" : rawPayload));
      event.setPayload(rawPayload);
      event.setStatus("received");
      try {
        WebhookEvent saved = events.saveAndFlush(event);
        meters.counter("archflux.webhook.events", Tags.of("status", "received")).increment();
        return new Receipt(saved, false);
      } catch (DataIntegrityViolationException e) {
        // Lost a concurrent insert race — the other delivery won.
        WebhookEvent existing =
            events.findByDeliveryId(deliveryId).orElseThrow(() -> e);
        meters.counter("archflux.webhook.events", Tags.of("status", "duplicate")).increment();
        return new Receipt(existing, true);
      }
    });
  }

  /** Marks a non-actionable delivery processed without async work. */
  @Transactional
  public void markProcessed(Long eventId, String note) {
    events.findById(eventId).ifPresent(event -> {
      event.setStatus("processed");
      event.setProcessedAt(java.time.Instant.now());
      events.save(event);
      meters.counter("archflux.webhook.events", Tags.of("status", "processed")).increment();
      log.info("Webhook event {} processed ({})", event.getDeliveryId(), note);
    });
  }

  /**
   * Asynchronous processing on the bounded {@code webhookExecutor} pool. Never
   * performs long provider work on the webhook request thread. Terminal state
   * (processed/failed) always carries {@code processed_at}; failures record a
   * message plus retry count for the replay workflow.
   */
  @Async("webhookExecutor")
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void processAsync(Long eventId, UUID userId, String correlationId) {
    if (correlationId != null) {
      MDC.put("correlationId", correlationId);
    }
    try {
      WebhookEvent event = events.findById(eventId).orElse(null);
      if (event == null || !"received".equals(event.getStatus())) {
        return;
      }
      event.setStatus("processing");
      events.saveAndFlush(event);
      try {
        processPayload(event, userId);
        event.setStatus("processed");
        event.setError(null);
        event.setProcessedAt(java.time.Instant.now());
        events.save(event);
        meters.counter("archflux.webhook.events", Tags.of("status", "processed")).increment();
        audit.record(userId, null, "webhook.processed", "webhook_event",
            event.getDeliveryId(), "ok");
        log.info("Webhook event {} processed", event.getDeliveryId());
      } catch (Exception e) {
        event.setStatus("failed");
        event.setRetryCount(event.getRetryCount() + 1);
        event.setError(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        event.setProcessedAt(java.time.Instant.now());
        events.save(event);
        meters.counter("archflux.webhook.events", Tags.of("status", "failed")).increment();
        audit.record(userId, null, "webhook.failed", "webhook_event",
            event.getDeliveryId(), "error");
        log.warn("Webhook event {} failed: {}", event.getDeliveryId(), e.getMessage());
      }
    } finally {
      if (correlationId != null) {
        MDC.remove("correlationId");
      }
    }
  }

  /**
   * Re-queues a failed event for processing. Unknown delivery → 404; any
   * non-failed status → 409.
   */
  @Transactional
  public WebhookEvent replay(String deliveryId, UUID actorId, String correlationId) {
    WebhookEvent event = events.findByDeliveryId(deliveryId)
        .orElseThrow(() -> ApiException.notFound("Webhook event not found: " + deliveryId));
    if (!"failed".equals(event.getStatus())) {
      throw ApiException.conflict("WEBHOOK_NOT_FAILED",
          "Webhook event " + deliveryId + " is " + event.getStatus() + ", only failed events can be replayed");
    }
    event.setStatus("received");
    event.setError(null);
    event.setProcessedAt(null);
    WebhookEvent saved = events.saveAndFlush(event);
    processAsync(saved.getId(), actorId, correlationId);
    return saved;
  }

  /** Parses the delivery, detects .arch changes, and runs the upsert. */
  void processPayload(WebhookEvent event, UUID userId) {
    JsonNode json;
    try {
      json = mapper.readTree(event.getPayload() == null ? "" : event.getPayload());
    } catch (Exception e) {
      throw new IllegalArgumentException("Invalid JSON payload");
    }
    if (userId == null) {
      String mapped = System.getenv("GITHUB_WEBHOOK_USER_ID");
      if (mapped != null && !mapped.isBlank()) {
        try {
          userId = UUID.fromString(mapped.trim());
        } catch (Exception ignored) {
          userId = null;
        }
      }
    }
    if (userId == null) {
      throw new IllegalStateException(
          "Webhook has no mapped user: send a user credential or set GITHUB_WEBHOOK_USER_ID");
    }
    String repoFullName = json.path("repository").path("full_name").asText();
    String ref = json.path("ref").asText();
    String branch = ref.startsWith("refs/heads/") ? ref.substring(11) : ref;
    String archFilePath = findArchFile(json);
    if (archFilePath == null) {
      return;
    }
    String archContent = fetcher.fetch(repoFullName, branch, archFilePath);
    if (archContent == null) {
      throw new IllegalStateException("Could not fetch .arch file");
    }
    createOrUpdateDiagramFromArch(repoFullName, branch, archFilePath, archContent, userId);
  }

  /** Scans commits + head_commit for changed .arch files (null when none). */
  static String findArchFile(JsonNode json) {
    JsonNode commits = json.path("commits");
    if (commits.isArray()) {
      String found = scanCommits(commits);
      if (found != null) {
        return found;
      }
    }
    return scanCommits(json.path("head_commit"));
  }

  private static String scanCommits(JsonNode commits) {
    List<JsonNode> scopes = new java.util.ArrayList<>();
    if (commits.isArray()) {
      commits.forEach(scopes::add);
    } else if (commits.isObject()) {
      scopes.add(commits);
    } else {
      return null;
    }
    List<String> changeFields = List.of("added", "modified", "removed");
    for (JsonNode commit : scopes) {
      for (String field : changeFields) {
        JsonNode files = commit.path(field);
        if (files != null && files.isArray()) {
          for (JsonNode file : files) {
            String path = file.asText();
            if (path != null && path.endsWith(".arch")) {
              return path;
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * The .arch upsert behavior (previously inline in SyncController): parse the
   * .arch content, upsert the diagram tagged
   * {@code github:{owner}/{repo}:{path}}, and snapshot a checkpoint. Throws
   * on unparseable content so the event lands terminal-failed; checkpoint
   * failures stay best-effort warnings.
   */
  void createOrUpdateDiagramFromArch(String repoFullName, String branch, String archFilePath,
      String archContent, UUID userId) {
    JsonNode archJson;
    try {
      archJson = diagrams.getMapper().readTree(archContent);
    } catch (Exception e) {
      throw new IllegalArgumentException("Invalid .arch content: not JSON");
    }
    JsonNode graphNode = archJson.has("graph") ? archJson.path("graph") : archJson;
    JsonNode nodes = graphNode.path("nodes");
    JsonNode edges = graphNode.path("edges");
    JsonNode strokes = graphNode.path("strokes");
    JsonNode texts = graphNode.path("texts");

    String diagramTitle = repoFullName + " - " + archFilePath;
    List<String> tags = Arrays.asList("github", repoFullName, archFilePath, "branch:" + branch);

    String repoTag = "github:" + repoFullName + ":" + archFilePath;
    DiagramService.PageResult<Map<String, Object>> existingResult =
        diagrams.list(userId, 1, 10, repoTag);
    UUID diagramId;

    if (!existingResult.items().isEmpty()) {
      String existingIdStr = String.valueOf(existingResult.items().get(0).get("id"));
      diagramId = UUID.fromString(existingIdStr);
      diagrams.update(
          userId, diagramId,
          diagramTitle,
          tags,
          graphNode.isMissingNode() ? null : graphNode,
          nodes.isMissingNode() ? null : nodes,
          edges.isMissingNode() ? null : edges,
          strokes.isMissingNode() ? null : strokes,
          texts.isMissingNode() ? null : texts,
          true, true, null, false, "webhook");
    } else {
      com.fasterxml.jackson.databind.node.ObjectNode fullGraph =
          diagrams.getMapper().createObjectNode();
      fullGraph.set("nodes", nodes.isMissingNode() ? diagrams.getMapper().createArrayNode() : nodes);
      fullGraph.set("edges", edges.isMissingNode() ? diagrams.getMapper().createArrayNode() : edges);
      fullGraph.set("strokes",
          strokes.isMissingNode() ? diagrams.getMapper().createArrayNode() : strokes);
      fullGraph.set("texts", texts.isMissingNode() ? diagrams.getMapper().createArrayNode() : texts);
      Map<String, Object> created = diagrams.create(
          userId,
          diagramTitle,
          tags,
          fullGraph, fullGraph.path("nodes"), fullGraph.path("edges"),
          fullGraph.path("strokes"), fullGraph.path("texts"), "webhook");
      diagramId = UUID.fromString(String.valueOf(created.get("id")));
    }

    try {
      checkpoints.create(userId, diagramId, "webhook:" + branch + ":" + archFilePath,
          "repo=" + repoFullName, branch);
    } catch (Exception e) {
      log.warn("Webhook checkpoint failed for diagram {}: {}", diagramId, e.getMessage());
    }
  }
}
