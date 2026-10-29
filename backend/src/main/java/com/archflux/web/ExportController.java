package com.archflux.web;

import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.security.RequestUser;
import com.archflux.service.ApiException;
import com.archflux.service.AuditService;
import com.archflux.service.DiagramService;
import com.archflux.service.ExportService;
import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/v1/export")
public class ExportController {

  private final ExportService exportService;
  private final DiagramService diagrams;
  private final AuditService audit;

  public ExportController(ExportService exportService, DiagramService diagrams,
      AuditService audit) {
    this.exportService = exportService;
    this.diagrams = diagrams;
    this.audit = audit;
  }

  @GetMapping
  public Map<String, Object> export(HttpServletRequest request,
      @RequestParam(required = false) String diagramId) {
    if (diagramId == null || diagramId.isBlank()) {
      throw ApiException.validation("diagramId query parameter is required");
    }
    UUID id;
    try {
      id = UUID.fromString(diagramId);
    } catch (IllegalArgumentException e) {
      throw ApiException.validation("Invalid diagramId: " + diagramId);
    }
    UUID actorId = RequestUser.get(request);
    // Scoped read first: foreign diagrams stay 404 here too.
    com.archflux.domain.Diagram diagram = diagrams.requireOwnedForRead(actorId, id);
    Map<String, Object> out = exportService.exportDiagram(actorId, id);
    audit.record(actorId, diagram.workspaceId(), "diagram.export", "diagram",
        id.toString(), "ok");
    return out;
  }
}
