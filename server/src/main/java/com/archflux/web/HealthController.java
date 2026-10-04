package com.archflux.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.service.SchemaReadinessService;

@RestController
public class HealthController {

  private final SchemaReadinessService readiness;

  public HealthController(SchemaReadinessService readiness) {
    this.readiness = readiness;
  }

  @GetMapping("/api/health")
  public Map<String, String> health() {
    return Map.of("status", "UP");
  }

  @GetMapping("/api/ready")
  public org.springframework.http.ResponseEntity<Map<String, Object>> ready() {
    List<String> missing = readiness.missingTables();
    if (missing.isEmpty()) {
      return org.springframework.http.ResponseEntity.ok(Map.of("ready", true));
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ready", false);
    body.put("missing", missing);
    body.put("reason", "Database schema not applied — apply db/migrations/V1__init.sql with psql, then retry.");
    return org.springframework.http.ResponseEntity.status(503).body(body);
  }
}
