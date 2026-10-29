package com.archflux.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Workspace;
import com.archflux.repo.WorkspaceRepository;
import com.archflux.web.dto.WorkspaceUpdateRequest;

/** Current-workspace read and admin update (R1-E11-T01). */
@Service
public class WorkspaceAdminService {

  private final WorkspaceService workspaceService;
  private final WorkspaceRepository workspaces;
  private final PlanService plans;
  private final AuditService audit;
  private final SchemaReadinessService readiness;

  public WorkspaceAdminService(WorkspaceService workspaceService, WorkspaceRepository workspaces,
      PlanService plans, AuditService audit, SchemaReadinessService readiness) {
    this.workspaceService = workspaceService;
    this.workspaces = workspaces;
    this.plans = plans;
    this.audit = audit;
    this.readiness = readiness;
  }

  @Transactional
  public Map<String, Object> get(UUID userId, UUID requestedWorkspaceId) {
    readiness.requireReady();
    Workspace ws = workspaceService.current(userId, requestedWorkspaceId);
    return toJson(ws, workspaceService.roleOf(userId, ws.getId()));
  }

  @Transactional
  public Map<String, Object> update(UUID userId, UUID requestedWorkspaceId,
      WorkspaceUpdateRequest body) {
    readiness.requireReady();
    if (body.getName() == null && body.getSlug() == null && body.getJoinPolicy() == null) {
      throw ApiException.validation("name, slug or joinPolicy is required");
    }
    Workspace ws = workspaceService.current(userId, requestedWorkspaceId);
    String role = workspaceService.requireRole(userId, ws.getId(), Set.of("admin"),
        "Workspace not found");
    if (body.getName() != null) {
      String name = body.getName().trim();
      if (name.isEmpty()) {
        throw ApiException.validation("name must not be blank");
      }
      ws.setName(name);
    }
    if (body.getSlug() != null && !body.getSlug().equals(ws.getSlug())) {
      if (workspaces.existsBySlugAndIdNot(body.getSlug(), ws.getId())) {
        throw ApiException.conflict("SLUG_TAKEN", "That workspace URL is already taken");
      }
      ws.setSlug(body.getSlug());
    }
    if (body.getJoinPolicy() != null) {
      ws.setJoinPolicy(body.getJoinPolicy());
    }
    try {
      workspaces.saveAndFlush(ws);
    } catch (org.springframework.dao.DataIntegrityViolationException e) {
      throw ApiException.conflict("SLUG_TAKEN", "That workspace URL is already taken");
    }
    audit.record(userId, ws.getId(), "workspace.update", "workspace", ws.getId().toString(), "ok");
    return toJson(ws, role);
  }

  private Map<String, Object> toJson(Workspace ws, String role) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", ws.getId());
    out.put("name", ws.getName());
    out.put("slug", ws.getSlug());
    out.put("plan", ws.getPlan());
    out.put("joinPolicy", ws.getJoinPolicy());
    out.put("role", role);
    out.put("limits", plans.limitsFor(ws.getPlan()));
    out.put("usage", plans.usage(ws.getId()));
    return out;
  }
}
