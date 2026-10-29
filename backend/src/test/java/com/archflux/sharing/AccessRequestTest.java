package com.archflux.sharing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.TestInfraMocks;
import com.archflux.domain.DiagramMember;
import com.archflux.repo.DiagramMemberRepository;
import com.archflux.security.ShareTokens;

/** R1-E07-T04: GET /access states and access requests. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class AccessRequestTest extends SharingIT {

  @Autowired
  private DiagramMemberRepository members;

  private String id;
  private String access;
  private String workspaceToken;

  @BeforeEach
  void setUp() throws Exception {
    setUpPeople("areq");
    id = createDiagram(aliceJwt, "Ledger");
    access = "/api/v1/diagrams/" + id + "/access";
    MvcResult link = mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/links"), aliceJwt,
            "{\"role\":\"viewer\",\"audience\":\"workspace\"}"))
        .andExpect(status().isCreated())
        .andReturn();
    workspaceToken = body(link).get("data").get("token").asText();
  }

  private MvcResult requestAccess(String jwt, String role) throws Exception {
    return mockMvc.perform(json(post(access + "-requests"), jwt,
            "{\"role\":\"" + role + "\",\"note\":\"need it for the audit\"}")
            .header(ShareTokens.HEADER, workspaceToken))
        .andReturn();
  }

  @Test
  void strangerGetsNotFoundState() throws Exception {
    // Same body for a real diagram and a random id: no existence leak.
    for (String target : new String[] {id, UUID.randomUUID().toString()}) {
      mockMvc.perform(get("/api/v1/diagrams/" + target + "/access").header("Authorization", bobJwt))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.data.state", is("not_found")))
          .andExpect(jsonPath("$.data.title").doesNotExist())
          .andExpect(jsonPath("$.data.ownerName").doesNotExist())
          .andExpect(jsonPath("$.data.role").doesNotExist());
    }
    // Signed out with only a workspace link: not_found too.
    mockMvc.perform(get(access).header(ShareTokens.HEADER, workspaceToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.state", is("not_found")));
    mockMvc.perform(get(access)).andExpect(status().isUnauthorized());
    // A stranger cannot file a request.
    mockMvc.perform(json(post(access + "-requests"), bobJwt, "{\"role\":\"viewer\"}"))
        .andExpect(status().isNotFound());
    // Members are ok with their role.
    mockMvc.perform(get(access).header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data.state", is("ok")))
        .andExpect(jsonPath("$.data.role", is("owner")));
  }

  @Test
  void sameWorkspaceNoMemberGetsRequestState() throws Exception {
    // In the workspace without a diagram_members row: every workspace role
    // maps to at least viewer (DATA_MODEL_R1 §4.3), so the state is ok.
    mockMvc.perform(get(access).header("Authorization", viewerJwt))
        .andExpect(jsonPath("$.data.state", is("ok")))
        .andExpect(jsonPath("$.data.role", is("viewer")));
    // Signed in, no access, but holding a live workspace link: request.
    mockMvc.perform(get(access).header("Authorization", bobJwt)
            .header(ShareTokens.HEADER, workspaceToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.state", is("request")))
        .andExpect(jsonPath("$.data.title", is("Ledger")))
        .andExpect(jsonPath("$.data.ownerName", is("Alice")))
        .andExpect(jsonPath("$.data.role").doesNotExist());
    try (LogCapture logs = new LogCapture()) {
      mockMvc.perform(json(post(access + "-requests"), bobJwt,
              "{\"role\":\"editor\",\"note\":\"please\"}").header(ShareTokens.HEADER, workspaceToken))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.data.status", is("pending")))
          .andExpect(jsonPath("$.data.role", is("editor")))
          .andExpect(jsonPath("$.data.diagramTitle", is("Ledger")));
      assertThat(logs.everything())
          .contains("MOCK EMAIL sent to " + alice.getEmail() + ": Bob requested editor access to Ledger");
    }
    assertThat(auditActions(aliceWs.getId())).contains("access.request");
    // A member who already has access gets 409, invalid input 400, no token 401.
    mockMvc.perform(json(post(access + "-requests"), viewerJwt, "{\"role\":\"editor\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code", is("ALREADY_HAS_ACCESS")));
    mockMvc.perform(json(post(access + "-requests"), bobJwt, "{\"role\":\"owner\"}")
            .header(ShareTokens.HEADER, workspaceToken))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(post(access + "-requests"), bobJwt,
            "{\"role\":\"viewer\",\"note\":\"" + "x".repeat(501) + "\"}")
            .header(ShareTokens.HEADER, workspaceToken))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(post(access + "-requests"), null, "{\"role\":\"viewer\"}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void duplicatePendingIs409() throws Exception {
    assertThat(requestAccess(bobJwt, "viewer").getResponse().getStatus()).isEqualTo(201);
    MvcResult again = requestAccess(bobJwt, "commenter");
    assertThat(again.getResponse().getStatus()).isEqualTo(409);
    assertThat(body(again).get("error").get("code").asText()).isEqualTo("REQUEST_PENDING");
  }

  @Test
  void approveCreatesMember() throws Exception {
    String requestId = body(requestAccess(bobJwt, "editor")).get("data").get("id").asText();
    // The owner's inbox lists it; viewers, commenters and strangers see nothing.
    mockMvc.perform(get("/api/v1/access-requests").header("Authorization", aliceJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()", is(1)))
        .andExpect(jsonPath("$.data[0].id", is(requestId)))
        .andExpect(jsonPath("$.data[0].requesterName", is("Bob")))
        .andExpect(jsonPath("$.data[0].note", is("need it for the audit")));
    mockMvc.perform(get("/api/v1/access-requests").header("Authorization", editorJwt))
        .andExpect(jsonPath("$.data.length()", is(1)));
    for (String jwt : new String[] {viewerJwt, reviewerJwt, bobJwt}) {
      mockMvc.perform(get("/api/v1/access-requests").header("Authorization", jwt))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.data.length()", is(0)));
    }
    mockMvc.perform(get("/api/v1/access-requests?status=bogus").header("Authorization", aliceJwt))
        .andExpect(status().isBadRequest());
    mockMvc.perform(get("/api/v1/access-requests")).andExpect(status().isUnauthorized());

    String approve = "/api/v1/access-requests/" + requestId + "/approve";
    mockMvc.perform(post(approve).header("Authorization", viewerJwt))
        .andExpect(status().isForbidden());
    mockMvc.perform(post(approve).header("Authorization", bobJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(post("/api/v1/access-requests/" + UUID.randomUUID() + "/approve")
            .header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(json(post(approve), aliceJwt, "{\"role\":\"owner\"}"))
        .andExpect(status().isBadRequest());

    // Owner downgrades editor -> commenter while approving.
    try (LogCapture logs = new LogCapture()) {
      mockMvc.perform(json(post(approve), aliceJwt, "{\"role\":\"commenter\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.data.status", is("approved")))
          .andExpect(jsonPath("$.data.role", is("commenter")));
      assertThat(logs.everything())
          .contains("MOCK EMAIL sent to " + bob.getEmail() + ": Your request for Ledger was approved");
    }
    assertThat(members.findById(new DiagramMember.Key(UUID.fromString(id), bob.getId())))
        .get().extracting(DiagramMember::getRole).isEqualTo("commenter");
    mockMvc.perform(get(access).header("Authorization", bobJwt))
        .andExpect(jsonPath("$.data.state", is("ok")))
        .andExpect(jsonPath("$.data.role", is("commenter")));
    mockMvc.perform(post(approve).header("Authorization", aliceJwt))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code", is("REQUEST_DECIDED")));
    assertThat(auditActions(aliceWs.getId())).contains("access.approve");

    // Deny flow on a second requester.
    var carol = persistUser("areq-carol", "Carol");
    workspaceService.resolvePersonalWorkspace(carol.getId());
    String carolJwt = jwt(carol);
    String denyId = body(requestAccess(carolJwt, "viewer")).get("data").get("id").asText();
    mockMvc.perform(post("/api/v1/access-requests/" + denyId + "/deny").header("Authorization", viewerJwt))
        .andExpect(status().isForbidden());
    mockMvc.perform(post("/api/v1/access-requests/" + denyId + "/deny").header("Authorization", editorJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.status", is("denied")));
    assertThat(members.findById(new DiagramMember.Key(UUID.fromString(id), carol.getId()))).isEmpty();
    assertThat(auditActions(aliceWs.getId())).contains("access.deny");
    mockMvc.perform(get("/api/v1/access-requests?status=denied").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data.length()", is(1)));
  }

  @Test
  void trashedVisibleOnlyToOwner() throws Exception {
    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", editorJwt))
        .andExpect(status().isNoContent());
    mockMvc.perform(get(access).header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data.state", is("trashed")))
        .andExpect(jsonPath("$.data.title", is("Ledger")));
    // Editors, viewers, link holders and strangers: neutral not_found, no title.
    for (String jwt : new String[] {editorJwt, viewerJwt, bobJwt}) {
      mockMvc.perform(get(access).header("Authorization", jwt).header(ShareTokens.HEADER, workspaceToken))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.data.state", is("not_found")))
          .andExpect(jsonPath("$.data.title").doesNotExist());
    }
    // A diagram-level owner who is not a workspace admin also sees it.
    members.saveAndFlush(new DiagramMember(UUID.fromString(id), viewer.getId(), "owner", alice.getId()));
    mockMvc.perform(get(access).header("Authorization", viewerJwt))
        .andExpect(jsonPath("$.data.state", is("trashed")));
    // Restoring brings it back to ok.
    mockMvc.perform(post("/api/v1/diagrams/" + id + "/restore").header("Authorization", aliceJwt))
        .andExpect(status().isOk());
    mockMvc.perform(json(put("/api/v1/diagrams/" + id), editorJwt, "{\"title\":\"Ledger 2\"}"))
        .andExpect(status().isOk());
    mockMvc.perform(get(access).header("Authorization", editorJwt))
        .andExpect(jsonPath("$.data.state", is("ok")));
  }
}
