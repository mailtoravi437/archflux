package com.archflux.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;
import com.archflux.auth.EmailService;
import com.archflux.domain.Diagram;
import com.archflux.domain.DiagramMember;
import com.archflux.domain.User;
import com.archflux.domain.ShareLink;
import com.archflux.domain.Workspace;
import com.archflux.repo.DiagramMemberRepository;
import com.archflux.repo.ShareLinkRepository;
import com.archflux.repo.WorkspaceRepository;
import com.archflux.repo.UserRepository;
import com.archflux.security.ShareTokens;
import com.archflux.service.AccessService.Action;
import com.archflux.service.AccessService.DiagramRole;

/**
 * Diagram members (R1-E07-T02) and share links (R1-E07-T03). Listing members
 * needs VIEW; every change, and anything about links, needs SHARE. Editors may
 * grant at most editor and may not touch an owner's row; the last owner can
 * never be removed or demoted (409 LAST_OWNER). Link tokens are returned once
 * by {@link #createLink} and never stored, logged or listed.
 */
@Service
public class ShareService {

  private static final Logger log = LoggerFactory.getLogger(ShareService.class);

  private final AccessService access;
  private final DiagramMemberRepository members;
  private final UserRepository users;
  private final WorkspaceService workspaces;
  private final AuditService audit;
  private final EmailService email;
  private final String frontendUrl;
  private final ShareLinkRepository links;
  private final WorkspaceRepository workspaceRows;

  public ShareService(AccessService access, DiagramMemberRepository members, UserRepository users,
      WorkspaceService workspaces, AuditService audit, EmailService email,
      @Value("${app.frontend-url:http://localhost:5173}") String frontendUrl,
      ShareLinkRepository links, WorkspaceRepository workspaceRows) {
    this.links = links;
    this.workspaceRows = workspaceRows;
    this.access = access;
    this.members = members;
    this.users = users;
    this.workspaces = workspaces;
    this.audit = audit;
    this.email = email;
    this.frontendUrl = trimSlash(frontendUrl);
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> listMembers(UUID callerId, UUID diagramId) {
    access.require(callerId, diagramId, Action.VIEW, ShareTokens.current());
    List<DiagramMember> rows = members.findByDiagram(diagramId);
    Map<UUID, User> people = new HashMap<>();
    users.findAllById(rows.stream().map(DiagramMember::userId).toList())
        .forEach(u -> people.put(u.getId(), u));
    return rows.stream().map(m -> toJson(m, people.get(m.userId()))).toList();
  }

  /** Result of an add: the member row and whether it was newly created. */
  public record AddResult(Map<String, Object> member, boolean created) {
  }

  @Transactional
  public AddResult addMember(UUID callerId, UUID diagramId, String emailAddress, String role) {
    Diagram diagram = access.require(callerId, diagramId, Action.SHARE, null);
    DiagramRole callerRole = callerRole(callerId, diagram);
    DiagramRole wanted = parseRole(role);
    requireMayGrant(callerRole, wanted);
    String normalized = emailAddress == null ? "" : emailAddress.trim().toLowerCase();
    // Same message whether the address is unknown or outside the workspace:
    // the endpoint must not become a user-enumeration oracle.
    User target = users.findByEmailIgnoreCase(normalized)
        .filter(u -> workspaces.isMember(u.getId(), diagram.workspaceId()))
        .orElseThrow(() -> ApiException.unprocessable("USER_NOT_FOUND",
            "Invite them to the workspace first"));
    Optional<DiagramMember> existing = members.findById(
        new DiagramMember.Key(diagramId, target.getId()));
    if (existing.isPresent()) {
      DiagramMember row = existing.get();
      changeRole(callerId, callerRole, diagram, row, wanted);
      return new AddResult(toJson(row, target), false);
    }
    DiagramMember row = members.saveAndFlush(
        new DiagramMember(diagramId, target.getId(), wanted.wire(), callerId));
    audit.record(callerId, diagram.workspaceId(), "share.member_add", "diagram",
        diagramId.toString(), "ok");
    notifyShared(callerId, target, diagram);
    return new AddResult(toJson(row, target), true);
  }

  @Transactional
  public Map<String, Object> setRole(UUID callerId, UUID diagramId, UUID userId, String role) {
    Diagram diagram = access.require(callerId, diagramId, Action.SHARE, null);
    DiagramRole callerRole = callerRole(callerId, diagram);
    DiagramRole wanted = parseRole(role);
    DiagramMember row = members.findById(new DiagramMember.Key(diagramId, userId))
        .orElseThrow(() -> ApiException.notFound("Member not found: " + userId));
    changeRole(callerId, callerRole, diagram, row, wanted);
    return toJson(row, users.findById(userId).orElse(null));
  }

  @Transactional
  public void removeMember(UUID callerId, UUID diagramId, UUID userId) {
    Diagram diagram = access.require(callerId, diagramId, Action.SHARE, null);
    DiagramRole callerRole = callerRole(callerId, diagram);
    DiagramMember row = members.findById(new DiagramMember.Key(diagramId, userId))
        .orElseThrow(() -> ApiException.notFound("Member not found: " + userId));
    if (DiagramRole.OWNER.wire().equals(row.getRole())) {
      if (!callerRole.atLeast(DiagramRole.OWNER)) {
        throw ApiException.forbidden("Only an owner can remove an owner");
      }
      requireNotLastOwner(diagramId);
    }
    members.delete(row);
    members.flush();
    audit.record(callerId, diagram.workspaceId(), "share.member_remove", "diagram",
        diagramId.toString(), "ok");
  }

  // ------------------------------------------------------------------ links

  /**
   * Creates a link and returns {@code {id, url, token, …}}. This response is
   * the only place the token ever appears: only its SHA-256 hash is stored.
   */
  @Transactional
  public Map<String, Object> createLink(UUID callerId, UUID diagramId, String role,
      String audience, Instant expiresAt) {
    Diagram diagram = access.require(callerId, diagramId, Action.SHARE, null);
    if (!"viewer".equals(role) && !"commenter".equals(role)) {
      throw ApiException.validation("role must be viewer or commenter");
    }
    if (!"workspace".equals(audience) && !"anyone".equals(audience)) {
      throw ApiException.validation("audience must be workspace or anyone");
    }
    if (expiresAt != null && !expiresAt.isAfter(Instant.now())) {
      throw ApiException.unprocessable("expiresAt must be in the future");
    }
    if ("anyone".equals(audience)) {
      boolean allowed = workspaceRows.findById(diagram.workspaceId())
          .map(Workspace::isPublicLinksAllowed).orElse(false);
      if (!allowed) {
        throw new ApiException("PUBLIC_LINKS_DISABLED", 403,
            "This workspace does not allow links for anyone");
      }
    }
    String token = ShareTokens.generate();
    ShareLink link = links.saveAndFlush(new ShareLink(diagramId, diagram.workspaceId(),
        ShareTokens.hash(token), role, audience,
        expiresAt == null ? null : expiresAt.truncatedTo(ChronoUnit.MICROS), callerId));
    audit.record(callerId, diagram.workspaceId(), "share.link_create", "share_link",
        link.getId().toString(), "ok");
    Map<String, Object> out = linkToJson(link);
    out.put("url", frontendUrl + "/d/" + diagramId + "?link=1");
    out.put("token", token);
    return out;
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> listLinks(UUID callerId, UUID diagramId) {
    access.require(callerId, diagramId, Action.SHARE, null);
    return links.findByDiagramIdOrderByCreatedAtDesc(diagramId).stream()
        .map(this::linkToJson).toList();
  }

  /** Revokes a link (idempotent). A revoked token is treated as no token. */
  @Transactional
  public void revokeLink(UUID callerId, UUID diagramId, UUID linkId) {
    Diagram diagram = access.require(callerId, diagramId, Action.SHARE, null);
    ShareLink link = links.findByIdAndDiagramId(linkId, diagramId)
        .orElseThrow(() -> ApiException.notFound("Link not found: " + linkId));
    if (link.getRevokedAt() == null) {
      link.setRevokedAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
      links.saveAndFlush(link);
    }
    audit.record(callerId, diagram.workspaceId(), "share.link_revoke", "share_link",
        linkId.toString(), "ok");
  }

  /** Link metadata. Never includes the token or its hash. */
  Map<String, Object> linkToJson(ShareLink link) {
    Instant now = Instant.now();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", link.getId().toString());
    out.put("diagramId", link.getDiagramId().toString());
    out.put("role", link.getRole());
    out.put("audience", link.getAudience());
    out.put("expiresAt", link.getExpiresAt() == null ? null : link.getExpiresAt().toString());
    out.put("revokedAt", link.getRevokedAt() == null ? null : link.getRevokedAt().toString());
    out.put("state", link.getRevokedAt() != null ? "revoked"
        : link.getExpiresAt() != null && !link.getExpiresAt().isAfter(now) ? "expired" : "active");
    out.put("createdBy", link.getCreatedBy() == null ? null : link.getCreatedBy().toString());
    out.put("createdAt", link.getCreatedAt() == null ? null : link.getCreatedAt().toString());
    return out;
  }

  private void changeRole(UUID callerId, DiagramRole callerRole, Diagram diagram,
      DiagramMember row, DiagramRole wanted) {
    requireMayGrant(callerRole, wanted);
    boolean wasOwner = DiagramRole.OWNER.wire().equals(row.getRole());
    if (wasOwner && !callerRole.atLeast(DiagramRole.OWNER)) {
      throw ApiException.forbidden("Only an owner can change an owner's role");
    }
    if (wanted.wire().equals(row.getRole())) {
      return;
    }
    if (wasOwner) {
      requireNotLastOwner(diagram.getId());
    }
    row.setRole(wanted.wire());
    members.saveAndFlush(row);
    audit.record(callerId, diagram.workspaceId(), "share.member_role", "diagram",
        diagram.getId().toString(), "ok");
  }

  private void requireNotLastOwner(UUID diagramId) {
    if (members.countOwners(diagramId) <= 1) {
      throw ApiException.conflict("LAST_OWNER", "A diagram must keep at least one owner");
    }
  }

  /** Editors may grant up to editor; only owners may grant owner. */
  private static void requireMayGrant(DiagramRole callerRole, DiagramRole wanted) {
    if (wanted == DiagramRole.OWNER && !callerRole.atLeast(DiagramRole.OWNER)) {
      throw ApiException.forbidden("Editors can grant at most the editor role");
    }
  }

  private DiagramRole callerRole(UUID callerId, Diagram diagram) {
    return access.roleOn(callerId, diagram, null)
        .orElseThrow(() -> ApiException.notFound("Diagram not found: " + diagram.getId()));
  }

  private static DiagramRole parseRole(String role) {
    DiagramRole parsed = DiagramRole.fromWire(role);
    if (parsed == null) {
      throw ApiException.validation("role must be owner, editor, commenter or viewer");
    }
    return parsed;
  }

  /** Best effort: a failed notification never undoes the share. */
  private void notifyShared(UUID callerId, User target, Diagram diagram) {
    try {
      String sharer = users.findById(callerId).map(User::getName)
          .filter(n -> n != null && !n.isBlank()).orElse("Someone");
      String subject = singleLine(sharer + " shared " + diagram.getTitle() + " with you");
      String link = frontendUrl + "/canvas?doc=" + diagram.getId();
      String html = "<p>" + HtmlUtils.htmlEscape(sharer) + " shared <strong>"
          + HtmlUtils.htmlEscape(diagram.getTitle()) + "</strong> with you on ArchFlux.</p>"
          + "<p><a href=\"" + HtmlUtils.htmlEscape(link) + "\">Open the diagram</a></p>";
      email.sendHtml(target.getEmail(), subject, html);
    } catch (Exception e) {
      log.warn("Share notification failed for diagram {}: {}", diagram.getId(),
          e.getClass().getSimpleName());
    }
  }

  static String singleLine(String value) {
    return value.replaceAll("[\\r\\n]+", " ").trim();
  }

  static String trimSlash(String url) {
    String u = url == null ? "" : url.trim();
    while (u.endsWith("/")) {
      u = u.substring(0, u.length() - 1);
    }
    return u;
  }

  Map<String, Object> toJson(DiagramMember member, User user) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("userId", member.userId().toString());
    out.put("email", user == null ? null : user.getEmail());
    out.put("name", user == null ? null : user.getName());
    out.put("role", member.getRole());
    out.put("addedBy", member.getAddedBy() == null ? null : member.getAddedBy().toString());
    out.put("createdAt", member.getCreatedAt() == null ? null : member.getCreatedAt().toString());
    return out;
  }
}
