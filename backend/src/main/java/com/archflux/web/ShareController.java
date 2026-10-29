package com.archflux.web;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.security.RequestUser;
import com.archflux.service.ShareService;
import com.archflux.web.dto.MemberAddRequest;
import com.archflux.web.dto.MemberRoleRequest;
import com.archflux.web.dto.ShareLinkCreateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

/** Diagram sharing: members (R1-E07-T02) and share links (R1-E07-T03). */
@RestController
@RequestMapping("/api/v1/diagrams/{id}")
@Tag(name = "Sharing", description = "Diagram members and share links")
public class ShareController {

  private final ShareService share;

  public ShareController(ShareService share) {
    this.share = share;
  }

  @Operation(summary = "List members", description = "Any role that can view the diagram")
  @GetMapping("/members")
  public Map<String, Object> members(HttpServletRequest request, @PathVariable UUID id) {
    List<Map<String, Object>> items = share.listMembers(RequestUser.get(request), id);
    return Map.of("data", items);
  }

  @Operation(summary = "Add a member by email", description = "Needs SHARE; editors grant at most editor")
  @PostMapping("/members")
  public ResponseEntity<Map<String, Object>> addMember(HttpServletRequest request,
      @PathVariable UUID id, @Valid @RequestBody MemberAddRequest body) {
    ShareService.AddResult result =
        share.addMember(RequestUser.get(request), id, body.getEmail(), body.getRole());
    return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
        .body(Map.of("data", result.member()));
  }

  @Operation(summary = "Change a member's role")
  @PutMapping("/members/{userId}")
  public Map<String, Object> setRole(HttpServletRequest request, @PathVariable UUID id,
      @PathVariable UUID userId, @Valid @RequestBody MemberRoleRequest body) {
    return Map.of("data", share.setRole(RequestUser.get(request), id, userId, body.getRole()));
  }

  @Operation(summary = "Remove a member")
  @DeleteMapping("/members/{userId}")
  public ResponseEntity<Void> removeMember(HttpServletRequest request, @PathVariable UUID id,
      @PathVariable UUID userId) {
    share.removeMember(RequestUser.get(request), id, userId);
    return ResponseEntity.noContent().build();
  }

  @Operation(summary = "Create a share link",
      description = "Returns {id, url, token}; the token is shown only in this response")
  @PostMapping("/links")
  public ResponseEntity<Map<String, Object>> createLink(HttpServletRequest request,
      @PathVariable UUID id, @Valid @RequestBody ShareLinkCreateRequest body) {
    Map<String, Object> created = share.createLink(RequestUser.get(request), id, body.getRole(),
        body.getAudience(), body.getExpiresAt());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("data", created));
  }

  @Operation(summary = "List share links", description = "Never includes tokens")
  @GetMapping("/links")
  public Map<String, Object> links(HttpServletRequest request, @PathVariable UUID id) {
    return Map.of("data", share.listLinks(RequestUser.get(request), id));
  }

  @Operation(summary = "Revoke a share link")
  @DeleteMapping("/links/{linkId}")
  public ResponseEntity<Void> revokeLink(HttpServletRequest request, @PathVariable UUID id,
      @PathVariable UUID linkId) {
    share.revokeLink(RequestUser.get(request), id, linkId);
    return ResponseEntity.noContent().build();
  }
}
