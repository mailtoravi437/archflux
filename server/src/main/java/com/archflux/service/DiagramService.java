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
import com.archflux.domain.Workspace;
import com.archflux.repo.DiagramRepository;
import com.archflux.repo.UserRepository;
import com.archflux.util.JsonCanonicals;
import com.archflux.util.LikeEscape;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import jakarta.persistence.EntityManager;

/**
 * Diagram CRUD scoped to the requesting user's workspaces. Reads of
 * foreign/missing rows are 404 (scoped query); writes to foreign rows
 * are 403. Response shapes are unchanged by the workspace scoping.
 */
@Service
public class DiagramService {

  public static final int DEFAULT_LIMIT = 20;
  public static final int MAX_LIMIT = 50;

  private final DiagramRepository diagrams;
  private final UserRepository users;
  private final WorkspaceService workspaceService;
  private final SchemaReadinessService readiness;
  private final RevisionService revisions;
  private final AuditService audit;
  private final MeterRegistry meters;
  private final EntityManager entityManager;
  private final ObjectMapper mapper = JsonCanonicals.baseMapper();

  public ObjectMapper getMapper() {
    return mapper;
  }

  public DiagramService(DiagramRepository diagrams, UserRepository users,
      WorkspaceService workspaceService, SchemaReadinessService readiness,
      RevisionService revisions, AuditService audit, MeterRegistry meters,
      EntityManager entityManager) {
    this.diagrams = diagrams;
    this.users = users;
    this.workspaceService = workspaceService;
    this.readiness = readiness;
    this.revisions = revisions;
    this.audit = audit;
    this.meters = meters;
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
    List<UUID> workspaceIds = workspaceService.workspaceIdsFor(ownerId);
    if (workspaceIds.isEmpty()) {
      return new PageResult<>(List.of(), 0);
    }
    Page<Diagram> result;
    long total;
    if (q == null || q.isBlank()) {
      result = diagrams.findByWorkspace_IdIn(workspaceIds, pageable);
      total = diagrams.countByWorkspace_IdIn(workspaceIds);
    } else {
      String pattern = "%" + LikeEscape.escape(q) + "%";
      result = diagrams.searchByWorkspacesAndTitle(workspaceIds, pattern, pageable);
      total = diagrams.countSearchByWorkspacesAndTitle(workspaceIds, pattern);
    }
    List<Map<String, Object>> items = result.getContent().stream().map(this::toJson).toList();
    return new PageResult<>(items, total);
  }

  @Transactional
  public Map<String, Object> create(UUID ownerId, String title, List<String> tags,
      JsonNode graph, JsonNode nodes, JsonNode edges, JsonNode strokes, JsonNode texts) {
    return create(ownerId, title, tags, graph, nodes, edges, strokes, texts, "manual");
  }

  @Transactional
  public Map<String, Object> create(UUID ownerId, String title, List<String> tags,
      JsonNode graph, JsonNode nodes, JsonNode edges, JsonNode strokes, JsonNode texts,
      String source) {
    readiness.requireReady();
    if (title == null || title.isBlank()) {
      throw ApiException.validation("title is required");
    }
    requireValidGraphTypes(graph, nodes, edges, strokes, texts);
    // Personal workspace first: also provisions the User row for brand-new ids.
    Workspace workspace = workspaceService.resolvePersonalWorkspace(ownerId);
    User owner = users.findById(ownerId).orElseGet(() -> {
      User created = new User(ownerId, "dev@archflux.local", "Dev User", "admin");
      return users.save(created);
    });
    Diagram diagram = new Diagram();
    diagram.setOwner(owner);
    diagram.setWorkspace(workspace);
    diagram.setTitle(title);
    diagram.setTags(tags == null ? List.of() : tags);
    diagram.setGraph(JsonCanonicals.toCanonicalJson(
        JsonCanonicals.canonicalGraph(graph, nodes, edges, strokes, texts)));
    Diagram saved = diagrams.saveAndFlush(diagram);
    revisions.recordAndBump(saved, ownerId, source, "Created diagram");
    audit.record(ownerId, saved.workspaceId(), "diagram.create", "diagram",
        saved.getId().toString(), "ok");
    return toJson(saved);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> get(UUID ownerId, UUID id) {
    readiness.requireReady();
    Diagram diagram = diagrams.findById(id)
        .orElseThrow(() -> ApiException.notFound("Diagram not found: " + id));
    if (!workspaceService.isMember(ownerId, diagram.workspaceId())) {
      throw ApiException.notFound("Diagram not found: " + id);
    }
    return toJson(diagram);
  }

  @Transactional
  public Map<String, Object> update(UUID ownerId, UUID id, String title, List<String> tags,
      JsonNode graph, JsonNode nodes, JsonNode edges, JsonNode strokes, JsonNode texts,
      boolean graphProvided, boolean tagsProvided) {
    return update(ownerId, id, title, tags, graph, nodes, edges, strokes, texts,
        graphProvided, tagsProvided, null, false, "manual");
  }

  /**
   * Update with optimistic concurrency: when {@code expectedVersion} is
   * present and differs from the current version the write is rejected with
   * 409 VERSION_CONFLICT (never a silent overwrite); {@code force} bypasses
   * the check but still records a revision (explicit overwrite).
   */
  @Transactional
  public Map<String, Object> update(UUID ownerId, UUID id, String title, List<String> tags,
      JsonNode graph, JsonNode nodes, JsonNode edges, JsonNode strokes, JsonNode texts,
      boolean graphProvided, boolean tagsProvided, Long expectedVersion, boolean force,
      String source) {
    readiness.requireReady();
    Optional<Diagram> any = diagrams.findById(id);
    if (any.isEmpty()) {
      throw ApiException.notFound("Diagram not found: " + id);
    }
    Diagram diagram = any.get();
    if (!workspaceService.isMember(ownerId, diagram.workspaceId())) {
      throw ApiException.forbidden("Diagram belongs to another workspace: " + id);
    }
    if (expectedVersion != null && !force && expectedVersion.longValue() != diagram.getVersion()) {
      meters.counter("archflux.diagrams.conflicts", Tags.of("outcome", "version_conflict"))
          .increment();
      throw ApiException.versionConflict(expectedVersion.longValue(), diagram.getVersion());
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
      requireValidGraphTypes(graph, nodes, edges, strokes, texts);
      JsonNode currentGraph = readGraph(diagram.getGraph());
      Map<String, Object> merged = JsonCanonicals.canonicalGraph(
          graph != null ? graph : currentGraph, nodes, edges, strokes, texts);
      diagram.setGraph(JsonCanonicals.toCanonicalJson(merged));
    }
    Diagram saved = diagrams.saveAndFlush(diagram);
    revisions.recordAndBump(saved, ownerId, source, force ? "Forced update" : "Updated diagram");
    audit.record(ownerId, saved.workspaceId(), "diagram.update", "diagram",
        saved.getId().toString(), "ok");
    // DB trigger sets updated_at — refresh so the response carries the true value.
    entityManager.refresh(saved);
    return toJson(saved);
  }

  /**
   * Narrow structural validation: graph content that is present but not an
   * array/object of the right shape is semantically invalid (422), not a bad
   * request. Blank titles stay 400; malformed JSON never reaches here (400 at
   * the message-converter layer).
   */
  static void requireValidGraphTypes(JsonNode graph, JsonNode nodes, JsonNode edges,
      JsonNode strokes, JsonNode texts) {
    if (graph != null && !graph.isNull() && !graph.isMissingNode() && !graph.isObject()) {
      throw ApiException.unprocessable("graph must be an object with nodes/edges arrays");
    }
    if (graph != null && graph.isObject()) {
      for (String key : List.of("nodes", "edges", "strokes", "texts")) {
        JsonNode child = graph.get(key);
        if (child != null && !child.isMissingNode() && !child.isNull() && !child.isArray()) {
          throw ApiException.unprocessable(key + " must be an array");
        }
      }
    }
    requireArrayOrAbsent("nodes", nodes);
    requireArrayOrAbsent("edges", edges);
    requireArrayOrAbsent("strokes", strokes);
    requireArrayOrAbsent("texts", texts);
  }

  private static void requireArrayOrAbsent(String name, JsonNode value) {
    if (value != null && !value.isMissingNode() && !value.isNull() && !value.isArray()) {
      throw ApiException.unprocessable(name + " must be an array");
    }
  }

  @Transactional
  public void delete(UUID ownerId, UUID id) {
    readiness.requireReady();
    Optional<Diagram> any = diagrams.findById(id);
    if (any.isEmpty()) {
      throw ApiException.notFound("Diagram not found: " + id);
    }
    if (!workspaceService.isMember(ownerId, any.get().workspaceId())) {
      throw ApiException.forbidden("Diagram belongs to another workspace: " + id);
    }
    UUID workspaceId = any.get().workspaceId();
    diagrams.delete(any.get());
    // Execute the delete now and detach the session: child rows (revisions,
    // checkpoints, threads, sync logs) are DB-cascaded, but their managed
    // entities would otherwise latch onto the removed diagram and poison
    // every later auto-flush in this transaction (TransientObjectException).
    entityManager.flush();
    entityManager.clear();
    audit.record(ownerId, workspaceId, "diagram.delete", "diagram", id.toString(), "ok");
  }

  /** Loads the member-visible diagram or throws 404 (scoped reads) — for nested routes. */
  @Transactional(readOnly = true)
  public Diagram requireOwnedForRead(UUID ownerId, UUID id) {
    readiness.requireReady();
    Optional<Diagram> any = diagrams.findById(id);
    if (any.isEmpty() || !workspaceService.isMember(ownerId, any.get().workspaceId())) {
      throw ApiException.notFound("Diagram not found: " + id);
    }
    return any.get();
  }

  /** Loads the member-visible diagram or throws 404/403 — for nested writes. */
  @Transactional(readOnly = true)
  public Diagram requireOwnedForWrite(UUID ownerId, UUID id) {
    readiness.requireReady();
    Optional<Diagram> any = diagrams.findById(id);
    if (any.isEmpty()) {
      throw ApiException.notFound("Diagram not found: " + id);
    }
    workspaceService.requireMember(ownerId, any.get().workspaceId());
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
    branch.setWorkspace(source.getWorkspace());
    branch.setTitle(title);
    branch.setTags(source.getTags());
    branch.setGraph(source.getGraph());
    branch.setParentDiagram(source);
    branch.setBranchName(branchName);
    Diagram saved = diagrams.saveAndFlush(branch);
    revisions.recordAndBump(saved, ownerId, "manual", "Branched from " + source.getId());
    audit.record(ownerId, saved.workspaceId(), "diagram.branch", "diagram",
        saved.getId().toString(), "ok");
    return toJson(saved);
  }

  public Map<String, Object> toJson(Diagram diagram) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", diagram.getId().toString());
    out.put("title", diagram.getTitle());
    out.put("tags", diagram.getTags());
    out.put("version", diagram.getVersion());
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
