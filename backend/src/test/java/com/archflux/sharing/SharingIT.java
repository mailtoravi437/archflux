package com.archflux.sharing;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import com.archflux.PostgresIT;
import com.archflux.auth.JwtService;
import com.archflux.domain.AuditEvent;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.repo.AuditEventRepository;
import com.archflux.repo.UserRepository;
import com.archflux.repo.WorkspaceMembershipRepository;
import com.archflux.service.WorkspaceService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Shared fixtures for the R1-E07 sharing tests: Alice owns a workspace with
 * an editor, a reviewer and a viewer; Bob lives in a different workspace.
 */
abstract class SharingIT extends PostgresIT {

  @Autowired
  protected MockMvc mockMvc;

  @Autowired
  protected JwtService jwtService;

  @Autowired
  protected UserRepository users;

  @Autowired
  protected WorkspaceService workspaceService;

  @Autowired
  protected WorkspaceMembershipRepository memberships;

  @Autowired
  protected AuditEventRepository auditEvents;

  protected final ObjectMapper mapper = new ObjectMapper();

  protected User alice;
  protected User bob;
  protected User editor;
  protected User reviewer;
  protected User viewer;
  protected Workspace aliceWs;
  protected Workspace bobWs;
  protected String aliceJwt;
  protected String bobJwt;
  protected String editorJwt;
  protected String reviewerJwt;
  protected String viewerJwt;

  protected void setUpPeople(String prefix) {
    alice = persistUser(prefix + "-alice", "Alice");
    bob = persistUser(prefix + "-bob", "Bob");
    editor = persistUser(prefix + "-editor", "Eddie");
    reviewer = persistUser(prefix + "-reviewer", "Rita");
    viewer = persistUser(prefix + "-viewer", "Vic");
    aliceWs = workspaceService.resolvePersonalWorkspace(alice.getId());
    bobWs = workspaceService.resolvePersonalWorkspace(bob.getId());
    memberships.saveAndFlush(new WorkspaceMembership(aliceWs, editor, "editor", "active"));
    memberships.saveAndFlush(new WorkspaceMembership(aliceWs, reviewer, "reviewer", "active"));
    memberships.saveAndFlush(new WorkspaceMembership(aliceWs, viewer, "viewer", "active"));
    aliceJwt = jwt(alice);
    bobJwt = jwt(bob);
    editorJwt = jwt(editor);
    reviewerJwt = jwt(reviewer);
    viewerJwt = jwt(viewer);
  }

  protected User persistUser(String prefix, String name) {
    User user = new User(UUID.randomUUID(), prefix + "-" + UUID.randomUUID() + "@archflux.local",
        name, "member");
    user.setProvider("email");
    return users.saveAndFlush(user);
  }

  protected String jwt(User user) {
    return "Bearer " + jwtService.generateToken(user, "session-" + UUID.randomUUID());
  }

  protected MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String jwt,
      String body) {
    MockHttpServletRequestBuilder b = builder.contentType(MediaType.APPLICATION_JSON).content(body);
    return jwt == null ? b : b.header("Authorization", jwt);
  }

  protected JsonNode body(MvcResult result) throws Exception {
    return mapper.readTree(result.getResponse().getContentAsString());
  }

  /** Alice creates a diagram in her workspace (the creator gets the owner row). */
  protected String createDiagram(String jwt, String title) throws Exception {
    MvcResult result = mockMvc.perform(json(post("/api/v1/diagrams"), jwt,
            "{\"title\":\"" + title + "\",\"graph\":{\"nodes\":[]}}"))
        .andExpect(status().isCreated())
        .andReturn();
    return body(result).get("data").get("id").asText();
  }

  protected List<String> auditActions(UUID workspaceId) {
    return auditEvents.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId, PageRequest.of(0, 100))
        .stream().map(AuditEvent::getAction).toList();
  }
}
