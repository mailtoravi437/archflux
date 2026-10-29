package com.archflux.web;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.security.RequestUser;
import com.archflux.service.ProductEventService;
import com.archflux.web.dto.EventsRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;

/** Product instrumentation intake (R1-E12-T04). */
@RestController
@RequestMapping("/api/v1/events")
@Tag(name = "Events", description = "Product events (allow-listed names, enum-like props)")
public class EventsController {

  private final ProductEventService events;

  public EventsController(ProductEventService events) {
    this.events = events;
  }

  @Operation(summary = "Ingest a batch of product events", description = "At most 50 events; 202 even when the workspace opted out")
  @PostMapping
  public ResponseEntity<Map<String, Object>> ingest(HttpServletRequest request,
      @RequestBody EventsRequest body) {
    events.ingest(RequestUser.get(request), body);
    return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("data", Map.of("accepted", true)));
  }
}
