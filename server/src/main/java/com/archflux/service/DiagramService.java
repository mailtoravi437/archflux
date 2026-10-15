package com.archflux.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Diagram;
import com.archflux.domain.User;
import com.archflux.repo.DiagramRepository;
import com.archflux.repo.UserRepository;
import com.archflux.util.JsonCanonicals;
import com.archflux.util.LikeEscape;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;

/**
 * Diagram CRUD scoped to the requesting owner. Reads of foreign/missing rows
 * are 404 (scoped query); writes to foreign rows are 403.
 */
@Service
public class DiagramService {

  public static final int DEFAULT_LIMIT = 20;
  public static final int MAX_LIMIT = 50;

  private final DiagramRepository diagrams;
  private final UserRepository users;
  private final SchemaReadinessService readiness;
  private final EntityManager entityManager;
  private final ObjectMapper mapper = JsonCanonicals.baseMapper();

  public ObjectMapper getMapper() {
    return mapper;
  }

  public DiagramService(DiagramRepository diagrams, UserRepository users,
      SchemaReadinessService readiness, EntityManager entityManager) {
    this.diagrams = diagrams;
    this.users = users;
    this.readiness = readiness;
    this.entityManager = entityManager;
  }

  public record PageResult<T>(List<T> items, long total) {
  }

  @Transactional(readOnly = true)
  public PageResult<Map<String, Object>> list(UUID ownerId, int page, int limit, String q) {
    readiness.requireReady();
    int safeLimit = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
    int safePage = Math.max(page, 1);
    PageRequest pageable = PageRequest.of(safePage - 1, safeLimit,
        Sort.by(Sort.Direction.DESC, "updatedAt"));
    Page<Diagram> result;
    long total;
    if (q == null || q.isBlank()) {
      result = diagrams.findByOwner_Id(ownerId, pageable);
      total = diagrams.countByOwner_Id(ownerId);
    } else {
      String pattern = "%" + LikeEscape.escape(q) + "%";
      result = diagrams.searchByOwnerAndTitle(ownerId, pattern, pageable);
      total = diagrams.countSearchByOwnerAndTitle(ownerId, pattern);
    }
    List<Map<String, Object>> items = result.getContent().stream().map(this::toJson).toList();
    return new PageResult<>(items, total);
  }

  @Transactional
  public Map<String, Object> create(UUID ownerId, String title, List<String> tags,
      JsonNode graph, JsonNode nodes, JsonNode edges, JsonNode strokes, JsonNode texts) {
    readiness.requireReady();
    if (title == null || title.isBlank()) {
      throw ApiException.validation("title is required");
    }
    User owner = users.findById(ownerId).orElseGet(() -> {
      User created = new User(ownerId, "dev@archflux.local", "Dev User", "admin");
      return users.save(created);
    });
    Diagram diagram = new Diagram();
    diagram.setOwner(owner);
    diagram.setTitle(title);
    diagram.setTags(tags == null ? List.of() : tags);
    diagram.setGraph(JsonCanonicals.toCanonicalJson(
        JsonCanonicals.canonicalGraph(graph, nodes, edges, strokes, texts)));
    Diagram saved = diagrams.saveAndFlush(diagram);
    return toJson(saved);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> get(UUID ownerId, UUID id) {
    readiness.requireReady();
    Diagram diagram = diagrams.findByIdAndOwner_Id(id, ownerId)
        .orElseThrow(() -> ApiException.notFound("Diagram not found: " + id));
    return toJson(diagram);
  }

  @Transactional
  public Map<String, Object> update(UUID ownerId, UUID id, String title, List<String> tags,
      JsonNode graph, JsonNode nodes, JsonNode edges, JsonNode strokes, JsonNode texts,
      boolean graphProvided, boolean tagsProvided) {
    readiness.requireReady();
    Optional<Diagram> any = diagrams.findById(id);
    if (any.isEmpty()) {
      throw ApiException.notFound("Diagram not found: " + id);
    }
    Diagram diagram = any.get();
    if (!ownerId.equals(diagram.ownerId())) {
      throw ApiException.forbidden("Diagram belongs to another user: " + id);
    }
    if (title != null) {
      if (title.isBlank()) {
        throw ApiException.validation("title must not be blank");
      }
      diagram.setTitle(title);
    }
    if (tagsProvided) {
      diagram.setTags(tags == null ? List.of() : tags);
    }
    if (graphProvided) {
      JsonNode currentGraph = readGraph(diagram.getGraph());
      Map<String, Object> merged = JsonCanonicals.canonicalGraph(
          graph != null ? graph : currentGraph, nodes, edges, strokes, texts);
      diagram.setGraph(JsonCanonicals.toCanonicalJson(merged));
    }
    Diagram saved = diagrams.saveAndFlush(diagram);
    // DB trigger sets updated_at — refresh so the response carries the true value.
    entityManager.refresh(saved);
    return toJson(saved);
  }

  @Transactional
  public void delete(UUID ownerId, UUID id) {
    readiness.requireReady();
    Optional<Diagram> any = diagrams.findById(id);
    if (any.isEmpty()) {
      throw ApiException.notFound("Diagram not found: " + id);
    }
    if (!ownerId.equals(any.get().ownerId())) {
      throw ApiException.forbidden("Diagram belongs to another user: " + id);
    }
    diagrams.delete(any.get());
  }

  /** Loads the owned diagram or throws 404 (scoped reads) — for nested routes. */
  @Transactional(readOnly = true)
  public Diagram requireOwnedForRead(UUID ownerId, UUID id) {
    readiness.requireReady();
    return diagrams.findByIdAndOwner_Id(id, ownerId)
        .orElseThrow(() -> ApiException.notFound("Diagram not found: " + id));
  }

  /** Loads the owned diagram or throws 404/403 — for nested writes. */
  @Transactional(readOnly = true)
  public Diagram requireOwnedForWrite(UUID ownerId, UUID id) {
    readiness.requireReady();
    Optional<Diagram> any = diagrams.findById(id);
    if (any.isEmpty()) {
      throw ApiException.notFound("Diagram not found: " + id);
    }
    if (!ownerId.equals(any.get().ownerId())) {
      throw ApiException.forbidden("Diagram belongs to another user: " + id);
    }
    return any.get();
  }

  @Transactional
  public Map<String, Object> createBranch(UUID ownerId, UUID id, String title, String branchName) {
    readiness.requireReady();
    Diagram source = requireOwnedForWrite(ownerId, id);
    if (title == null || title.isBlank()) {
      throw ApiException.validation("title is required");
    }
    User owner = users.findById(ownerId).orElseThrow(() -> ApiException.notFound("User not found"));
    Diagram branch = new Diagram();
    branch.setOwner(owner);
    branch.setTitle(title);
    branch.setTags(source.getTags());
    branch.setGraph(source.getGraph());
    branch.setParentDiagram(source);
    branch.setBranchName(branchName);
    Diagram saved = diagrams.saveAndFlush(branch);
    return toJson(saved);
  }

  public Map<String, Object> toJson(Diagram diagram) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", diagram.getId().toString());
    out.put("title", diagram.getTitle());
    out.put("tags", diagram.getTags());
    out.put("branchName", diagram.getBranchName());
    UUID parentId = null;
    try {
      parentId = diagram.parentDiagramId();
    } catch (Exception ignored) {
      parentId = null;
    }
    out.put("parentDiagramId", parentId == null ? null : parentId.toString());
    Map<String, Object> graph = readGraphAsMap(diagram.getGraph());
    out.put("graph", graph);
    out.put("nodes", graph.getOrDefault("nodes", List.of()));
    out.put("edges", graph.getOrDefault("edges", List.of()));
    out.put("strokes", graph.getOrDefault("strokes", List.of()));
    out.put("texts", graph.getOrDefault("texts", List.of()));
    out.put("createdAt", diagram.getCreatedAt() == null ? null : diagram.getCreatedAt().toString());
    out.put("updatedAt", diagram.getUpdatedAt() == null ? null : diagram.getUpdatedAt().toString());
    return out;
  }

  private JsonNode readGraph(String graph) {
    try {
      JsonNode node = mapper.readTree(graph == null ? "{}" : graph);
      return node.isObject() ? node : mapper.createObjectNode();
    } catch (Exception e) {
      return mapper.createObjectNode();
    }
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> readGraphAsMap(String graph) {
    try {
      Object parsed = mapper.readValue(graph == null ? "{}" : graph, Object.class);
      if (parsed instanceof Map<?, ?> map) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
          out.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        for (String key : List.of("nodes", "edges", "strokes", "texts")) {
          out.putIfAbsent(key, List.of());
        }
        return out;
      }
    } catch (Exception ignored) {
      // fall through to empty graph
    }
    Map<String, Object> empty = new LinkedHashMap<>();
    empty.put("nodes", List.of());
    empty.put("edges", List.of());
    empty.put("strokes", List.of());
    empty.put("texts", List.of());
    return empty;
  }
}
