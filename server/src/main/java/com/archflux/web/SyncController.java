package com.archflux.web;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.security.RequestUser;
import com.archflux.service.SyncService;
import com.archflux.web.dto.SyncRequest;
import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/v1/sync")
public class SyncController {

  private final SyncService syncService;

  public SyncController(SyncService syncService) {
    this.syncService = syncService;
  }

  @PostMapping
  public Map<String, Object> sync(HttpServletRequest request,
      @RequestBody(required = false) SyncRequest body) {
    UUID userId = RequestUser.get(request);
    SyncService.SyncOutcome outcome = syncService.sync(userId, RequestUser.ACTOR,
        body == null ? null : body.getDiagram(), body == null ? null : body.getUpstream());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("status", outcome.status());
    out.put("driftEvaluated", outcome.driftEvaluated());
    out.put("nodesSynced", outcome.nodesSynced());
    out.put("edgesSynced", outcome.edgesSynced());
    out.put("commitSha", outcome.commitSha());
    out.put("timestamp", outcome.timestamp() == null ? null : outcome.timestamp().toString());
    return out;
  }
}
