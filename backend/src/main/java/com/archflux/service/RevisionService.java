package com.archflux.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Diagram;
import com.archflux.domain.DiagramRevision;
import com.archflux.domain.User;
import com.archflux.repo.RevisionRepository;
import com.archflux.repo.UserRepository;
import com.archflux.security.ShareTokens;
import com.archflux.service.AccessService.Action;
import com.archflux.util.JsonCanonicals;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Immutable revision history (Phase 2, PRODUCTIZATION_SPEC §7). Every diagram
 * mutation records a snapshot with parent lineage (previous latest or null)
 * and a sha256 content hash over the canonical snapshot. Revisions are never
 * updated or deleted through the application. Also computes deterministic
 * id-keyed diffs over node/edge sets.
 */
@Service
public class RevisionService {

  public static final int MAX_NAME = 80;
  public static final int MAX_DESCRIPTION = 2000;

  private final RevisionRepository revisions;
  private final AccessService access;
  private final UserRepository users;
  private final AuditService audit;
  private final DiagramService diagramService;
  private final ObjectMapper mapper = JsonCanonicals.baseMapper();

  public RevisionService(RevisionRepository revisions, AccessService access, UserRepository users,
      AuditService audit, @Lazy DiagramService diagramService) {
    this.revisions = revisions;
    this.access = access;
    this.users = users;
    this.audit = audit;
    this.diagramService = diagramService;
  }

  /**
   * Revisions of a diagram the caller may view, newest first; {@code namedOnly}
   * keeps only named versions. Each item carries {@code authorName}.
   */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> listFor(UUID userId, UUID diagramId, boolean namedOnly) {
    Diagram diagram = access.require(userId, diagramId, Action.VIEW, ShareTokens.current());
    List<DiagramRevision> rows = namedOnly
        ? revisions.findByDiagram_IdAndNameIsNotNullOrderByCreatedAtDesc(diagram.getId())
        : revisions.findByDiagram_IdOrderByCreatedAtDesc(diagram.getId());
    java.util.Set<UUID> authorIds = new java.util.HashSet<>();
    rows.forEach(r -> {
      if (r.getAuthorId() != null) {
        authorIds.add(r.getAuthorId());
      }
    });
    Map<UUID, String> names = new java.util.HashMap<>();
    for (User u : users.findAllById(authorIds)) {
      names.put(u.getId(), u.getName() == null || u.getName().isBlank() ? u.getEmail() : u.getName());
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (DiagramRevision r : rows) {
      Map<String, Object> item = toJson(r, false);
      item.put("authorName", r.getAuthorId() == null ? null : names.get(r.getAuthorId()));
      out.add(item);
    }
    return out;
  }

  /** Names (or, with a null name, un-names) a revision. Needs EDITOR on the diagram. */
  @Transactional
  public Map<String, Object> name(UUID userId, UUID diagramId, UUID revisionId, String name,
      String description) {
    Diagram diagram = access.require(userId, diagramId, Action.EDIT, ShareTokens.current());
    DiagramRevision revision = get(diagram.getId(), revisionId);
    String cleanName = name == null || name.isBlank() ? null : name.trim();
    if (cleanName != null && cleanName.length() > MAX_NAME) {
      throw ApiException.unprocessable("name must be at most " + MAX_NAME + " characters");
    }
    String cleanDescription =
        cleanName == null || description == null || description.isBlank() ? null : description.trim();
    if (cleanDescription != null && cleanDescription.length() > MAX_DESCRIPTION) {
      throw ApiException.unprocessable(
          "description must be at most " + MAX_DESCRIPTION + " characters");
    }
    revision.setName(cleanName);
    revision.setDescription(cleanDescription);
    revisions.saveAndFlush(revision);
    audit.record(userId, diagram.workspaceId(), "version.name", "revision",
        revision.getId().toString(), "ok");
    return toJson(revision, false);
  }

  /**
   * Restores a revision by writing its snapshot back as a NEW revision
   * ({@code source=restore}); history is never rewound.
   */
  @Transactional
  public Map<String, Object> restore(UUID userId, UUID diagramId, UUID revisionId) {
    Diagram diagram = access.require(userId, diagramId, Action.EDIT, ShareTokens.current());
    DiagramRevision revision = get(diagram.getId(), revisionId);
    com.fasterxml.jackson.databind.JsonNode graph;
    try {
      graph = mapper.readTree(revision.getSnapshot() == null ? "{}" : revision.getSnapshot());
    } catch (Exception e) {
      throw ApiException.unprocessable("Revision snapshot is not valid JSON");
    }
    String label = revision.getName() != null ? revision.getName()
        : revision.getId().toString().substring(0, 8);
    Map<String, Object> result = diagramService.update(userId, diagram.getId(), null, null, graph,
        null, null, null, null, true, false, null, true, "restore", "Restored " + label);
    audit.record(userId, diagram.workspaceId(), "version.restore", "revision",
        revision.getId().toString(), "ok");
    return result;
  }

  /**
   * Records a revision for the current graph of a managed diagram and bumps
   * {@code diagrams.version}. Must be called inside the caller's transaction
   * (joins it — never commits on its own).
   */
  @Transactional
  public DiagramRevision recordAndBump(Diagram diagram, UUID authorId, String source,
      String message) {
    String canonical = canonicalSnapshot(diagram.getGraph());
    DiagramRevision revision = new DiagramRevision();
    revision.setDiagram(diagram);
    revision.setParentRevision(
        revisions.findFirstByDiagram_IdOrderByCreatedAtDesc(diagram.getId()).orElse(null));
    revision.setContentHash(JsonCanonicals.sha256Hex(canonical));
    revision.setSnapshot(canonical);
    revision.setAuthorId(authorId);
    revision.setSource(source == null || source.isBlank() ? "manual" : source);
    revision.setMessage(message);
    diagram.setVersion(diagram.getVersion() + 1);
    return revisions.saveAndFlush(revision);
  }

  /** Re-canonicalizes the stored graph so the hash is stable across writers. */
  String canonicalSnapshot(String graphJson) {
    try {
      Object parsed = mapper.readValue(graphJson == null ? "{}" : graphJson, Object.class);
      if (parsed instanceof Map<?, ?>) {
        return JsonCanonicals.toCanonicalJson(parsed);
      }
      Map<String, Object> empty = new LinkedHashMap<>();
      empty.put("nodes", List.of());
      empty.put("edges", List.of());
      empty.put("strokes", List.of());
      empty.put("texts", List.of());
      return JsonCanonicals.toCanonicalJson(empty);
    } catch (Exception e) {
      Map<String, Object> empty = new LinkedHashMap<>();
      empty.put("nodes", List.of());
      empty.put("edges", List.of());
      empty.put("strokes", List.of());
      empty.put("texts", List.of());
      return JsonCanonicals.toCanonicalJson(empty);
    }
  }

  @Transactional(readOnly = true)
  public List<DiagramRevision> list(UUID diagramId) {
    return revisions.findByDiagram_IdOrderByCreatedAtDesc(diagramId);
  }

  @Transactional(readOnly = true)
  public DiagramRevision get(UUID diagramId, UUID revisionId) {
    DiagramRevision revision = revisions.findById(revisionId)
        .orElseThrow(() -> ApiException.notFound("Revision not found: " + revisionId));
    if (revision.getDiagram() == null || !revision.getDiagram().getId().equals(diagramId)) {
      throw ApiException.notFound("Revision not found: " + revisionId);
    }
    return revision;
  }

  /**
   * Deterministic diff over the union of node/edge sets, keyed by
   * {@code id}: added/removed carry {@code id/label/type}, changed carries
   * {@code id} plus the sorted differing fields (excluding {@code id}).
   */
  @Transactional(readOnly = true)
  public Map<String, Object> diff(UUID diagramId, UUID fromId, UUID toId) {
    DiagramRevision from = get(diagramId, fromId);
    DiagramRevision to = get(diagramId, toId);
    Map<String, EntityView> before = entitiesOf(from.getSnapshot());
    Map<String, EntityView> after = entitiesOf(to.getSnapshot());
    List<Map<String, Object>> added = new ArrayList<>();
    List<Map<String, Object>> removed = new ArrayList<>();
    List<Map<String, Object>> changed = new ArrayList<>();
    for (Map.Entry<String, EntityView> entry : after.entrySet()) {
      EntityView old = before.get(entry.getKey());
      if (old == null) {
        added.add(describe(entry.getValue()));
      } else if (!old.fields.equals(entry.getValue().fields)) {
        List<String> fields = new ArrayList<>();
        for (String key : new java.util.TreeSet<>(old.fields.keySet())) {
          if (!JsonCanonicals.toCanonicalJson(old.fields.get(key))
              .equals(JsonCanonicals.toCanonicalJson(entry.getValue().fields.get(key)))) {
            fields.add(key);
          }
        }
        for (String key : new java.util.TreeSet<>(entry.getValue().fields.keySet())) {
          if (!old.fields.containsKey(key) && !fields.contains(key)) {
            fields.add(key);
          }
        }
        java.util.Collections.sort(fields);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", entry.getKey());
        row.put("fields", fields);
        changed.add(row);
      }
    }
    for (Map.Entry<String, EntityView> entry : before.entrySet()) {
      if (!after.containsKey(entry.getKey())) {
        removed.add(describe(entry.getValue()));
      }
    }
    added.sort(java.util.Comparator.comparing(m -> String.valueOf(m.get("id"))));
    removed.sort(java.util.Comparator.comparing(m -> String.valueOf(m.get("id"))));
    changed.sort(java.util.Comparator.comparing(m -> String.valueOf(m.get("id"))));
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("added", added);
    out.put("removed", removed);
    out.put("changed", changed);
    return out;
  }

  private record EntityView(String id, String type, String label, Map<String, Object> fields) {
  }

  private Map<String, EntityView> entitiesOf(String snapshotJson) {
    Map<String, EntityView> out = new TreeMap<>();
    Map<String, Object> snapshot = parseMap(snapshotJson);
    for (String collection : List.of("nodes", "edges")) {
      String type = collection.equals("nodes") ? "node" : "edge";
      Object raw = snapshot.get(collection);
      for (Map<String, Object> row : JsonCanonicals.listOfMaps(raw)) {
        String id = JsonCanonicals.textOf(row, "id");
        if (id == null) {
          continue;
        }
        Map<String, Object> fields = new TreeMap<>(row);
        fields.remove("id");
        out.putIfAbsent(id,
            new EntityView(id, type, JsonCanonicals.textOf(row, "label"), fields));
      }
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> parseMap(String raw) {
    try {
      Object parsed = mapper.readValue(raw == null ? "{}" : raw, Object.class);
      if (parsed instanceof Map<?, ?> map) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
          out.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        return out;
      }
    } catch (Exception ignored) {
      // fall through to empty
    }
    return Map.of();
  }

  private static Map<String, Object> describe(EntityView view) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", view.id());
    row.put("label", view.label());
    row.put("type", view.type());
    return row;
  }

  public Map<String, Object> toJson(DiagramRevision revision, boolean includeSnapshot) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", revision.getId().toString());
    out.put("diagramId",
        revision.getDiagram() == null ? null : revision.getDiagram().getId().toString());
    out.put("parentRevisionId",
        revision.parentRevisionId() == null ? null : revision.parentRevisionId().toString());
    out.put("contentHash", revision.getContentHash());
    out.put("authorId",
        revision.getAuthorId() == null ? null : revision.getAuthorId().toString());
    out.put("source", revision.getSource());
    out.put("message", revision.getMessage());
    out.put("name", revision.getName());
    out.put("description", revision.getDescription());
    out.put("createdAt",
        revision.getCreatedAt() == null ? null : revision.getCreatedAt().toString());
    if (includeSnapshot) {
      out.put("snapshot", parseMap(revision.getSnapshot()));
    }
    return out;
  }
}
