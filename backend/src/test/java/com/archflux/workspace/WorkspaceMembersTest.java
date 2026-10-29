package com.archflux.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import com.archflux.domain.AuditEvent;
import com.archflux.domain.Diagram;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.repo.AuditEventRepository;
import com.archflux.repo.DiagramRepository;
import com.archflux.repo.WorkspaceMembershipRepository;
import com.archflux.repo.WorkspaceRepository;

/** R1-E11-T02: members management API. */
class WorkspaceMembersTest extends WorkspaceTestBase {

  @Autowired private WorkspaceMembershipRepository memberships;
  @Autowired private WorkspaceRepository workspaces;
  @Autowired private DiagramRepository diagrams;
  @Autowired private AuditEventRepository auditEvents;

  private User admin;
  private User editor;
  private User viewer;
  private User outsider;
  private Workspace ws;
  private String adminJwt;
  private String editorJwt;
  private String outsiderJwt;

  @BeforeEach
  void setUp() {
    admin = persistUser("mem-admin");
    editor = persistUser("mem-editor");
    viewer = persistUser("mem-viewer");
    outsider = persistUser("mem-out");
    ws = personal(admin);
    personal(outsider);
    memberships.saveAndFlush(new WorkspaceMembership(ws, editor, "editor", "active"));
    memberships.saveAndFlush(new WorkspaceMembership(ws, viewer, "viewer", "active"));
    adminJwt = jwt(admin);
    editorJwt = jwt(editor);
    outsiderJwt = jwt(outsider);
  }

  private String url(User u) {
    return "/api/v1/workspaces/current/members/" + u.getId();
  }

  private List<String> auditActions() {
    return auditEvents.findByWorkspaceIdOrderByCreatedAtDesc(ws.getId(), PageRequest.of(0, 100))
        .stream().map(AuditEvent::getAction).toList();
  }

  @Test
  void listShowsRosterAndPendingInvitesForAdmin() throws Exception {
    mockMvc.perform(json(post("/api/v1/workspaces/current/invites"), adminJwt,
        "{\"email\":\"newbie-" + UUID.randomUUID() + "@archflux.local\",\"role\":\"viewer\"}"))
        .andExpect(status().isCreated());
    mockMvc.perform(get("/api/v1/workspaces/current/members").header("Authorization", adminJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.members", hasSize(3)))
        .andExpect(jsonPath("$.data.members[0].userId", is(admin.getId().toString())))
        .andExpect(jsonPath("$.data.members[0].role", is("admin")))
        .andExpect(jsonPath("$.data.members[0].status", is("active")))
        .andExpect(jsonPath("$.data.invites", hasSize(1)));
    mockMvc.perform(get("/api/v1/workspaces/current/members").header("Authorization", editorJwt)
        .header("X-Workspace-ID", ws.getId().toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.members", hasSize(3)))
        .andExpect(jsonPath("$.data.invites", hasSize(0)));
  }

  @Test
  void unauthenticatedIs401() throws Exception {
    mockMvc.perform(get("/api/v1/workspaces/current/members")).andExpect(status().isUnauthorized());
    mockMvc.perform(delete(url(viewer))).andExpect(status().isUnauthorized());
  }

  @Test
  void nonMemberOfRequestedWorkspaceIs404() throws Exception {
    String h = ws.getId().toString();
    mockMvc.perform(get("/api/v1/workspaces/current/members").header("Authorization", outsiderJwt)
        .header("X-Workspace-ID", h)).andExpect(status().isNotFound());
    mockMvc.perform(json(patch(url(viewer)), outsiderJwt, "{\"role\":\"editor\"}")
        .header("X-Workspace-ID", h)).andExpect(status().isNotFound());
    mockMvc.perform(delete(url(viewer)).header("Authorization", outsiderJwt)
        .header("X-Workspace-ID", h)).andExpect(status().isNotFound());
    // a user from another workspace is not addressable through this one
    mockMvc.perform(json(patch(url(outsider)), adminJwt, "{\"role\":\"viewer\"}"))
        .andExpect(status().isNotFound());
    mockMvc.perform(delete(url(outsider)).header("Authorization", adminJwt))
        .andExpect(status().isNotFound());
  }

  @Test
  void nonAdminCannotChangeOrRemove() throws Exception {
    String h = ws.getId().toString();
    mockMvc.perform(json(patch(url(viewer)), editorJwt, "{\"role\":\"editor\"}")
        .header("X-Workspace-ID", h)).andExpect(status().isForbidden());
    mockMvc.perform(delete(url(viewer)).header("Authorization", editorJwt)
        .header("X-Workspace-ID", h)).andExpect(status().isForbidden());
  }

  @Test
  void invalidRoleIs400() throws Exception {
    mockMvc.perform(json(patch(url(viewer)), adminJwt, "{\"role\":\"owner\"}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(patch(url(viewer)), adminJwt, "{}")).andExpect(status().isBadRequest());
  }

  @Test
  void changeRoleHappyPathIsAudited() throws Exception {
    mockMvc.perform(json(patch(url(viewer)), adminJwt, "{\"role\":\"reviewer\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.role", is("reviewer")))
        .andExpect(jsonPath("$.data.userId", is(viewer.getId().toString())));
    assertThat(auditActions()).contains("member.update");
  }

  @Test
  void lastAdminProtected() throws Exception {
    // sole admin: demote self and remove self are both 409 LAST_ADMIN
    mockMvc.perform(json(patch(url(admin)), adminJwt, "{\"role\":\"editor\"}"))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code", is("LAST_ADMIN")));
    mockMvc.perform(delete(url(admin)).header("Authorization", adminJwt))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code", is("LAST_ADMIN")));

    // with a second admin, either can be demoted, but not both
    mockMvc.perform(json(patch(url(editor)), adminJwt, "{\"role\":\"admin\"}"))
        .andExpect(status().isOk());
    mockMvc.perform(json(patch(url(admin)), adminJwt, "{\"role\":\"editor\"}"))
        .andExpect(status().isOk());
    mockMvc.perform(json(patch(url(editor)), editorJwt, "{\"role\":\"viewer\"}"))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code", is("LAST_ADMIN")));
    mockMvc.perform(delete(url(editor)).header("Authorization", editorJwt))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code", is("LAST_ADMIN")));
  }

  @Test
  void removingMemberTransfersDiagrams() throws Exception {
    Diagram d = new Diagram();
    d.setOwner(editor);
    d.setWorkspace(ws);
    d.setTitle("Editor's diagram");
    d.setTags(List.of());
    d.setGraph("{}");
    d = diagrams.saveAndFlush(d);

    mockMvc.perform(delete(url(editor)).header("Authorization", adminJwt))
        .andExpect(status().isNoContent());

    assertThat(memberships.existsById_WorkspaceIdAndId_UserId(ws.getId(), editor.getId()))
        .isFalse();
    Diagram after = diagrams.findById(d.getId()).orElseThrow();
    assertThat(after.ownerId()).isEqualTo(admin.getId());
    mockMvc.perform(get("/api/v1/diagrams/" + d.getId()).header("Authorization", adminJwt))
        .andExpect(status().isOk());
    mockMvc.perform(get("/api/v1/diagrams/" + d.getId()).header("Authorization", editorJwt))
        .andExpect(status().isNotFound());
    assertThat(auditActions()).contains("member.remove", "diagram.transfer");
    mockMvc.perform(get("/api/v1/workspaces/current/members").header("Authorization", adminJwt))
        .andExpect(jsonPath("$.data.members", hasSize(2)));
  }

  @Test
  void adminCannotRemoveSelfWhenAnotherAdminExists() throws Exception {
    mockMvc.perform(json(patch(url(editor)), adminJwt, "{\"role\":\"admin\"}"))
        .andExpect(status().isOk());
    mockMvc.perform(delete(url(admin)).header("Authorization", adminJwt))
        .andExpect(status().isBadRequest());
  }

  @Test
  void promoteToEditorChecksSeatLimit() throws Exception {
    // free plan: 3 editor seats (admin + editor + one more); viewer promotion fits only once
    User extra = persistUser("mem-extra");
    memberships.saveAndFlush(new WorkspaceMembership(ws, extra, "editor", "active"));
    mockMvc.perform(json(patch(url(viewer)), adminJwt, "{\"role\":\"editor\"}"))
        .andExpect(status().isPaymentRequired())
        .andExpect(jsonPath("$.error.code", is("LIMIT_REACHED")))
        .andExpect(jsonPath("$.error.limit", is("editors")))
        .andExpect(jsonPath("$.error.current", is(3)))
        .andExpect(jsonPath("$.error.max", is(3)));
    // non-seat role changes are never limited
    mockMvc.perform(json(patch(url(viewer)), adminJwt, "{\"role\":\"reviewer\"}"))
        .andExpect(status().isOk());
    // upgrading the plan lifts the limit
    ws.setPlan("team");
    workspaces.saveAndFlush(ws);
    mockMvc.perform(json(patch(url(viewer)), adminJwt, "{\"role\":\"editor\"}"))
        .andExpect(status().isOk());
  }
}
