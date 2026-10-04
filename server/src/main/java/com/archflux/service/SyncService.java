package com.archflux.service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Diagram;
import com.archflux.domain.SyncLog;
import com.archflux.repo.DiagramRepository;
import com.archflux.repo.SyncLogRepository;
import com.archflux.util.JsonCanonicals;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Idempotent sync staging. The commit SHA is sha256 over the canonical
 * (key-sorted) JSON of {@code {diagram, upstream}}. Repeats hit the
 * {@code sync_log} lookup by commit SHA and return a noop with zero counts
 * and the original timestamp. One {@code sync_log} row is persisted per real
 * sync (requires a resolvable diagram id — the V1 schema declares
 * {@code diagram_id NOT NULL}, so diagram-less syncs are answered
 * statelessly).
 */
@Service
public class SyncService {

  private static final Logger log = LoggerFactory.getLogger(SyncService.class);

  private final SyncLogRepository syncLogRepository;
  private final DiagramRepository diagramRepository;
  private final SchemaReadinessService readiness;
  private final ObjectMapper mapper = JsonCanonicals.baseMapper();

  public SyncService(SyncLogRepository syncLogRepository, DiagramRepository diagramRepository,
      SchemaReadinessService readiness) {
    this.syncLogRepository = syncLogRepository;
    this.diagramRepository = diagramRepository;
    this.readiness = readiness;
  }

  public record SyncOutcome(String status, boolean driftEvaluated, int nodesSynced,
      int edgesSynced, String commitSha, Instant timestamp, boolean persisted) {
  }

  @Transactional
  public SyncOutcome sync(UUID ownerId, String actor, JsonNode diagram, JsonNode upstream) {
    readiness.requireReady();

    Map<String, Object> canonicalPayload = new LinkedHashMap<>();
    canonicalPayload.put("diagram", diagram == null || diagram.isNull()
        ? null : mapper.convertValue(diagram, Object.class));
    canonicalPayload.put("upstream", upstream == null || upstream.isNull()
        ? null : mapper.convertValue(upstream, Object.class));
    String canonicalJson = JsonCanonicals.toCanonicalJson(canonicalPayload);
    String commitSha = JsonCanonicals.sha256Hex(canonicalJson);

    Optional<SyncLog> existing = syncLogRepository.findFirstByCommitShaOrderByCreatedAtAsc(commitSha);
    if (existing.isPresent()) {
      SyncLog row = existing.get();
      log.info("Sync noop for commit {} (actor {})", commitSha, actor);
      return new SyncOutcome("noop", true, 0, 0, commitSha, row.getCreatedAt(), false);
    }

    JsonNode graphCarrier = diagram != null && !diagram.isNull() ? diagram : upstream;
    int nodesSynced = countArray(graphCarrier, "nodes");
    int edgesSynced = countArray(graphCarrier, "edges");

    Diagram diagramRef = resolveDiagramRef(ownerId, diagram);

    SyncOutcome outcome =
        new SyncOutcome("synced", true, nodesSynced, edgesSynced, commitSha, Instant.now(), diagramRef != null);
    if (diagramRef != null) {
      SyncLog row = new SyncLog();
      row.setDiagram(diagramRef);
      row.setActor(actor == null ? "" : actor);
      row.setCommitSha(commitSha);
      Map<String, Object> delta = new LinkedHashMap<>();
      delta.put("driftEvaluated", true);
      delta.put("nodesSynced", nodesSynced);
      delta.put("edgesSynced", edgesSynced);
      row.setDelta(JsonCanonicals.toCanonicalJson(delta));
      syncLogRepository.saveAndFlush(row);
      // Re-read so the returned timestamp matches the persisted row exactly.
      outcome = new SyncOutcome("synced", true, nodesSynced, edgesSynced, commitSha,
          row.getCreatedAt() != null ? row.getCreatedAt() : outcome.timestamp(), true);
      log.info("Sync staged commit {} (actor {}, +{}/{} nodes/edges)", commitSha, actor, nodesSynced, edgesSynced);
    } else {
      log.info("Sync computed commit {} without persisting (no resolvable diagram)", commitSha);
    }
    return outcome;
  }

  /**
   * Resolves the {@code diagram} payload to an owned row. Returns null when no
   * id was supplied (stateless sync). Throws 404/403 for unknown/foreign ids.
   */
  private Diagram resolveDiagramRef(UUID ownerId, JsonNode diagram) {
    if (diagram == null || diagram.isNull() || !diagram.isObject()) {
      return null;
    }
    JsonNode idNode = diagram.get("id");
    if (idNode == null || idNode.isNull() || idNode.asText().isBlank()) {
      return null;
    }
    UUID id;
    try {
      id = UUID.fromString(idNode.asText());
    } catch (IllegalArgumentException e) {
      throw ApiException.validation("Invalid diagram id: " + idNode.asText());
    }
    Optional<Diagram> row = diagramRepository.findById(id);
    if (row.isEmpty()) {
      throw ApiException.notFound("Diagram not found: " + id);
    }
    if (!ownerId.equals(row.get().ownerId())) {
      throw ApiException.forbidden("Diagram belongs to another user: " + id);
    }
    return row.get();
  }

  /** Counts nodes/edges from either a graph object or flat sibling arrays. */
  static int countArray(JsonNode carrier, String key) {
    if (carrier == null || carrier.isNull() || !carrier.isObject()) {
      return 0;
    }
    JsonNode direct = carrier.get(key);
    if (direct != null && direct.isArray()) {
      return direct.size();
    }
    JsonNode graph = carrier.get("graph");
    if (graph != null && graph.isObject()) {
      JsonNode nested = graph.get(key);
      if (nested != null && nested.isArray()) {
        return nested.size();
      }
    }
    return 0;
  }

  /** Pure canonical-SHA helper (unit-testable without Spring). */
  public static String commitShaOf(Object diagram, Object upstream) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("diagram", diagram);
    payload.put("upstream", upstream);
    return JsonCanonicals.sha256Hex(JsonCanonicals.toCanonicalJson(payload));
  }

  public List<SyncLog> history() {
    readiness.requireReady();
    return syncLogRepository.findAll();
  }
}
