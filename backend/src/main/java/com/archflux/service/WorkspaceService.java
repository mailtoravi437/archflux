package com.archflux.service;

import java.util.List;
import java.util.UUID;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.repo.UserRepository;
import com.archflux.repo.WorkspaceMembershipRepository;
import com.archflux.repo.WorkspaceRepository;

/**
 * Workspace boundary (PROD-002): every resource query is scoped by workspace
 * plus authorized membership. PostgreSQL RLS (V6) is defense in depth; these
 * service-layer checks are the primary gate and produce the 404/403
 * semantics the API contract requires.
 */
@Service
public class WorkspaceService {

  private final WorkspaceRepository workspaces;
  private final WorkspaceMembershipRepository memberships;
  private final UserRepository users;
  private final SchemaReadinessService readiness;

  @PersistenceContext
  private EntityManager entityManager;

  public WorkspaceService(WorkspaceRepository workspaces,
      WorkspaceMembershipRepository memberships, UserRepository users,
      SchemaReadinessService readiness) {
    this.workspaces = workspaces;
    this.memberships = memberships;
    this.users = users;
    this.readiness = readiness;
  }

  /** Workspace ids the user belongs to (empty when unknown — never null). */
  @Transactional(readOnly = true)
  public List<UUID> workspaceIdsFor(UUID userId) {
    if (userId == null) {
      return List.of();
    }
    readiness.requireReady();
    return memberships.findById_UserId(userId).stream()
        .map(m -> m.getId().getWorkspaceId())
        .filter(id -> id != null)
        .distinct()
        .toList();
  }

  @Transactional(readOnly = true)
  public boolean isMember(UUID userId, UUID workspaceId) {
    if (userId == null || workspaceId == null) {
      return false;
    }
    readiness.requireReady();
    return memberships.existsById_WorkspaceIdAndId_UserId(workspaceId, userId);
  }

  /**
   * Throws 403 FORBIDDEN when the user holds no membership in the workspace.
   * Read paths map foreign rows to 404 themselves (see callers).
   */
  @Transactional(readOnly = true)
  public void requireMember(UUID userId, UUID workspaceId) {
    readiness.requireReady();
    if (!isMember(userId, workspaceId)) {
      throw ApiException.forbidden("Not a member of workspace: " + workspaceId);
    }
  }

  /**
   * Membership role, or null when not a member. Lives here (not in callers)
   * because RLS-scoped reads MUST run inside a {@code @Transactional} service
   * method: the identity aspect publishes the GUCs only there. A direct
   * repository call from a controller runs GUC-less, RLS fail-closes, and the
   * lookup silently returns empty (live audit-export 403, Phase 2).
   */
  @Transactional(readOnly = true)
  public String roleOf(UUID userId, UUID workspaceId) {
    readiness.requireReady();
    if (userId == null || workspaceId == null) {
      return null;
    }
    return memberships.findById_WorkspaceIdAndId_UserId(workspaceId, userId)
        .map(WorkspaceMembership::getRole)
        .orElse(null);
  }

  /**
   * The caller's current workspace (R1-E11-T01): the workspace named by the
   * {@code X-Workspace-ID} header when present, else the personal one. A
   * workspace the caller does not belong to is a 404, never a 403.
   */
  @Transactional
  public Workspace current(UUID userId, UUID requestedId) {
    if (requestedId == null) {
      return resolvePersonalWorkspace(userId);
    }
    if (!isMember(userId, requestedId)) {
      throw ApiException.notFound("Workspace not found");
    }
    return workspaces.findById(requestedId)
        .orElseThrow(() -> ApiException.notFound("Workspace not found"));
  }

  /** The workspace row, or 404. Callers must have checked membership themselves. */
  @Transactional(readOnly = true)
  public Workspace requireWorkspace(UUID workspaceId) {
    return workspaces.findById(workspaceId)
        .orElseThrow(() -> ApiException.notFound("Workspace not found"));
  }

  /** Workspace roles allowed to change content (folders, trash, moves). */
  public static final java.util.Set<String> WRITER_ROLES = java.util.Set.of("admin", "editor");

  /**
   * Role gate for writes (CONVENTIONS §2.2): not a member → 404 with
   * {@code notFoundMessage} (never confirms the resource exists); a member
   * whose role is not in {@code allowed} → 403. Returns the caller's role.
   */
  @Transactional(readOnly = true)
  public String requireRole(UUID userId, UUID workspaceId, java.util.Set<String> allowed,
      String notFoundMessage) {
    String role = roleOf(userId, workspaceId);
    if (role == null) {
      throw ApiException.notFound(notFoundMessage);
    }
    if (!allowed.contains(role)) {
      throw ApiException.forbidden("Role '" + role + "' cannot perform this action");
    }
    return role;
  }

  /**
   * Login-time provisioning (Phase 1): the ONLY writer for login-time user
   * upserts. Auth paths (filter, OAuth success, magic-link verify) run
   * outside {@code @Transactional} service scope with no RequestUser yet, so
   * the identity aspect cannot authorize them — and users_modify_admin denies
   * user-row writes to non-admins. Delegates to the SECURITY DEFINER
   * {@code provision_user()} function (owner's rights, locked search_path),
   * which upserts by id-or-email, refreshes profile + last_login_at, and
   * ensures a personal workspace + admin membership. Returns the user id
   * (presented id, adopted email row, or fresh id — never null).
   */
  @Transactional
  public UUID provisionLogin(UUID id, String email, String name, String role,
      String provider, String providerId, String avatarUrl, String accessToken) {
    readiness.requireReady();
    UUID key = id != null ? id : UUID.randomUUID();
    String mail = email != null ? email.toLowerCase()
        : "user-" + key + "@archflux.local";
    Object out = entityManager.createNativeQuery(
            "SELECT public.provision_user(:id, :email, :name, :role, :provider, :providerId, :avatar, :accessToken)")
        // Do NOT auto-flush pending business state here: AuthFilter runs
        // before the controller, and the pre-Phase-1 code resolved users via
        // em.find() (which never flushes). Flushing mid-filter would change
        // flush timing for the business transaction that follows; the
        // function is self-contained SQL and needs no session state.
        .setFlushMode(jakarta.persistence.FlushModeType.COMMIT)
        .setParameter("id", key)
        .setParameter("email", mail)
        .setParameter("name", orEmpty(name))
        .setParameter("role", orEmpty(role))
        .setParameter("provider", orEmpty(provider))
        .setParameter("providerId", orEmpty(providerId))
        .setParameter("avatar", orEmpty(avatarUrl))
        .setParameter("accessToken", orEmpty(accessToken))
        .getSingleResult();
    if (out instanceof UUID uuid) {
      return uuid;
    }
    throw new IllegalStateException(
        "provision_user returned non-UUID: " + (out == null ? "null" : out.getClass()));
  }

  private static String orEmpty(String value) {
    return value == null ? "" : value;
  }

  /**
   * Returns the user's personal workspace, lazily creating a personal
   * workspace plus admin membership for users predating the V6 backfill (or
   * brand-new UUIDs, whose User row is provisioned here as well).
   */
  @Transactional
  public Workspace resolvePersonalWorkspace(UUID userId) {
    readiness.requireReady();
    if (userId == null) {
      throw ApiException.validation("user id is required");
    }
    User user = users.findById(userId).orElseGet(() -> {
      UUID provisioned = provisionLogin(userId,
          "user-" + userId + "@archflux.local", "User", "member",
          null, null, null, null);
      return users.findById(provisioned).orElseThrow(() ->
          new IllegalStateException("provisioned user missing: " + provisioned));
    });

    List<WorkspaceMembership> roster = memberships.findById_UserId(user.getId());
    if (!roster.isEmpty() && roster.get(0).getWorkspace() != null) {
      return roster.get(0).getWorkspace();
    }
    if (!roster.isEmpty() && roster.get(0).getId().getWorkspaceId() != null) {
      UUID existingId = roster.get(0).getId().getWorkspaceId();
      return workspaces.findById(existingId)
          .orElseThrow(() -> ApiException.notFound("Workspace not found: " + existingId));
    }

    String name = user.getName();
    Workspace workspace = new Workspace(
        name == null || name.isBlank() ? "Personal" : name + "'s workspace");
    workspace = workspaces.saveAndFlush(workspace);
    WorkspaceMembership membership =
        new WorkspaceMembership(workspace, user, "admin", "active");
    memberships.saveAndFlush(membership);
    return workspace;
  }
}
