package com.archflux.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.MvcResult;
import com.archflux.domain.AuditEvent;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.repo.AuditEventRepository;
import com.archflux.repo.WorkspaceMembershipRepository;
import com.archflux.security.ShareTokens;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;

/** R1-E11-T01: workspace endpoints and invites. */
class WorkspaceInvitesTest extends WorkspaceTestBase {

  @Autowired private WorkspaceMembershipRepository memberships;
  @Autowired private AuditEventRepository auditEvents;
  @Autowired private EntityManager em;

  private final ObjectMapper mapper = new ObjectMapper();
  private User admin;
  private User viewer;
  private User outsider;
  private Workspace ws;
  private String adminJwt;
  private String viewerJwt;
  private String outsiderJwt;

  @BeforeEach
  void setUp() {
    admin = persistUser("inv-admin");
    viewer = persistUser("inv-viewer");
    outsider = persistUser("inv-out");
    ws = personal(admin);
    personal(outsider);
    memberships.saveAndFlush(new WorkspaceMembership(ws, viewer, "viewer", "active"));
    adminJwt = jwt(admin);
    viewerJwt = jwt(viewer);
    outsiderJwt = jwt(outsider);
  }

  private JsonNode invite(String email, String role) throws Exception {
    MvcResult r = mockMvc.perform(json(post("/api/v1/workspaces/current/invites"), adminJwt,
        "{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}"))
        .andExpect(status().isCreated()).andReturn();
    return mapper.readTree(r.getResponse().getContentAsString()).get("data");
  }

  private List<String> auditActions() {
    return auditEvents.findByWorkspaceIdOrderByCreatedAtDesc(ws.getId(), PageRequest.of(0, 50))
        .stream().map(AuditEvent::getAction).toList();
  }

  @Test
  void currentWorkspaceReturnsLimitsAndUsage() throws Exception {
    mockMvc.perform(get("/api/v1/workspaces/current").header("Authorization", adminJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.id", is(ws.getId().toString())))
        .andExpect(jsonPath("$.data.role", is("admin")))
        .andExpect(jsonPath("$.data.limits.cloudDiagrams", is(3)))
        .andExpect(jsonPath("$.data.usage.editors", is(1)))
        .andExpect(jsonPath("$.data.joinPolicy", is("invite")));
    mockMvc.perform(get("/api/v1/workspaces/current")).andExpect(status().isUnauthorized());
  }

  @Test
  void inviteAcceptRequiresMatchingEmail() throws Exception {
    User invitee = persistUser("inv-new");
    JsonNode created = invite(invitee.getEmail(), "viewer");
    String token = created.get("token").asText();

    mockMvc.perform(post("/api/v1/invites/" + token + "/accept").header("Authorization", outsiderJwt))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("INVITE_EMAIL_MISMATCH")));
    mockMvc.perform(post("/api/v1/invites/" + token + "/accept")).andExpect(status().isUnauthorized());

    mockMvc.perform(post("/api/v1/invites/" + token + "/accept").header("Authorization", jwt(invitee)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.workspaceId", is(ws.getId().toString())))
        .andExpect(jsonPath("$.data.role", is("viewer")));
    assertThat(memberships.existsById_WorkspaceIdAndId_UserId(ws.getId(), invitee.getId())).isTrue();
    // single use
    mockMvc.perform(post("/api/v1/invites/" + token + "/accept").header("Authorization", jwt(invitee)))
        .andExpect(status().isNotFound());
    assertThat(auditActions()).contains("invite.create", "invite.accept");
  }

  @Test
  void inviteTokenHashedAndExpires() throws Exception {
    User invitee = persistUser("inv-exp");
    JsonNode created = invite(invitee.getEmail(), "reviewer");
    String token = created.get("token").asText();
    String stored = (String) em.createNativeQuery(
        "SELECT token_hash FROM workspace_invites WHERE id = :id")
        .setParameter("id", java.util.UUID.fromString(created.get("id").asText()))
        .getSingleResult();
    assertThat(stored).isEqualTo(ShareTokens.hash(token)).isNotEqualTo(token);
    Instant expires = Instant.parse(created.get("expiresAt").asText());
    assertThat(Duration.between(Instant.now(), expires).toDays()).isBetween(6L, 7L);

    // listing never exposes the token
    mockMvc.perform(get("/api/v1/workspaces/current/invites").header("Authorization", adminJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()", is(1)))
        .andExpect(jsonPath("$.data[0].token").doesNotExist());

    em.createNativeQuery("UPDATE workspace_invites SET expires_at = now() - interval '1 minute'")
        .executeUpdate();
    em.clear(); // the native update bypasses the persistence context
    mockMvc.perform(post("/api/v1/invites/" + token + "/accept").header("Authorization", jwt(invitee)))
        .andExpect(status().isNotFound());
    // an expired invite no longer blocks a fresh one for the same email
    invite(invitee.getEmail(), "reviewer");
  }

  @Test
  void revokeAndDuplicateAndValidation() throws Exception {
    JsonNode created = invite("someone@example.com", "editor");
    mockMvc.perform(json(post("/api/v1/workspaces/current/invites"), adminJwt,
        "{\"email\":\"SOMEONE@example.com\",\"role\":\"viewer\"}")).andExpect(status().isConflict());
    mockMvc.perform(json(post("/api/v1/workspaces/current/invites"), adminJwt,
        "{\"email\":\"not-an-email\",\"role\":\"viewer\"}")).andExpect(status().isBadRequest());
    mockMvc.perform(json(post("/api/v1/workspaces/current/invites"), adminJwt,
        "{\"email\":\"a@example.com\",\"role\":\"owner\"}")).andExpect(status().isBadRequest());

    String token = created.get("token").asText();
    mockMvc.perform(delete("/api/v1/workspaces/current/invites/" + created.get("id").asText())
        .header("Authorization", adminJwt)).andExpect(status().isNoContent());
    mockMvc.perform(delete("/api/v1/workspaces/current/invites/" + created.get("id").asText())
        .header("Authorization", adminJwt)).andExpect(status().isNotFound());
    User late = persistUser("inv-late");
    mockMvc.perform(post("/api/v1/invites/" + token + "/accept").header("Authorization", jwt(late)))
        .andExpect(status().isNotFound());
    assertThat(auditActions()).contains("invite.revoke");
  }

  @Test
  void invitesAreAdminOnlyAndWorkspaceScoped() throws Exception {
    String body = "{\"email\":\"x@example.com\",\"role\":\"viewer\"}";
    mockMvc.perform(json(post("/api/v1/workspaces/current/invites"), viewerJwt, body)
        .header("X-Workspace-ID", ws.getId().toString())).andExpect(status().isForbidden());
    mockMvc.perform(get("/api/v1/workspaces/current/invites").header("Authorization", viewerJwt)
        .header("X-Workspace-ID", ws.getId().toString())).andExpect(status().isForbidden());
    // a non-member naming the workspace gets 404
    mockMvc.perform(json(post("/api/v1/workspaces/current/invites"), outsiderJwt, body)
        .header("X-Workspace-ID", ws.getId().toString())).andExpect(status().isNotFound());
    JsonNode inv = invite("y@example.com", "viewer");
    mockMvc.perform(delete("/api/v1/workspaces/current/invites/" + inv.get("id").asText())
        .header("Authorization", outsiderJwt)).andExpect(status().isNotFound());
  }

  @Test
  void slugTakenIs409() throws Exception {
    mockMvc.perform(json(patch("/api/v1/workspaces/current"), adminJwt,
        "{\"name\":\"Acme\",\"slug\":\"acme-co\",\"joinPolicy\":\"request\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.slug", is("acme-co")))
        .andExpect(jsonPath("$.data.name", is("Acme")))
        .andExpect(jsonPath("$.data.joinPolicy", is("request")));
    mockMvc.perform(json(patch("/api/v1/workspaces/current"), jwt(outsider),
        "{\"slug\":\"acme-co\"}")).andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code", is("SLUG_TAKEN")));
    mockMvc.perform(json(patch("/api/v1/workspaces/current"), adminJwt, "{\"slug\":\"A_b\"}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(patch("/api/v1/workspaces/current"), adminJwt, "{}"))
        .andExpect(status().isBadRequest());
    assertThat(auditActions()).contains("workspace.update");
  }

  @Test
  void nonAdminPatchIs403() throws Exception {
    mockMvc.perform(json(patch("/api/v1/workspaces/current"), viewerJwt, "{\"name\":\"Hax\"}")
        .header("X-Workspace-ID", ws.getId().toString())).andExpect(status().isForbidden());
  }

  @Test
  void xWorkspaceIdOfNonMemberIs404() throws Exception {
    mockMvc.perform(get("/api/v1/workspaces/current").header("Authorization", outsiderJwt)
        .header("X-Workspace-ID", ws.getId().toString())).andExpect(status().isNotFound());
    mockMvc.perform(get("/api/v1/workspaces/current").header("Authorization", viewerJwt)
        .header("X-Workspace-ID", ws.getId().toString())).andExpect(status().isOk())
        .andExpect(jsonPath("$.data.role", is("viewer")))
        .andExpect(jsonPath("$.data.id", is(ws.getId().toString())));
    mockMvc.perform(get("/api/v1/workspaces/current").header("Authorization", viewerJwt)
        .header("X-Workspace-ID", "not-a-uuid")).andExpect(status().isBadRequest());
  }

  @Test
  void seatLimitIs402OnFreePlan() throws Exception {
    // free plan: 3 editor seats (admin + 2 editors); the 4th is refused at invite and accept
    for (String p : List.of("e1", "e2")) {
      User e = persistUser("seat-" + p);
      memberships.saveAndFlush(new WorkspaceMembership(ws, e, "editor", "active"));
    }
    mockMvc.perform(json(post("/api/v1/workspaces/current/invites"), adminJwt,
        "{\"email\":\"seat@example.com\",\"role\":\"editor\"}"))
        .andExpect(status().isPaymentRequired())
        .andExpect(jsonPath("$.error.limit", is("editors")))
        .andExpect(jsonPath("$.error.code", is("LIMIT_REACHED")));
    invite("viewer-ok@example.com", "viewer"); // viewers do not use seats
  }
}
