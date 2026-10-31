package com.archflux.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;
import com.archflux.auth.EmailService;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.domain.WorkspaceInvite;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.repo.UserRepository;
import com.archflux.repo.WorkspaceInviteRepository;
import com.archflux.repo.WorkspaceMembershipRepository;
import com.archflux.security.ShareTokens;

/**
 * Workspace invites (R1-E11-T01). Tokens are 32 random bytes, only their
 * SHA-256 hex is stored, the plain token is returned once at creation (and in
 * the email) and never logged. Invites expire after 7 days. Admin-only to
 * list, create and revoke; accepting needs sign-in and a matching email.
 */
@Service
public class WorkspaceInviteService {

  private static final Logger log = LoggerFactory.getLogger(WorkspaceInviteService.class);

  public static final long EXPIRY_DAYS = 7;
  private static final Set<String> ADMIN = Set.of("admin");
  private static final Set<String> SEAT_ROLES = Set.of("admin", "editor");

  private final WorkspaceService workspaceService;
  private final WorkspaceInviteRepository invites;
  private final WorkspaceMembershipRepository memberships;
  private final UserRepository users;
  private final PlanService plans;
  private final AuditService audit;
  private final EmailService email;
  private final SchemaReadinessService readiness;

  @Value("${app.frontend-url:http://localhost:5173}")
  private String frontendUrl;

  public WorkspaceInviteService(WorkspaceService workspaceService,
      WorkspaceInviteRepository invites, WorkspaceMembershipRepository memberships,
      UserRepository users, PlanService plans, AuditService audit, EmailService email,
      SchemaReadinessService readiness) {
    this.workspaceService = workspaceService;
    this.invites = invites;
    this.memberships = memberships;
    this.users = users;
    this.plans = plans;
    this.audit = audit;
    this.email = email;
    this.readiness = readiness;
  }

  @Transactional
  public List<Map<String, Object>> list(UUID userId, UUID requestedWorkspaceId) {
    readiness.requireReady();
    Workspace ws = adminWorkspace(userId, requestedWorkspaceId);
    Instant now = Instant.now();
    return invites
        .findByWorkspaceIdAndAcceptedAtIsNullAndRevokedAtIsNullOrderByCreatedAtDesc(ws.getId())
        .stream().filter(i -> i.isPending(now)).map(i -> toJson(i, null)).toList();
  }

  @Transactional
  public Map<String, Object> create(UUID userId, UUID requestedWorkspaceId, String rawEmail,
      String role) {
    readiness.requireReady();
    Workspace ws = adminWorkspace(userId, requestedWorkspaceId);
    String address = rawEmail.trim().toLowerCase();
    if (SEAT_ROLES.contains(role)) {
      plans.requireCanAddEditor(ws.getId());
    }
    users.findByEmailIgnoreCase(address).ifPresent(existing -> {
      if (memberships.existsById_WorkspaceIdAndId_UserId(ws.getId(), existing.getId())) {
        throw ApiException.conflict("ALREADY_MEMBER", "That person is already a member");
      }
    });
    Instant now = Instant.now();
    for (WorkspaceInvite old : invites
        .findByWorkspaceIdAndEmailIgnoreCaseAndAcceptedAtIsNullAndRevokedAtIsNull(ws.getId(),
            address)) {
      if (old.isPending(now)) {
        throw ApiException.conflict("INVITE_EXISTS", "That email already has a pending invite");
      }
      old.setRevokedAt(now); // expired: free the unique slot for a fresh invite
    }
    invites.flush();
    String token = ShareTokens.generate();
    WorkspaceInvite invite = new WorkspaceInvite(ws.getId(), address, role,
        ShareTokens.hash(token), userId, now.plus(EXPIRY_DAYS, ChronoUnit.DAYS));
    try {
      invite = invites.saveAndFlush(invite);
    } catch (DataIntegrityViolationException e) {
      throw ApiException.conflict("INVITE_EXISTS", "That email already has a pending invite");
    }
    audit.record(userId, ws.getId(), "invite.create", "invite", invite.getId().toString(), "ok");
    boolean sent = sendEmail(userId, ws, address, token);
    Map<String, Object> out = toJson(invite, token);
    out.put("emailSent", sent);
    return out;
  }

  @Transactional
  public void revoke(UUID userId, UUID requestedWorkspaceId, UUID inviteId) {
    readiness.requireReady();
    Workspace ws = adminWorkspace(userId, requestedWorkspaceId);
    WorkspaceInvite invite = invites.findByIdAndWorkspaceId(inviteId, ws.getId())
        .filter(i -> i.getAcceptedAt() == null && i.getRevokedAt() == null)
        .orElseThrow(() -> ApiException.notFound("Invite not found"));
    invite.setRevokedAt(Instant.now());
    invites.saveAndFlush(invite);
    audit.record(userId, ws.getId(), "invite.revoke", "invite", invite.getId().toString(), "ok");
  }

  /** Accepts an invite for the signed-in user; their email must match the invite's. */
  @Transactional
  public Map<String, Object> accept(UUID userId, String token) {
    readiness.requireReady();
    if (userId == null) {
      throw ApiException.forbidden("Sign in to accept an invite");
    }
    if (!ShareTokens.wellFormed(token)) {
      throw ApiException.notFound("Invite not found");
    }
    Instant now = Instant.now();
    WorkspaceInvite invite = invites.findByTokenHash(ShareTokens.hash(token))
        .filter(i -> i.isPending(now))
        .orElseThrow(() -> ApiException.notFound("Invite not found"));
    User user = users.findById(userId)
        .orElseThrow(() -> ApiException.forbidden("Sign in to accept an invite"));
    if (user.getEmail() == null || !user.getEmail().equalsIgnoreCase(invite.getEmail())) {
      throw new ApiException("INVITE_EMAIL_MISMATCH", 403,
          "This invite was sent to a different email address");
    }
    Workspace ws = workspaceService.requireWorkspace(invite.getWorkspaceId());
    boolean alreadyMember = memberships.existsById_WorkspaceIdAndId_UserId(ws.getId(), userId);
    String role = invite.getRole();
    if (!alreadyMember) {
      if (SEAT_ROLES.contains(role)) {
        plans.requireCanAddEditorForInvitee(ws.getId());
      }
      WorkspaceMembership m = new WorkspaceMembership(ws, user, role, "active");
      m.setInvitedBy(invite.getInvitedBy());
      memberships.saveAndFlush(m);
    } else {
      role = workspaceService.roleOf(userId, ws.getId());
    }
    invite.setAcceptedAt(now);
    invites.saveAndFlush(invite);
    audit.record(userId, ws.getId(), "invite.accept", "invite", invite.getId().toString(), "ok");
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("workspaceId", ws.getId());
    out.put("name", ws.getName());
    out.put("slug", ws.getSlug());
    out.put("role", role);
    return out;
  }

  private Workspace adminWorkspace(UUID userId, UUID requestedWorkspaceId) {
    Workspace ws = workspaceService.current(userId, requestedWorkspaceId);
    workspaceService.requireRole(userId, ws.getId(), ADMIN, "Workspace not found");
    return ws;
  }

  private boolean sendEmail(UUID inviterId, Workspace ws, String to, String token) {
    try {
      String inviter = users.findById(inviterId).map(u -> {
        String n = u.getName();
        return n == null || n.isBlank() ? u.getEmail() : n;
      }).orElse("A teammate");
      String link = frontendUrl.replaceAll("/+$", "") + "/invite/" + token;
      String subject = inviter + " invited you to " + ws.getName() + " on ArchFlux";
      String body = "<p>" + HtmlUtils.htmlEscape(inviter) + " invited you to join <strong>"
          + HtmlUtils.htmlEscape(ws.getName()) + "</strong> on ArchFlux.</p>"
          + "<p><a href=\"" + HtmlUtils.htmlEscape(link) + "\">Accept the invite</a></p>"
          + "<p>This link expires in " + EXPIRY_DAYS + " days.</p>";
      email.sendHtml(to, subject, body);
      return true;
    } catch (Exception e) {
      log.warn("Invite email failed: {}", e.getClass().getSimpleName());
      return false;
    }
  }

  private static Map<String, Object> toJson(WorkspaceInvite i, String token) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", i.getId());
    out.put("email", i.getEmail());
    out.put("role", i.getRole());
    out.put("status", "pending");
    out.put("expiresAt", i.getExpiresAt().toString());
    out.put("createdAt", i.getCreatedAt().toString());
    if (token != null) {
      out.put("token", token); // shown once
    }
    return out;
  }
}
