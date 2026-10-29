package com.archflux.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.repo.WorkspaceInviteRepository;
import com.archflux.repo.WorkspaceMembershipRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/**
 * Workspace roster management (R1-E11-T02). Any member may read the roster;
 * role changes and removal are admin only. The last active admin can never be
 * demoted or removed (409 LAST_ADMIN). Removing a member keeps their
 * diagrams: ownership moves to the remover and each move is audited as
 * {@code diagram.transfer}.
 */
@Service
public class WorkspaceMemberService {

  private static final Set<String> ADMIN = Set.of("admin");
  private static final Set<String> ROLES = Set.of("admin", "editor", "reviewer", "viewer");
  private static final Set<String> SEAT_ROLES = Set.of("admin", "editor");

  private final WorkspaceService workspaceService;
  private final WorkspaceMembershipRepository memberships;
  private final WorkspaceInviteRepository invites;
  private final PlanService plans;
  private final AuditService audit;
  private final SchemaReadinessService readiness;

  @PersistenceContext
  private EntityManager em;

  public WorkspaceMemberService(WorkspaceService workspaceService,
      WorkspaceMembershipRepository memberships, WorkspaceInviteRepository invites,
      PlanService plans, AuditService audit, SchemaReadinessService readiness) {
    this.workspaceService = workspaceService;
    this.memberships = memberships;
    this.invites = invites;
    this.plans = plans;
    this.audit = audit;
    this.readiness = readiness;
  }

  /** Members for every member; pending invites only when the caller is an admin. */
  @Transactional
  public Map<String, Object> list(UUID userId, UUID requestedWorkspaceId) {
    readiness.requireReady();
    Workspace ws = workspaceService.current(userId, requestedWorkspaceId);
    String role = workspaceService.requireRole(userId, ws.getId(),
        Set.of("admin", "editor", "reviewer", "viewer"), "Workspace not found");
    List<Map<String, Object>> members =
        memberships.findRoster(ws.getId()).stream().map(WorkspaceMemberService::toJson).toList();
    java.time.Instant now = java.time.Instant.now();
    List<Map<String, Object>> pending = !ADMIN.contains(role) ? List.of()
        : invites
            .findByWorkspaceIdAndAcceptedAtIsNullAndRevokedAtIsNullOrderByCreatedAtDesc(ws.getId())
            .stream().filter(i -> i.isPending(now)).map(i -> {
              Map<String, Object> m = new LinkedHashMap<>();
              m.put("id", i.getId());
              m.put("email", i.getEmail());
              m.put("role", i.getRole());
              m.put("status", "pending");
              m.put("expiresAt", i.getExpiresAt().toString());
              m.put("createdAt", i.getCreatedAt().toString());
              return m;
            }).toList();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("members", members);
    out.put("invites", pending);
    return out;
  }

  @Transactional
  public Map<String, Object> changeRole(UUID userId, UUID requestedWorkspaceId, UUID targetId,
      String newRole) {
    readiness.requireReady();
    if (newRole == null || !ROLES.contains(newRole)) {
      throw ApiException.validation("role must be admin, editor, reviewer or viewer");
    }
    Workspace ws = adminWorkspace(userId, requestedWorkspaceId);
    WorkspaceMembership target = memberships
        .findById_WorkspaceIdAndId_UserId(ws.getId(), targetId)
        .orElseThrow(() -> ApiException.notFound("Member not found"));
    String old = target.getRole();
    if (old.equals(newRole)) {
      return toJson(target);
    }
    if ("admin".equals(old) && memberships.countActiveAdmins(ws.getId()) <= 1) {
      throw ApiException.conflict("LAST_ADMIN", "A workspace needs at least one admin");
    }
    if (SEAT_ROLES.contains(newRole) && !SEAT_ROLES.contains(old)) {
      plans.requireCanAddEditor(ws.getId());
    }
    target.setRole(newRole);
    memberships.saveAndFlush(target);
    audit.record(userId, ws.getId(), "member.update", "member", targetId.toString(), "ok");
    return toJson(target);
  }

  @Transactional
  public void remove(UUID userId, UUID requestedWorkspaceId, UUID targetId) {
    readiness.requireReady();
    Workspace ws = adminWorkspace(userId, requestedWorkspaceId);
    UUID wsId = ws.getId();
    WorkspaceMembership target = memberships
        .findById_WorkspaceIdAndId_UserId(wsId, targetId)
        .orElseThrow(() -> ApiException.notFound("Member not found"));
    if ("admin".equals(target.getRole()) && memberships.countActiveAdmins(wsId) <= 1) {
      throw ApiException.conflict("LAST_ADMIN", "A workspace needs at least one admin");
    }
    if (userId.equals(targetId)) {
      throw ApiException.validation("You cannot remove yourself from the workspace");
    }
    @SuppressWarnings("unchecked")
    List<Object> owned = em.createNativeQuery(
        "SELECT id FROM diagrams WHERE workspace_id = :ws AND owner_id = :target")
        .setParameter("ws", wsId).setParameter("target", targetId).getResultList();
    List<UUID> diagramIds = owned.stream().map(o -> UUID.fromString(o.toString())).toList();
    if (!diagramIds.isEmpty()) {
      em.createNativeQuery(
          "UPDATE diagrams SET owner_id = :remover WHERE workspace_id = :ws AND owner_id = :target")
          .setParameter("remover", userId).setParameter("ws", wsId)
          .setParameter("target", targetId).executeUpdate();
    }
    // The removed user loses every explicit grant on this workspace's diagrams.
    em.createNativeQuery(
        "DELETE FROM diagram_members WHERE user_id = :target AND diagram_id IN "
            + "(SELECT id FROM diagrams WHERE workspace_id = :ws)")
        .setParameter("target", targetId).setParameter("ws", wsId).executeUpdate();
    for (UUID diagramId : diagramIds) {
      em.createNativeQuery(
          "INSERT INTO diagram_members (diagram_id, user_id, role, added_by) "
              + "VALUES (:d, :u, 'owner', :u) "
              + "ON CONFLICT (diagram_id, user_id) DO UPDATE SET role = 'owner'")
          .setParameter("d", diagramId).setParameter("u", userId).executeUpdate();
    }
    em.flush();
    em.clear();
    memberships.deleteById(target.getId());
    memberships.flush();
    audit.record(userId, wsId, "member.remove", "member", targetId.toString(), "ok");
    for (UUID diagramId : diagramIds) {
      audit.record(userId, wsId, "diagram.transfer", "diagram", diagramId.toString(), "ok");
    }
  }

  private Workspace adminWorkspace(UUID userId, UUID requestedWorkspaceId) {
    Workspace ws = workspaceService.current(userId, requestedWorkspaceId);
    workspaceService.requireRole(userId, ws.getId(), ADMIN, "Workspace not found");
    return ws;
  }

  private static Map<String, Object> toJson(WorkspaceMembership m) {
    User u = m.getUser();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("userId", m.getId().getUserId());
    out.put("email", u.getEmail());
    out.put("name", u.getName());
    out.put("role", m.getRole());
    out.put("status", m.getStatus());
    out.put("joinedAt", m.getCreatedAt() == null ? null : m.getCreatedAt().toString());
    return out;
  }
}
