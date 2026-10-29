package com.archflux.web;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.security.RequestUser;
import com.archflux.service.WorkspaceAdminService;
import com.archflux.service.WorkspaceInviteService;
import com.archflux.service.WorkspaceMemberService;
import com.archflux.web.dto.WorkspaceMemberRoleRequest;
import com.archflux.web.dto.InviteRequest;
import com.archflux.web.dto.WorkspaceUpdateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;

/** Current workspace, invites and invite acceptance (R1-E11-T01). */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Workspaces", description = "Current workspace, plan limits and invites")
public class WorkspaceController {

  static final String WORKSPACE_HEADER = "X-Workspace-ID";

  private final WorkspaceAdminService admin;
  private final WorkspaceInviteService invites;
  private final WorkspaceMemberService members;

  public WorkspaceController(WorkspaceAdminService admin, WorkspaceInviteService invites,
      WorkspaceMemberService members) {
    this.members = members;
    this.admin = admin;
    this.invites = invites;
  }

  @Operation(summary = "Current workspace with limits and usage",
      description = "X-Workspace-ID selects a workspace the caller belongs to (404 otherwise); default is the personal one")
  @GetMapping("/workspaces/current")
  public Map<String, Object> current(HttpServletRequest request,
      @RequestHeader(value = WORKSPACE_HEADER, required = false) UUID workspaceId) {
    return Map.of("data", admin.get(RequestUser.get(request), workspaceId));
  }

  @Operation(summary = "Update the current workspace (admin only)")
  @PatchMapping("/workspaces/current")
  public Map<String, Object> update(HttpServletRequest request,
      @RequestHeader(value = WORKSPACE_HEADER, required = false) UUID workspaceId,
      @Validated @RequestBody WorkspaceUpdateRequest body) {
    return Map.of("data", admin.update(RequestUser.get(request), workspaceId, body));
  }

  @Operation(summary = "List pending invites (admin only)")
  @GetMapping("/workspaces/current/invites")
  public Map<String, Object> listInvites(HttpServletRequest request,
      @RequestHeader(value = WORKSPACE_HEADER, required = false) UUID workspaceId) {
    return Map.of("data", invites.list(RequestUser.get(request), workspaceId));
  }

  @Operation(summary = "Invite someone by email (admin only)",
      description = "The token is returned once; only its hash is stored")
  @PostMapping("/workspaces/current/invites")
  public ResponseEntity<Map<String, Object>> invite(HttpServletRequest request,
      @RequestHeader(value = WORKSPACE_HEADER, required = false) UUID workspaceId,
      @Validated @RequestBody InviteRequest body) {
    Map<String, Object> created = invites.create(RequestUser.get(request), workspaceId,
        body.getEmail(), body.getRole());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("data", created));
  }

  @Operation(summary = "Revoke a pending invite (admin only)")
  @DeleteMapping("/workspaces/current/invites/{id}")
  public ResponseEntity<Void> revoke(HttpServletRequest request,
      @RequestHeader(value = WORKSPACE_HEADER, required = false) UUID workspaceId,
      @PathVariable UUID id) {
    invites.revoke(RequestUser.get(request), workspaceId, id);
    return ResponseEntity.noContent().build();
  }

  @Operation(summary = "Members and pending invites",
      description = "Pending invites are included for admins only")
  @GetMapping("/workspaces/current/members")
  public Map<String, Object> listMembers(HttpServletRequest request,
      @RequestHeader(value = WORKSPACE_HEADER, required = false) UUID workspaceId) {
    return Map.of("data", members.list(RequestUser.get(request), workspaceId));
  }

  @Operation(summary = "Change a member's role (admin only); 409 LAST_ADMIN, 402 LIMIT_REACHED")
  @PatchMapping("/workspaces/current/members/{userId}")
  public Map<String, Object> changeRole(HttpServletRequest request,
      @RequestHeader(value = WORKSPACE_HEADER, required = false) UUID workspaceId,
      @PathVariable UUID userId, @Validated @RequestBody WorkspaceMemberRoleRequest body) {
    return Map.of("data",
        members.changeRole(RequestUser.get(request), workspaceId, userId, body.getRole()));
  }

  @Operation(summary = "Remove a member (admin only)",
      description = "Their diagrams transfer to the remover; 409 LAST_ADMIN")
  @DeleteMapping("/workspaces/current/members/{userId}")
  public ResponseEntity<Void> removeMember(HttpServletRequest request,
      @RequestHeader(value = WORKSPACE_HEADER, required = false) UUID workspaceId,
      @PathVariable UUID userId) {
    members.remove(RequestUser.get(request), workspaceId, userId);
    return ResponseEntity.noContent().build();
  }

  @Operation(summary = "Accept an invite", description = "Requires sign-in; the account email must match the invite")
  @PostMapping("/invites/{token}/accept")
  public Map<String, Object> accept(HttpServletRequest request, @PathVariable String token) {
    return Map.of("data", invites.accept(RequestUser.get(request), token));
  }
}
