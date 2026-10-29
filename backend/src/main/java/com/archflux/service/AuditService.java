package com.archflux.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.AuditEvent;
import com.archflux.repo.AuditEventRepository;

/**
 * Audit trail writer (PROD-009). Reads the correlation ID from MDC key
 * {@code correlationId} (set by RequestLoggingFilter). Every call is
 * best-effort and never throws — audit must not break business flows.
 */
@Service
public class AuditService {

  private static final Logger log = LoggerFactory.getLogger(AuditService.class);

  public static final int DEFAULT_LIMIT = 50;
  public static final int MAX_LIMIT = 100;

  private final AuditEventRepository events;

  public AuditService(AuditEventRepository events) {
    this.events = events;
  }

  public void record(UUID actorId, UUID workspaceId, String action, String resourceType,
      String resourceId, String outcome) {
    try {
      AuditEvent event = new AuditEvent();
      event.setActorId(actorId);
      event.setWorkspaceId(workspaceId);
      event.setAction(action);
      event.setResourceType(resourceType);
      event.setResourceId(resourceId);
      event.setOutcome(outcome == null || outcome.isBlank() ? "ok" : outcome);
      event.setCorrelationId(MDC.get("correlationId"));
      event.setMetadata("{}");
      events.save(event);
    } catch (Exception e) {
      log.warn("Audit record failed for action {}: {}", action, e.getMessage());
    }
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> list(UUID workspaceId, String action, int limit) {
    int safeLimit = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
    PageRequest page = PageRequest.of(0, safeLimit);
    List<AuditEvent> rows = (action == null || action.isBlank())
        ? events.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId, page)
        : events.findByWorkspaceIdAndActionOrderByCreatedAtDesc(workspaceId, action, page);
    return rows.stream().map(e -> {
      Map<String, Object> out = new java.util.LinkedHashMap<>();
      out.put("id", e.getId());
      out.put("actorId", e.getActorId() == null ? null : e.getActorId().toString());
      out.put("workspaceId", e.getWorkspaceId() == null ? null : e.getWorkspaceId().toString());
      out.put("action", e.getAction());
      out.put("resourceType", e.getResourceType());
      out.put("resourceId", e.getResourceId());
      out.put("outcome", e.getOutcome());
      out.put("correlationId", e.getCorrelationId());
      out.put("createdAt", e.getCreatedAt() == null ? null : e.getCreatedAt().toString());
      return out;
    }).toList();
  }
}
