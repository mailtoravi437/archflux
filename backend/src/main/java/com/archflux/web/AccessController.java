package com.archflux.web;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.security.RequestUser;
import com.archflux.service.AccessRequestService;
import com.archflux.web.dto.AccessDecisionRequest;
import com.archflux.web.dto.AccessRequestCreateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

/** FL-15 access states and access requests (R1-E07-T04). */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Access", description = "Access states and access requests")
public class AccessController {

  private final AccessRequestService accessRequests;

  public AccessController(AccessRequestService accessRequests) {
    this.accessRequests = accessRequests;
  }

  @Operation(summary = "Access state for a diagram",
      description = "Always 200: ok | trashed | expired | request | not_found")
  @GetMapping("/diagrams/{id}/access")
  public Map<String, Object> access(HttpServletRequest request, @PathVariable UUID id) {
    return Map.of("data", accessRequests.accessState(RequestUser.get(request), id));
  }

  @Operation(summary = "Request access", description = "Only when the access state is 'request'")
  @PostMapping("/diagrams/{id}/access-requests")
  public ResponseEntity<Map<String, Object>> requestAccess(HttpServletRequest request,
      @PathVariable UUID id, @Valid @RequestBody AccessRequestCreateRequest body) {
    Map<String, Object> created =
        accessRequests.create(RequestUser.get(request), id, body.getRole(), body.getNote());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("data", created));
  }

  @Operation(summary = "Access requests on diagrams the caller can share")
  @GetMapping("/access-requests")
  public Map<String, Object> list(HttpServletRequest request,
      @RequestParam(defaultValue = "pending") String status) {
    return Map.of("data", accessRequests.list(RequestUser.get(request), status));
  }

  @Operation(summary = "Approve an access request", description = "Optional body {role} to grant less")
  @PostMapping("/access-requests/{requestId}/approve")
  public Map<String, Object> approve(HttpServletRequest request, @PathVariable UUID requestId,
      @Valid @RequestBody(required = false) AccessDecisionRequest body) {
    return Map.of("data", accessRequests.approve(RequestUser.get(request), requestId,
        body == null ? null : body.getRole()));
  }

  @Operation(summary = "Deny an access request")
  @PostMapping("/access-requests/{requestId}/deny")
  public Map<String, Object> deny(HttpServletRequest request, @PathVariable UUID requestId) {
    return Map.of("data", accessRequests.deny(RequestUser.get(request), requestId));
  }
}
