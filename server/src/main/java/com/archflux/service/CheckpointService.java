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
import com.archflux.repo.DiagramRepository;
import com.archflux.util.JsonCanonicals;

/** Checkpoints snapshot the diagram's current graph. */
@Service
public class CheckpointService {

  private final CheckpointRepository checkpoints;
  private final DiagramService diagrams;
  private final DiagramRepository diagramRepository;

  public CheckpointService(CheckpointRepository checkpoints, DiagramService diagrams,
      DiagramRepository diagramRepository) {
    this.checkpoints = checkpoints;
    this.diagrams = diagrams;
    this.diagramRepository = diagramRepository;
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> list(UUID ownerId, UUID diagramId) {
    return list(ownerId, diagramId, null);
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> list(UUID ownerId, UUID diagramId, String branch) {
    diagrams.requireOwnedForRead(ownerId, diagramId);
    if (branch != null && !branch.isBlank()) {
      return checkpoints.findByDiagram_IdAndBranchOrderByCreatedAtDesc(diagramId, branch).stream().map(this::toJson).toList();
    }
    return checkpoints.findByDiagram_IdOrderByCreatedAtDesc(diagramId).stream().map(this::toJson).toList();
  }

  @Transactional
  public Map<String, Object> create(UUID ownerId, UUID diagramId, String title, String meta) {
    return create(ownerId, diagramId, title, meta, null);
  }

  @Transactional
  public Map<String, Object> create(UUID ownerId, UUID diagramId, String title, String meta, String branch) {
    if (title == null || title.isBlank()) {
      throw ApiException.validation("title is required");
    }
    Diagram diagram = diagrams.requireOwnedForWrite(ownerId, diagramId);
    Checkpoint checkpoint = new Checkpoint();
    checkpoint.setDiagram(diagram);
    checkpoint.setTitle(title);
    checkpoint.setMeta(meta);
    checkpoint.setBranch(branch);
    checkpoint.setSnapshot(diagram.getGraph());
    return toJson(checkpoints.saveAndFlush(checkpoint));
  }

  @Transactional
  public void delete(UUID ownerId, UUID diagramId, UUID checkpointId) {
    diagrams.requireOwnedForWrite(ownerId, diagramId);
    Checkpoint checkpoint = checkpoints.findById(checkpointId)
        .orElseThrow(() -> ApiException.notFound("Checkpoint not found: " + checkpointId));
    if (!checkpoint.getDiagram().getId().equals(diagramId)) {
      throw ApiException.validation("Checkpoint does not belong to diagram: " + diagramId);
    }
    checkpoints.delete(checkpoint);
  }

  @Transactional
  public Map<String, Object> restore(UUID ownerId, UUID diagramId, UUID checkpointId) {
    Diagram diagram = diagrams.requireOwnedForWrite(ownerId, diagramId);
    Checkpoint checkpoint = checkpoints.findById(checkpointId)
        .orElseThrow(() -> ApiException.notFound("Checkpoint not found: " + checkpointId));
    if (!checkpoint.getDiagram().getId().equals(diagram.getId())) {
      throw ApiException.validation("Checkpoint does not belong to diagram: " + diagramId);
    }
    diagram.setGraph(checkpoint.getSnapshot());
    diagramRepository.saveAndFlush(diagram);
    return diagrams.toJson(diagram);
  }

  public Map<String, Object> toJson(Checkpoint checkpoint) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", checkpoint.getId().toString());
    out.put("diagramId", checkpoint.getDiagram().getId().toString());
    out.put("title", checkpoint.getTitle());
    out.put("meta", checkpoint.getMeta());
    out.put("branch", checkpoint.getBranch());
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
