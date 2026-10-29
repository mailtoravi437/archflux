package com.archflux.service;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Diagram;
import com.archflux.domain.DiagramStar;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.repo.DiagramRepository;
import com.archflux.repo.DiagramStarRepository;
import com.archflux.repo.UserRepository;
import com.archflux.security.ShareTokens;
import com.archflux.service.AccessService.Action;
import com.archflux.service.AccessService.DiagramRole;
import com.archflux.util.JsonCanonicals;
import com.archflux.util.LikeEscape;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import jakarta.persistence.EntityManager;

/**
 * Diagram CRUD scoped to the requesting user's workspaces. Every access check
 * goes through {@link AccessService} (R1-E07-T01): no access at all is 404
 * (reads and writes alike, never confirming existence); a role that is too
 * low is 403.
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
  private final FolderService folderService;
  private final DiagramStarRepository stars;
  private final AccessService access;
  private final PlanService planService;
  private final ObjectMapper mapper = JsonCanonicals.baseMapper();

  public ObjectMapper getMapper() {
    return mapper;
  }

  public DiagramService(DiagramRepository diagrams, UserRepository users,
      WorkspaceService workspaceService, SchemaReadinessService readiness,
      RevisionService revisions, AuditService audit, MeterRegistry meters,
      EntityManager entityManager, FolderService folderService, DiagramStarRepository stars,
      AccessService access, PlanService planService) {
    this.diagrams = diagrams;
    this.users = users;
    this.workspaceService = workspaceService;
    this.readiness = readiness;
    this.revisions = revisions;
    this.audit = audit;
    this.meters = meters;
    this.entityManager = entityManager;
    this.folderService = folderService;
    this.stars = stars;
    this.access = access;
    this.planService = planService;
  }

  /** Trash retention (DATA_MODEL_R1 §4.2): 30 days, 90 on the team plan. */
  public static Duration retentionFor(String plan) {
    return Duration.ofDays("team".equals(plan) ? 90 : 30);
  }

  /** Library list filters (R1-E06-T02); {@code folderId} null = all, "root" = no folder. */
  public record ListFilter(String folderId, boolean starred, boolean trashed, String sort) {
    public static final ListFilter NONE = new ListFilter(null, false, false, "updated");
  }

  public record PageResult<T>(List<T> items, long total) {
  }

  @Transactional(readOnly = true)
  public PageResult<Map<String, Object>> list(UUID ownerId, int page, int limit, String q) {
    return list(ownerId, page, limit, q, ListFilter.NONE);
  }

  /**
   * Workspace-scoped library feed. Trashed rows appear only with
   * {@code trashed=true} (and then only trashed rows, with {@code purgeAt}).
   * The JPQL is assembled from constant fragments; every value is bound.
   */
  @Transactional(readOnly = true)
  public PageResult<Map<String, Object>> list(UUID ownerId, int page, int limit, String q,
      ListFilter filter) {
    readiness.requireReady();
    ListFilter f = filter == null ? ListFilter.NONE : filter;
    int safeLimit = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
    int safePage = Math.max(page, 1);
    String sort = f.sort() == null || f.sort().isBlank() ? "updated" : f.sort();
    if (!sort.equals("updated") && !sort.equals("title")) {
      throw ApiException.validation("sort must be 'updated' or 'title'");
    }
    UUID folderId = null;
    boolean rootOnly = false;
    if (f.folderId() != null && !f.folderId().isBlank()) {
      if (f.folderId().equals("root")) {
        rootOnly = true;
      } else {
        try {
          folderId = UUID.fromString(f.folderId());
        } catch (IllegalArgumentException e) {
          throw ApiException.validation("folderId must be a UUID or 'root'");
        }
      }
    }
    List<UUID> workspaceIds = workspaceService.workspaceIdsFor(ownerId);
    if (workspaceIds.isEmpty()) {
      return new PageResult<>(List.of(), 0);
    }
    StringBuilder where = new StringBuilder(" FROM Diagram d WHERE d.workspace.id IN :ws");
    where.append(f.trashed() ? " AND d.deletedAt IS NOT NULL" : " AND d.deletedAt IS NULL");
    boolean search = q != null && !q.isBlank();
    if (search) {
      where.append(" AND LOWER(d.title) LIKE LOWER(:pattern) ESCAPE '\\'");
    }
    if (rootOnly) {
      where.append(" AND d.folderId IS NULL");
    } else if (folderId != null) {
      where.append(" AND d.folderId = :folderId");
    }
    if (f.starred()) {
      where.append(" AND EXISTS (SELECT 1 FROM DiagramStar s"
          + " WHERE s.id.diagramId = d.id AND s.id.userId = :uid)");
    }
    String order = sort.equals("title")
        ? " ORDER BY LOWER(d.title) ASC, d.updatedAt DESC"
        : (f.trashed() ? " ORDER BY d.deletedAt DESC" : " ORDER BY d.updatedAt DESC");
    var rows = entityManager.createQuery("SELECT d" + where + order, Diagram.class);
    var count = entityManager.createQuery("SELECT COUNT(d)" + where, Long.class);
    for (var query : List.of(rows, count)) {
      query.setParameter("ws", workspaceIds);
      if (search) {
        query.setParameter("pattern", "%" + LikeEscape.escape(q) + "%");
      }
      if (folderId != null) {
        query.setParameter("folderId", folderId);
      }
      if (f.starred()) {
        query.setParameter("uid", ownerId);
      }
    }
    List<Diagram> page0 = rows.setFirstResult((safePage - 1) * safeLimit)
        .setMaxResults(safeLimit).getResultList();
    long total = count.getSingleResult();
    Set<UUID> starred = page0.isEmpty() ? Set.of()
        : new HashSet<>(stars.starredAmong(ownerId, page0.stream().map(Diagram::getId).toList()));
    Map<UUID, DiagramRole> roles = access.effectiveRoles(ownerId, page0);
    List<Map<String, Object>> items = page0.stream().map(d -> {
      Map<String, Object> item = toJson(d);
      item.put("starred", starred.contains(d.getId()));
      DiagramRole role = roles.get(d.getId());
      item.put("role", role == null ? null : role.wire());
      if (f.trashed()) {
        item.put("purgeAt", purgeAtOf(d));
      }
      return item;
    }).toList();
    return new PageResult<>(items, total);
  }

  private String purgeAtOf(Diagram diagram) {
    if (diagram.getDeletedAt() == null) {
      return null;
    }
    String plan = diagram.getWorkspace() == null ? null : diagram.getWorkspace().getPlan();
    return diagram.getDeletedAt().plus(retentionFor(plan)).toString();
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
    planService.requireCanCreateDiagram(workspace.getId());
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
    access.grantOwner(saved.getId(), ownerId);
    revisions.recordAndBump(saved, ownerId, source, "Created diagram");
    audit.record(ownerId, saved.workspaceId(), "diagram.create", "diagram",
        saved.getId().toString(), "ok");
    return toJson(saved);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> get(UUID ownerId, UUID id) {
    readiness.requireReady();
    String token = ShareTokens.current();
    Diagram diagram = access.require(ownerId, id, Action.VIEW, token);
    Map<String, Object> out = toJson(diagram);
    out.put("role", access.roleOn(ownerId, diagram, token).map(DiagramRole::wire).orElse(null));
    return out;
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
    return update(ownerId, id, title, tags, graph, nodes, edges, strokes, texts, graphProvided,
        tagsProvided, expectedVersion, force, source, null);
  }

  /** As above with an explicit revision message (null = the default "Updated diagram"). */
  @Transactional
  public Map<String, Object> update(UUID ownerId, UUID id, String title, List<String> tags,
      JsonNode graph, JsonNode nodes, JsonNode edges, JsonNode strokes, JsonNode texts,
      boolean graphProvided, boolean tagsProvided, Long expectedVersion, boolean force,
      String source, String revisionMessage) {
    readiness.requireReady();
    Diagram diagram = access.require(ownerId, id, Action.EDIT, ShareTokens.current());
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
    revisions.recordAndBump(saved, ownerId, source,
        revisionMessage != null ? revisionMessage
            : force ? "Forced update" : "Updated diagram");
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
      for (String key : List.of("nodes", "edges", "strokes", "texts", "pages", "layers")) {
        JsonNode child = graph.get(key);
        if (child != null && !child.isMissingNode() && !child.isNull() && !child.isArray()) {
          throw ApiException.unprocessable(key + " must be an array");
        }
      }
      JsonNode defaults = graph.get("defaults");
      if (defaults != null && !defaults.isMissingNode() && !defaults.isNull()
          && !defaults.isObject()) {
        throw ApiException.unprocessable("defaults must be an object");
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

  /**
   * Moves the diagram to the trash (soft delete, R1-E06-T02): sets
   * {@code deleted_at}; nothing is removed until purge. No access is 404
   * (R1-E07-T01); below editor is 403.
   */
  @Transactional
  public void delete(UUID ownerId, UUID id) {
    readiness.requireReady();
    Diagram diagram = access.require(ownerId, id, Action.TRASH, ShareTokens.current());
    diagram.setDeletedAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
    diagrams.saveAndFlush(diagram);
    audit.record(ownerId, diagram.workspaceId(), "diagram.trash", "diagram", id.toString(), "ok");
  }

  /**
   * Restores a trashed diagram. When its folder is gone or still trashed it
   * goes back to the library root; {@code restoredTo} says where it landed.
   */
  @Transactional
  public Map<String, Object> restore(UUID ownerId, UUID id) {
    readiness.requireReady();
    Diagram diagram = access.requireTrashed(ownerId, id, Action.TRASH);
    if (diagram.getFolderId() != null && !folderService.isLive(diagram.getFolderId())) {
      diagram.setFolderId(null);
    }
    diagram.setDeletedAt(null);
    Diagram saved = diagrams.saveAndFlush(diagram);
    entityManager.refresh(saved);
    audit.record(ownerId, saved.workspaceId(), "diagram.untrash", "diagram", id.toString(), "ok");
    Map<String, Object> out = toJson(saved);
    out.put("restoredTo", saved.getFolderId() == null ? "root" : "folder");
    return out;
  }

  /**
   * Deletes a trashed diagram forever. Only a workspace admin or the owner,
   * and only with the exact (case-sensitive) title typed as confirmation.
   */
  @Transactional
  public void purge(UUID ownerId, UUID id, String confirmTitle) {
    readiness.requireReady();
    // PURGE needs OWNER: an owner member row, or workspace admin (mapped to owner).
    Diagram diagram = access.requireTrashed(ownerId, id, Action.PURGE);
    if (confirmTitle == null || !confirmTitle.equals(diagram.getTitle())) {
      throw ApiException.unprocessable("TITLE_MISMATCH",
          "confirmTitle must match the diagram title exactly");
    }
    UUID workspaceId = diagram.workspaceId();
    hardDelete(diagram);
    audit.record(ownerId, workspaceId, "diagram.purge", "diagram", id.toString(), "ok");
  }

  /** Stars (idempotent) or unstars a live diagram for the caller. Any member role may star. */
  @Transactional
  public void setStarred(UUID ownerId, UUID id, boolean starred) {
    readiness.requireReady();
    Diagram diagram = requireOwnedForRead(ownerId, id);
    DiagramStar.Key key = new DiagramStar.Key(ownerId, id);
    if (starred && !stars.existsById(key)) {
      stars.saveAndFlush(new DiagramStar(ownerId, id));
    } else if (!starred && stars.existsById(key)) {
      stars.deleteById(key);
      stars.flush();
    }
    audit.record(ownerId, diagram.workspaceId(), starred ? "diagram.star" : "diagram.unstar",
        "diagram", id.toString(), "ok");
  }

  /** Moves a live diagram to a folder of the same workspace, or to the root (null). */
  @Transactional
  public Map<String, Object> move(UUID ownerId, UUID id, UUID folderId) {
    readiness.requireReady();
    Diagram diagram = access.require(ownerId, id, Action.EDIT, ShareTokens.current());
    if (folderId != null) {
      folderService.requireLiveTarget(diagram.workspaceId(), folderId);
    }
    diagram.setFolderId(folderId);
    Diagram saved = diagrams.saveAndFlush(diagram);
    entityManager.refresh(saved);
    audit.record(ownerId, saved.workspaceId(), "diagram.move", "diagram", id.toString(), "ok");
    return toJson(saved);
  }

  /** The pre-R1 hard delete, now reachable only through purge. */
  private void hardDelete(Diagram diagram) {
    diagrams.delete(diagram);
    // Execute the delete now and detach the session: child rows (revisions,
    // checkpoints, threads, sync logs, stars) are DB-cascaded, but their managed
    // entities would otherwise latch onto the removed diagram and poison
    // every later auto-flush in this transaction (TransientObjectException).
    entityManager.flush();
    entityManager.clear();
  }

  /**
   * Loads a live diagram the caller may VIEW (a share link on the current
   * request counts) or throws 404 — for nested read routes.
   */
  @Transactional(readOnly = true)
  public Diagram requireOwnedForRead(UUID ownerId, UUID id) {
    return requireFor(ownerId, id, Action.VIEW);
  }

  /** Loads a live diagram the caller may EDIT, else 404 (no access) / 403 (role too low). */
  @Transactional(readOnly = true)
  public Diagram requireOwnedForWrite(UUID ownerId, UUID id) {
    return requireFor(ownerId, id, Action.EDIT);
  }

  /** Loads a live diagram the caller may perform {@code action} on (see {@link AccessService#require}). */
  @Transactional(readOnly = true)
  public Diagram requireFor(UUID userId, UUID id, Action action) {
    readiness.requireReady();
    return access.require(userId, id, action, ShareTokens.current());
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
    access.grantOwner(saved.getId(), ownerId);
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
    out.put("folderId", diagram.getFolderId() == null ? null : diagram.getFolderId().toString());
    out.put("deletedAt", diagram.getDeletedAt() == null ? null : diagram.getDeletedAt().toString());
    Map<String, Object> graph = readGraphAsMap(diagram.getGraph());
    out.put("graph", graph);
    out.put("nodes", graph.getOrDefault("nodes", List.of()));
    out.put("edges", graph.getOrDefault("edges", List.of()));
    out.put("strokes", graph.getOrDefault("strokes", List.of()));
    out.put("texts", graph.getOrDefault("texts", List.of()));
    out.put("pages", graph.getOrDefault("pages", List.of()));
    out.put("layers", graph.getOrDefault("layers", List.of()));
    out.put("defaults", graph.getOrDefault("defaults", Map.of()));
    out.put("schemaVersion", graph.get("schemaVersion"));
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
