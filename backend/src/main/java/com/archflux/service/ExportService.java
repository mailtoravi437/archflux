package com.archflux.service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Diagram;
import com.archflux.repo.DiagramRepository;
import com.archflux.util.JsonCanonicals;

/** Builds the portable .arch export payload for a diagram. */
@Service
public class ExportService {

  private final DiagramRepository diagrams;
  private final SchemaReadinessService readiness;
  private final DiagramService diagramService;
  private final AccessService accessService;

  public ExportService(DiagramRepository diagrams, SchemaReadinessService readiness,
      DiagramService diagramService, AccessService accessService) {
    this.diagrams = diagrams;
    this.readiness = readiness;
    this.diagramService = diagramService;
    this.accessService = accessService;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> exportDiagram(UUID userId, UUID diagramId) {
    readiness.requireReady();
    // Export needs VIEW access; AccessService.require throws 404/403
    Diagram diagram = accessService.require(userId, diagramId, AccessService.Action.VIEW, null);
    Map<String, Object> rendered = diagramService.toJson(diagram);
    @SuppressWarnings("unchecked")
    Map<String, Object> graph = (Map<String, Object>) rendered.get("graph");

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("app", "ArchFlux");
    out.put("spec", ".arch");
    out.put("version", 1);
    out.put("nodes", graph.getOrDefault("nodes", List.of()));
    out.put("edges", graph.getOrDefault("edges", List.of()));
    out.put("strokes", graph.getOrDefault("strokes", List.of()));
    out.put("texts", graph.getOrDefault("texts", List.of()));
    Map<String, Object> metadata = new LinkedHashMap<>();
    metadata.put("diagramId", diagram.getId().toString());
    metadata.put("title", diagram.getTitle());
    metadata.put("tags", diagram.getTags());
    metadata.put("exportedAt", Instant.now().toString());
    out.put("metadata", metadata);
    return out;
  }

  /** Parses raw JSON with Jackson (String mapping for jsonb columns). */
  public static Object parseRaw(String raw) {
    try {
      return JsonCanonicals.baseMapper().readValue(raw == null ? "{}" : raw, Object.class);
    } catch (Exception e) {
      return Map.of();
    }
  }
}
