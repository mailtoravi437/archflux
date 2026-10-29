package com.archflux.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.repo.WorkspaceMembershipRepository;
import com.archflux.security.RequestUser;
import com.archflux.service.ApiException;
import com.archflux.service.AuditService;
import com.archflux.service.WorkspaceService;
import jakarta.servlet.http.HttpServletRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Audit export (PROD-009): workspace audit trail for admins. Requires
 * workspace membership AND the admin role (403 otherwise); unauthenticated
 * callers are rejected 401 upstream. The export call itself is audited.
 */
@RestController
@RequestMapping("/api/v1/audit")
@Tag(name = "Audit", description = "Workspace audit trail export")
public class AuditController {

  private final AuditService audit;
  private final WorkspaceService workspaces;

  public AuditController(AuditService audit, WorkspaceService workspaces) {
    this.audit = audit;
    this.workspaces = workspaces;
  }

  @Operation(summary = "Export audit events", description = "Newest-first audit trail for a workspace (admin only)")
  @GetMapping
  public Map<String, Object> export(HttpServletRequest request,
      @RequestParam(required = false) UUID workspaceId,
      @RequestParam(required = false) String action,
      @RequestParam(defaultValue = "50") int limit) {
    if (workspaceId == null) {
      throw ApiException.validation("workspaceId query parameter is required");
    }
    UUID actorId = RequestUser.get(request);
    workspaces.requireMember(actorId, workspaceId);
    String role = workspaces.roleOf(actorId, workspaceId);
    if (!"admin".equalsIgnoreCase(role)) {
      throw ApiException.forbidden("Audit export requires the admin role");
    }
    audit.record(actorId, workspaceId, "audit.export", "audit",
        workspaceId.toString(), "ok");
    List<Map<String, Object>> rows = audit.list(workspaceId, action, limit);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("data", rows);
    out.put("total", rows.size());
    return out;
  }
}
