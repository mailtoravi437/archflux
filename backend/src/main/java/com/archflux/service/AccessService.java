package com.archflux.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Diagram;
import com.archflux.domain.DiagramMember;
import com.archflux.repo.DiagramMemberRepository;
import com.archflux.repo.DiagramRepository;
import com.archflux.security.ShareTokens;
import jakarta.persistence.EntityManager;

/**
 * Effective diagram role (R1-E07-T01, DATA_MODEL_R1 §4.3): the highest of the
 * explicit {@code diagram_members} row (the creator's owner row is written on
 * create and backfilled by V11), the mapped workspace role, and a live share
 * link presented in {@code X-Share-Token}. No access at all is a 404 that
 * never confirms the diagram exists; a role that is too low is a 403.
 */
@Service
public class AccessService {

  /** Diagram roles, ordered lowest to highest. */
  public enum DiagramRole {
    VIEWER, COMMENTER, EDITOR, OWNER;

    public boolean atLeast(DiagramRole r) {
      return compareTo(r) >= 0;
    }

    /** Wire / DB spelling: lower case. */
    public String wire() {
      return name().toLowerCase(Locale.ROOT);
    }

    /** Parses the wire spelling; null when unknown. */
    public static DiagramRole fromWire(String value) {
      if (value == null) {
        return null;
      }
      for (DiagramRole role : values()) {
        if (role.wire().equals(value)) {
          return role;
        }
      }
      return null;
    }

    static DiagramRole max(DiagramRole a, DiagramRole b) {
      if (a == null) {
        return b;
      }
      if (b == null) {
        return a;
      }
      return a.atLeast(b) ? a : b;
    }
  }

  public enum Action { VIEW, COMMENT, EDIT, SHARE, TRASH, PURGE }

  /** A share link as resolved from a token hash (expired / revoked included). */
  public record LinkInfo(UUID id, UUID diagramId, UUID workspaceId, String role,
      String audience, Instant expiresAt, Instant revokedAt) {

    public boolean live(Instant now) {
      return revokedAt == null && (expiresAt == null || expiresAt.isAfter(now));
    }
  }

  private final DiagramRepository diagrams;
  private final DiagramMemberRepository members;
  private final WorkspaceService workspaces;
  private final SchemaReadinessService readiness;
  private final EntityManager entityManager;

  public AccessService(DiagramRepository diagrams, DiagramMemberRepository members,
      WorkspaceService workspaces, SchemaReadinessService readiness, EntityManager entityManager) {
    this.diagrams = diagrams;
    this.members = members;
    this.workspaces = workspaces;
    this.readiness = readiness;
    this.entityManager = entityManager;
  }

  static DiagramRole minimumFor(Action a) {
    return switch (a) {
      case VIEW -> DiagramRole.VIEWER;
      case COMMENT -> DiagramRole.COMMENTER;
      case EDIT, TRASH, SHARE -> DiagramRole.EDITOR;
      case PURGE -> DiagramRole.OWNER;
    };
  }

  /** Workspace role mapping (§4.3): admin→owner, editor→editor, reviewer→commenter, viewer→viewer. */
  static DiagramRole fromWorkspaceRole(String role) {
    if (role == null) {
      return null;
    }
    return switch (role) {
      case "admin" -> DiagramRole.OWNER;
      case "editor" -> DiagramRole.EDITOR;
      case "reviewer" -> DiagramRole.COMMENTER;
      case "viewer" -> DiagramRole.VIEWER;
      default -> null;
    };
  }

  /** Highest of: explicit member row, workspace role mapping, valid share link token (may be null). Empty = no access. */
  @Transactional(readOnly = true)
  public Optional<DiagramRole> effectiveRole(UUID userId, UUID diagramId, @Nullable String shareToken) {
    readiness.requireReady();
    return diagrams.findById(diagramId)
        .flatMap(d -> roleOn(userId, d, shareToken));
  }

  /** Role on an already-loaded diagram (live or trashed). */
  @Transactional(readOnly = true)
  public Optional<DiagramRole> roleOn(UUID userId, Diagram diagram, @Nullable String shareToken) {
    DiagramRole best = null;
    if (userId != null) {
      best = members.findById(new DiagramMember.Key(diagram.getId(), userId))
          .map(m -> DiagramRole.fromWire(m.getRole())).orElse(null);
      best = DiagramRole.max(best,
          fromWorkspaceRole(workspaces.roleOf(userId, diagram.workspaceId())));
    }
    if (shareToken != null && diagram.getDeletedAt() == null) {
      best = DiagramRole.max(best, linkRole(userId, diagram, shareToken));
    }
    return Optional.ofNullable(best);
  }

  /** Role granted by a live link for this diagram; workspace links need membership. */
  private DiagramRole linkRole(UUID userId, Diagram diagram, String shareToken) {
    Optional<LinkInfo> link = resolveToken(shareToken);
    if (link.isEmpty() || !link.get().diagramId().equals(diagram.getId())
        || !link.get().live(Instant.now())) {
      return null;
    }
    if (!"anyone".equals(link.get().audience())
        && (userId == null || !workspaces.isMember(userId, link.get().workspaceId()))) {
      return null;
    }
    DiagramRole role = DiagramRole.fromWire(link.get().role());
    // Defence in depth: a link never grants more than commenter.
    return role == null || role.atLeast(DiagramRole.EDITOR) ? null : role;
  }

  /**
   * Looks a token up by its SHA-256 hash through the SECURITY DEFINER
   * {@code resolve_share_token} (a link-only request has no RLS identity).
   * Malformed tokens resolve to empty without touching the database.
   */
  @Transactional(readOnly = true)
  public Optional<LinkInfo> resolveToken(@Nullable String shareToken) {
    if (!ShareTokens.wellFormed(shareToken)) {
      return Optional.empty();
    }
    @SuppressWarnings("unchecked")
    List<Object[]> rows = entityManager.createNativeQuery(
            "SELECT r_id, r_diagram_id, r_workspace_id, r_role, r_audience, r_expires_at, r_revoked_at"
                + " FROM public.resolve_share_token(:hash)")
        .setParameter("hash", ShareTokens.hash(shareToken))
        .getResultList();
    if (rows.isEmpty()) {
      return Optional.empty();
    }
    Object[] r = rows.get(0);
    return Optional.of(new LinkInfo((UUID) r[0], (UUID) r[1], (UUID) r[2], (String) r[3],
        (String) r[4], instant(r[5]), instant(r[6])));
  }

  private static Instant instant(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Instant i) {
      return i;
    }
    if (value instanceof OffsetDateTime o) {
      return o.toInstant();
    }
    if (value instanceof Timestamp t) {
      return t.toInstant();
    }
    throw new IllegalStateException("Unexpected timestamp type " + value.getClass());
  }

  /** 404 when no access at all (no existence leak); 403 when role too low. Returns the loaded diagram. */
  @Transactional(readOnly = true)
  public Diagram require(UUID userId, UUID diagramId, Action action, @Nullable String shareToken) {
    readiness.requireReady();
    Diagram diagram = diagrams.findById(diagramId)
        .filter(d -> d.getDeletedAt() == null)
        .orElseThrow(() -> notFound(diagramId));
    check(userId, diagram, action, shareToken, diagramId);
    return diagram;
  }

  /** As {@link #require} for a diagram in the trash (restore, purge). Links never apply. */
  @Transactional(readOnly = true)
  public Diagram requireTrashed(UUID userId, UUID diagramId, Action action) {
    readiness.requireReady();
    Diagram diagram = diagrams.findById(diagramId)
        .filter(d -> d.getDeletedAt() != null)
        .orElseThrow(() -> ApiException.notFound("Diagram not in trash: " + diagramId));
    Optional<DiagramRole> role = roleOn(userId, diagram, null);
    if (role.isEmpty()) {
      throw ApiException.notFound("Diagram not in trash: " + diagramId);
    }
    requireAtLeast(role.get(), action);
    return diagram;
  }

  /** Role check for a loaded live diagram; returns the caller's role. */
  @Transactional(readOnly = true)
  public DiagramRole check(UUID userId, Diagram diagram, Action action, @Nullable String shareToken,
      UUID diagramId) {
    Optional<DiagramRole> role = roleOn(userId, diagram, shareToken);
    if (role.isEmpty()) {
      throw notFound(diagramId);
    }
    requireAtLeast(role.get(), action);
    return role.get();
  }

  private static void requireAtLeast(DiagramRole role, Action action) {
    if (!role.atLeast(minimumFor(action))) {
      throw ApiException.forbidden("Role '" + role.wire() + "' cannot " + verb(action)
          + " this diagram");
    }
  }

  private static String verb(Action action) {
    return switch (action) {
      case VIEW -> "view";
      case COMMENT -> "comment on";
      case EDIT -> "edit";
      case SHARE -> "share";
      case TRASH -> "trash or restore";
      case PURGE -> "delete forever";
    };
  }

  private static ApiException notFound(UUID diagramId) {
    return ApiException.notFound("Diagram not found: " + diagramId);
  }

  /** Effective roles (no link) for a page of diagrams: one member query, one role lookup per workspace. */
  @Transactional(readOnly = true)
  public Map<UUID, DiagramRole> effectiveRoles(UUID userId, Collection<Diagram> page) {
    Map<UUID, DiagramRole> out = new HashMap<>();
    if (userId == null || page.isEmpty()) {
      return out;
    }
    Map<UUID, DiagramRole> explicit = new HashMap<>();
    for (DiagramMember m : members.findForUserAmong(userId,
        page.stream().map(Diagram::getId).toList())) {
      explicit.put(m.diagramId(), DiagramRole.fromWire(m.getRole()));
    }
    Map<UUID, DiagramRole> byWorkspace = new HashMap<>();
    for (Diagram d : page) {
      DiagramRole ws = byWorkspace.computeIfAbsent(d.workspaceId(),
          id -> fromWorkspaceRole(workspaces.roleOf(userId, id)));
      DiagramRole best = DiagramRole.max(explicit.get(d.getId()), ws);
      if (best != null) {
        out.put(d.getId(), best);
      }
    }
    return out;
  }

  /** Writes the creator's owner row (rule 1 of §4.3). Idempotent. */
  @Transactional
  public void grantOwner(UUID diagramId, UUID userId) {
    DiagramMember.Key key = new DiagramMember.Key(diagramId, userId);
    if (!members.existsById(key)) {
      members.saveAndFlush(new DiagramMember(diagramId, userId, "owner", userId));
    }
  }
}
