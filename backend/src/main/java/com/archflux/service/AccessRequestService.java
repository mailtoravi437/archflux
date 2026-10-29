package com.archflux.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;
import com.archflux.auth.EmailService;
import com.archflux.domain.AccessRequest;
import com.archflux.domain.Diagram;
import com.archflux.domain.DiagramMember;
import com.archflux.domain.User;
import com.archflux.repo.AccessRequestRepository;
import com.archflux.repo.DiagramMemberRepository;
import com.archflux.repo.DiagramRepository;
import com.archflux.repo.UserRepository;
import com.archflux.security.ShareTokens;
import com.archflux.service.AccessService.Action;
import com.archflux.service.AccessService.DiagramRole;
import com.archflux.service.AccessService.LinkInfo;
import jakarta.persistence.EntityManager;

/**
 * FL-15 access states and access requests (R1-E07-T04).
 *
 * <p>{@code GET /diagrams/{id}/access} always answers 200 with a state:
 * {@code ok} (has access), {@code trashed} (owners/admins only, with title),
 * {@code expired} (the presented token is expired or revoked), {@code request}
 * (signed in, no access, but holds a live workspace link or is in the
 * diagram's workspace; carries title and owner name) and {@code not_found}
 * for everything else — never confirming that the diagram exists.
 */
@Service
public class AccessRequestService {

  private static final Logger log = LoggerFactory.getLogger(AccessRequestService.class);

  private static final Set<String> STATUSES = Set.of("pending", "approved", "denied");

  private final AccessService access;
  private final DiagramRepository diagrams;
  private final DiagramMemberRepository members;
  private final AccessRequestRepository requests;
  private final UserRepository users;
  private final WorkspaceService workspaces;
  private final AuditService audit;
  private final EmailService email;
  private final SchemaReadinessService readiness;
  private final EntityManager entityManager;
  private final String frontendUrl;

  public AccessRequestService(AccessService access, DiagramRepository diagrams,
      DiagramMemberRepository members, AccessRequestRepository requests, UserRepository users,
      WorkspaceService workspaces, AuditService audit, EmailService email,
      SchemaReadinessService readiness, EntityManager entityManager,
      @Value("${app.frontend-url:http://localhost:5173}") String frontendUrl) {
    this.access = access;
    this.diagrams = diagrams;
    this.members = members;
    this.requests = requests;
    this.users = users;
    this.workspaces = workspaces;
    this.audit = audit;
    this.email = email;
    this.readiness = readiness;
    this.entityManager = entityManager;
    this.frontendUrl = ShareService.trimSlash(frontendUrl);
  }

  /** Title / owner / workspace of a diagram the caller may see in the 'request' state. */
  record RequestInfo(String title, String ownerName, UUID workspaceId) {
  }

  /** The computed access state; {@code info} is set only for {@code request}. */
  record State(String state, DiagramRole role, String title, String ownerName, RequestInfo info) {
  }

  @Transactional(readOnly = true)
  public Map<String, Object> accessState(@Nullable UUID userId, UUID diagramId) {
    State s = compute(userId, diagramId, ShareTokens.current());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("state", s.state());
    if (s.role() != null) {
      out.put("role", s.role().wire());
    }
    if (s.title() != null) {
      out.put("title", s.title());
    }
    if (s.ownerName() != null) {
      out.put("ownerName", s.ownerName());
    }
    return out;
  }

  private State compute(@Nullable UUID userId, UUID diagramId, @Nullable String token) {
    readiness.requireReady();
    Optional<Diagram> found = diagrams.findById(diagramId);
    if (found.isPresent()) {
      Diagram d = found.get();
      if (d.getDeletedAt() != null) {
        // Trash is visible to owners / workspace admins only (no link applies).
        boolean owner = access.roleOn(userId, d, null)
            .map(r -> r.atLeast(DiagramRole.OWNER)).orElse(false);
        return owner ? new State("trashed", DiagramRole.OWNER, d.getTitle(), null, null)
            : notFound();
      }
      Optional<DiagramRole> role = access.roleOn(userId, d, token);
      if (role.isPresent()) {
        return new State("ok", role.get(), d.getTitle(), null, null);
      }
    }
    Optional<LinkInfo> link = access.resolveToken(token)
        .filter(l -> l.diagramId().equals(diagramId));
    if (link.isPresent() && !link.get().live(Instant.now())) {
      return new State("expired", null, null, null, null);
    }
    if (userId == null) {
      return notFound();
    }
    Optional<RequestInfo> info = requestInfo(diagramId);
    if (info.isEmpty()) {
      return notFound();
    }
    boolean holdsLiveLink = link.isPresent();
    boolean inWorkspace = workspaces.isMember(userId, info.get().workspaceId());
    if (holdsLiveLink || inWorkspace) {
      return new State("request", null, info.get().title(), info.get().ownerName(), info.get());
    }
    return notFound();
  }

  private static State notFound() {
    return new State("not_found", null, null, null, null);
  }

  /** Through the SECURITY DEFINER {@code diagram_request_info} (RLS hides the row from a non-member). */
  private Optional<RequestInfo> requestInfo(UUID diagramId) {
    @SuppressWarnings("unchecked")
    List<Object[]> rows = entityManager.createNativeQuery(
            "SELECT r_title, r_owner_name, r_workspace_id FROM public.diagram_request_info(:id)")
        .setParameter("id", diagramId)
        .getResultList();
    if (rows.isEmpty()) {
      return Optional.empty();
    }
    Object[] r = rows.get(0);
    return Optional.of(new RequestInfo((String) r[0], (String) r[1], (UUID) r[2]));
  }

  /** Files a request; allowed only when the caller's state is {@code request}. */
  @Transactional
  public Map<String, Object> create(UUID userId, UUID diagramId, String role, String note) {
    if (DiagramRole.fromWire(role) == null || DiagramRole.OWNER.wire().equals(role)) {
      throw ApiException.validation("role must be editor, commenter or viewer");
    }
    if (note != null && note.length() > 500) {
      throw ApiException.validation("note must be at most 500 characters");
    }
    State state = compute(userId, diagramId, ShareTokens.current());
    if ("ok".equals(state.state())) {
      throw ApiException.conflict("ALREADY_HAS_ACCESS", "You already have access to this diagram");
    }
    if (!"request".equals(state.state())) {
      throw ApiException.notFound("Diagram not found: " + diagramId);
    }
    if (requests.existsByDiagramIdAndRequesterIdAndStatus(diagramId, userId, "pending")) {
      throw ApiException.conflict("REQUEST_PENDING", "A request for this diagram is already pending");
    }
    String cleanNote = note == null || note.isBlank() ? null : note.trim();
    AccessRequest saved = requests.saveAndFlush(new AccessRequest(diagramId, userId, role, cleanNote));
    UUID workspaceId = state.info().workspaceId();
    audit.record(userId, workspaceId, "access.request", "access_request",
        saved.getId().toString(), "ok");
    notifyOwners(userId, diagramId, state.info().title(), role);
    return toJson(saved, state.info().title(), users.findById(userId).orElse(null));
  }

  /** Requests (default pending) on diagrams where the caller has SHARE. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> list(UUID userId, String status) {
    readiness.requireReady();
    String s = status == null || status.isBlank() ? "pending" : status;
    if (!STATUSES.contains(s)) {
      throw ApiException.validation("status must be pending, approved or denied");
    }
    List<UUID> sharerWorkspaces = new java.util.ArrayList<>();
    for (UUID ws : workspaces.workspaceIdsFor(userId)) {
      DiagramRole wsRole = AccessService.fromWorkspaceRole(workspaces.roleOf(userId, ws));
      if (wsRole != null && wsRole.atLeast(AccessService.minimumFor(Action.SHARE))) {
        sharerWorkspaces.add(ws);
      }
    }
    // Never an empty IN list: a random id matches nothing.
    sharerWorkspaces.add(UUID.randomUUID());
    List<Object[]> rows = entityManager.createQuery(
            "SELECT r, d.title FROM AccessRequest r, Diagram d WHERE d.id = r.diagramId"
                + " AND r.status = :status AND d.deletedAt IS NULL"
                + " AND (d.workspace.id IN :ws OR EXISTS (SELECT 1 FROM DiagramMember m"
                + " WHERE m.id.diagramId = d.id AND m.id.userId = :uid"
                + " AND m.role IN ('owner', 'editor')))"
                + " ORDER BY r.createdAt ASC", Object[].class)
        .setParameter("status", s)
        .setParameter("ws", sharerWorkspaces)
        .setParameter("uid", userId)
        .setMaxResults(200)
        .getResultList();
    Map<UUID, User> people = new HashMap<>();
    users.findAllById(rows.stream().map(r -> ((AccessRequest) r[0]).getRequesterId()).toList())
        .forEach(u -> people.put(u.getId(), u));
    return rows.stream().map(r -> {
      AccessRequest req = (AccessRequest) r[0];
      return toJson(req, (String) r[1], people.get(req.getRequesterId()));
    }).toList();
  }

  /** Approves: creates (or raises) the member row and notifies the requester. */
  @Transactional
  public Map<String, Object> approve(UUID callerId, UUID requestId, @Nullable String role) {
    AccessRequest req = requests.findById(requestId)
        .orElseThrow(() -> ApiException.notFound("Access request not found: " + requestId));
    Diagram diagram = requireDecider(callerId, req);
    String granted = role == null || role.isBlank() ? req.getRole() : role;
    DiagramRole grantedRole = DiagramRole.fromWire(granted);
    if (grantedRole == null || grantedRole == DiagramRole.OWNER) {
      throw ApiException.validation("role must be editor, commenter or viewer");
    }
    DiagramMember.Key key = new DiagramMember.Key(req.getDiagramId(), req.getRequesterId());
    Optional<DiagramMember> existing = members.findById(key);
    if (existing.isEmpty()) {
      members.saveAndFlush(new DiagramMember(req.getDiagramId(), req.getRequesterId(),
          grantedRole.wire(), callerId));
    } else if (!DiagramRole.fromWire(existing.get().getRole()).atLeast(grantedRole)) {
      existing.get().setRole(grantedRole.wire());
      members.saveAndFlush(existing.get());
    }
    req.setRole(grantedRole.wire());
    req.decide("approved", callerId, Instant.now().truncatedTo(ChronoUnit.MICROS));
    requests.saveAndFlush(req);
    audit.record(callerId, diagram.workspaceId(), "access.approve", "access_request",
        requestId.toString(), "ok");
    User requester = users.findById(req.getRequesterId()).orElse(null);
    notifyRequester(requester, diagram, "approved", grantedRole.wire());
    return toJson(req, diagram.getTitle(), requester);
  }

  @Transactional
  public Map<String, Object> deny(UUID callerId, UUID requestId) {
    AccessRequest req = requests.findById(requestId)
        .orElseThrow(() -> ApiException.notFound("Access request not found: " + requestId));
    Diagram diagram = requireDecider(callerId, req);
    req.decide("denied", callerId, Instant.now().truncatedTo(ChronoUnit.MICROS));
    requests.saveAndFlush(req);
    audit.record(callerId, diagram.workspaceId(), "access.deny", "access_request",
        requestId.toString(), "ok");
    User requester = users.findById(req.getRequesterId()).orElse(null);
    notifyRequester(requester, diagram, "denied", null);
    return toJson(req, diagram.getTitle(), requester);
  }

  /** 404 when the caller cannot see the diagram (never confirms the request), 403 below SHARE, 409 if decided. */
  private Diagram requireDecider(UUID callerId, AccessRequest req) {
    Diagram diagram;
    try {
      diagram = access.require(callerId, req.getDiagramId(), Action.SHARE, null);
    } catch (ApiException e) {
      if (e.status() == 404) {
        throw ApiException.notFound("Access request not found: " + req.getId());
      }
      throw e;
    }
    if (!"pending".equals(req.getStatus())) {
      throw ApiException.conflict("REQUEST_DECIDED", "This request was already " + req.getStatus());
    }
    return diagram;
  }

  private void notifyOwners(UUID requesterId, UUID diagramId, String title, String role) {
    try {
      String who = users.findById(requesterId).map(User::getName)
          .filter(n -> n != null && !n.isBlank()).orElse("Someone");
      @SuppressWarnings("unchecked")
      List<Object[]> owners = entityManager.createNativeQuery(
              "SELECT r_user_id, r_email, r_name FROM public.diagram_owner_contacts(:id)")
          .setParameter("id", diagramId)
          .getResultList();
      String subject = ShareService.singleLine(who + " requested " + role + " access to " + title);
      String link = frontendUrl + "/#/d/" + diagramId;
      String html = "<p>" + HtmlUtils.htmlEscape(who) + " asked for <strong>"
          + HtmlUtils.htmlEscape(role) + "</strong> access to <strong>"
          + HtmlUtils.htmlEscape(title) + "</strong>.</p>"
          + "<p><a href=\"" + HtmlUtils.htmlEscape(link) + "\">Review the request</a></p>";
      for (Object[] owner : owners) {
        email.sendHtml((String) owner[1], subject, html);
      }
    } catch (Exception e) {
      log.warn("Access request notification failed for diagram {}: {}", diagramId,
          e.getClass().getSimpleName());
    }
  }

  private void notifyRequester(User requester, Diagram diagram, String outcome, String role) {
    if (requester == null) {
      return;
    }
    try {
      String subject = ShareService.singleLine(
          "Your request for " + diagram.getTitle() + " was " + outcome);
      String link = frontendUrl + "/#/canvas?doc=" + diagram.getId();
      String html = "<p>Your request for <strong>" + HtmlUtils.htmlEscape(diagram.getTitle())
          + "</strong> was " + outcome
          + (role == null ? "" : " (" + HtmlUtils.htmlEscape(role) + ")") + ".</p>"
          + ("approved".equals(outcome)
              ? "<p><a href=\"" + HtmlUtils.htmlEscape(link) + "\">Open the diagram</a></p>" : "");
      email.sendHtml(requester.getEmail(), subject, html);
    } catch (Exception e) {
      log.warn("Access decision notification failed for diagram {}: {}", diagram.getId(),
          e.getClass().getSimpleName());
    }
  }

  private static Map<String, Object> toJson(AccessRequest r, String title, User requester) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", r.getId().toString());
    out.put("diagramId", r.getDiagramId().toString());
    out.put("diagramTitle", title);
    out.put("requesterId", r.getRequesterId().toString());
    out.put("requesterName", requester == null ? null : requester.getName());
    out.put("requesterEmail", requester == null ? null : requester.getEmail());
    out.put("role", r.getRole());
    out.put("note", r.getNote());
    out.put("status", r.getStatus());
    out.put("decidedBy", r.getDecidedBy() == null ? null : r.getDecidedBy().toString());
    out.put("decidedAt", r.getDecidedAt() == null ? null : r.getDecidedAt().toString());
    out.put("createdAt", r.getCreatedAt() == null ? null : r.getCreatedAt().toString());
    return out;
  }
}
