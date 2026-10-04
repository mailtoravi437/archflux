package com.archflux.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Checkpoint;
import com.archflux.domain.Diagram;
import com.archflux.repo.CheckpointRepository;
import com.archflux.util.JsonCanonicals;

/** Checkpoints snapshot the diagram's current graph. */
@Service
public class CheckpointService {

  private final CheckpointRepository checkpoints;
  private final DiagramService diagrams;

  public CheckpointService(CheckpointRepository checkpoints, DiagramService diagrams) {
    this.checkpoints = checkpoints;
    this.diagrams = diagrams;
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> list(UUID ownerId, UUID diagramId) {
    diagrams.requireOwnedForRead(ownerId, diagramId);
    return checkpoints.findByDiagram_IdOrderByCreatedAtDesc(diagramId).stream().map(this::toJson).toList();
  }

  @Transactional
  public Map<String, Object> create(UUID ownerId, UUID diagramId, String title, String meta) {
    if (title == null || title.isBlank()) {
      throw ApiException.validation("title is required");
    }
    Diagram diagram = diagrams.requireOwnedForWrite(ownerId, diagramId);
    Checkpoint checkpoint = new Checkpoint();
    checkpoint.setDiagram(diagram);
    checkpoint.setTitle(title);
    checkpoint.setMeta(meta);
    checkpoint.setSnapshot(diagram.getGraph());
    return toJson(checkpoints.saveAndFlush(checkpoint));
  }

  public Map<String, Object> toJson(Checkpoint checkpoint) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", checkpoint.getId().toString());
    out.put("diagramId", checkpoint.getDiagram().getId().toString());
    out.put("title", checkpoint.getTitle());
    out.put("meta", checkpoint.getMeta());
    out.put("snapshot", parseJson(checkpoint.getSnapshot()));
    out.put("createdAt", checkpoint.getCreatedAt() == null ? null : checkpoint.getCreatedAt().toString());
    return out;
  }

  private Object parseJson(String raw) {
    try {
      return JsonCanonicals.baseMapper().readValue(raw == null ? "{}" : raw, Object.class);
    } catch (Exception e) {
      return Map.of();
    }
  }
}
