package com.archflux.service;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Workspace;
import com.archflux.repo.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/**
 * Plan limits (R1-E11-T01, DATA_MODEL_R1 §4.4). Limits are computed from
 * {@code workspaces.plan}, not stored. Only creates are limited; reads,
 * updates, exports and deletes never are.
 */
@Service
public class PlanService {

  public static final int UNLIMITED = Integer.MAX_VALUE;

  public record PlanLimits(int cloudDiagrams, int editors, int historyDays, boolean proposals,
      int connectors) {
  }

  public record Usage(int cloudDiagrams, int editors) {
  }

  private static final PlanLimits FREE = new PlanLimits(3, 3, 30, false, 0);
  private static final PlanLimits TEAM = new PlanLimits(UNLIMITED, UNLIMITED, 365, true, 2);
  private static final PlanLimits ENTERPRISE =
      new PlanLimits(UNLIMITED, UNLIMITED, UNLIMITED, true, UNLIMITED);

  private final WorkspaceRepository workspaces;

  @PersistenceContext
  private EntityManager entityManager;

  public PlanService(WorkspaceRepository workspaces) {
    this.workspaces = workspaces;
  }

  /** free | team | enterprise; anything else (including the legacy 'member') is free. */
  public PlanLimits limitsFor(String plan) {
    if ("team".equals(plan)) {
      return TEAM;
    }
    if ("enterprise".equals(plan)) {
      return ENTERPRISE;
    }
    return FREE;
  }

  @Transactional(readOnly = true)
  public PlanLimits limitsOf(UUID workspaceId) {
    return limitsFor(planOf(workspaceId));
  }

  @Transactional(readOnly = true)
  public Usage usage(UUID workspaceId) {
    Number diagrams = entityManager.createQuery(
        "SELECT COUNT(d) FROM Diagram d WHERE d.workspace.id = :ws AND d.deletedAt IS NULL",
        Long.class).setParameter("ws", workspaceId).getSingleResult();
    Number editors = entityManager.createQuery(
        "SELECT COUNT(m) FROM WorkspaceMembership m WHERE m.id.workspaceId = :ws "
            + "AND m.role IN ('admin','editor') AND m.status = 'active'",
        Long.class).setParameter("ws", workspaceId).getSingleResult();
    return new Usage(diagrams.intValue(), editors.intValue());
  }

  @Transactional(readOnly = true)
  public void requireCanCreateDiagram(UUID workspaceId) {
    int max = limitsOf(workspaceId).cloudDiagrams();
    int current = usage(workspaceId).cloudDiagrams();
    if (current >= max) {
      throw ApiException.limitReached("cloudDiagrams", current, max);
    }
  }

  @Transactional(readOnly = true)
  public void requireCanAddEditor(UUID workspaceId) {
    int max = limitsOf(workspaceId).editors();
    int current = usage(workspaceId).editors();
    if (current >= max) {
      throw ApiException.limitReached("editors", current, max);
    }
  }

  /**
   * Seat check for an invite accept. The invitee is not a member yet, so the RLS-scoped
   * count in {@link #usage} would read 0; this uses the SECURITY DEFINER
   * {@code workspace_editor_seat_count} (V19), which answers only for members and live
   * invitees. If it returns NULL the RLS-scoped count is used.
   */
  @Transactional(readOnly = true)
  public void requireCanAddEditorForInvitee(UUID workspaceId) {
    int max = limitsOf(workspaceId).editors();
    Number counted = (Number) entityManager
        .createNativeQuery("SELECT public.workspace_editor_seat_count(:ws)")
        .setParameter("ws", workspaceId).getSingleResult();
    int current = counted != null ? counted.intValue() : usage(workspaceId).editors();
    if (current >= max) {
      throw ApiException.limitReached("editors", current, max);
    }
  }

  private String planOf(UUID workspaceId) {
    return workspaces.findById(workspaceId).map(Workspace::getPlan).orElse(null);
  }
}
