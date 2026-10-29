package com.archflux.versions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.PostgresIT;
import com.archflux.TestInfraMocks;
import com.archflux.auth.JwtService;
import com.archflux.domain.AuditEvent;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.repo.AuditEventRepository;
import com.archflux.repo.RevisionRepository;
import com.archflux.repo.UserRepository;
import com.archflux.repo.WorkspaceMembershipRepository;
import com.archflux.service.WorkspaceService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** R1-E08-T02: named versions, restore, update source. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class NamedVersionTest extends PostgresIT {

  @Autowired private MockMvc mockMvc;
  @Autowired private JwtService jwtService;
  @Autowired private UserRepository users;
  @Autowired private WorkspaceService workspaceService;
  @Autowired private WorkspaceMembershipRepository memberships;
  @Autowired private RevisionRepository revisionRepo;
  @Autowired private AuditEventRepository auditEvents;
  private final ObjectMapper mapper = new ObjectMapper();

  private User owner;
  private User viewer;
  private User outsider;
  private Workspace ws;
  private String ownerJwt;
  private String viewerJwt;
  private String outsiderJwt;
  private String diagramId;

  private User persistUser(String prefix) {
    User user = new User(UUID.randomUUID(), prefix + "-" + UUID.randomUUID() + "@archflux.local",
        prefix, "member");
    user.setProvider("email");
    return users.saveAndFlush(user);
  }

  private String jwt(User u) {
    return "Bearer " + jwtService.generateToken(u, "session-" + UUID.randomUUID());
  }

  private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, String jwt,
      String body) {
    return b.header("Authorization", jwt).contentType(MediaType.APPLICATION_JSON).content(body);
  }

  @BeforeEach
  void setUp() throws Exception {
    owner = persistUser("nv-owner");
    viewer = persistUser("nv-viewer");
    outsider = persistUser("nv-out");
    ws = workspaceService.resolvePersonalWorkspace(owner.getId());
    workspaceService.resolvePersonalWorkspace(outsider.getId());
    memberships.saveAndFlush(new WorkspaceMembership(ws, viewer, "viewer", "active"));
    ownerJwt = jwt(owner);
    viewerJwt = jwt(viewer);
    outsiderJwt = jwt(outsider);
    MvcResult r = mockMvc.perform(json(post("/api/v1/diagrams"), ownerJwt,
        "{\"title\":\"Versions\",\"nodes\":[{\"id\":\"a\",\"label\":\"A\"}]}"))
        .andExpect(status().isCreated()).andReturn();
    diagramId = mapper.readTree(r.getResponse().getContentAsString()).at("/data/id").asText();
  }

  private JsonNode revisionList(String query) throws Exception {
    MvcResult r = mockMvc.perform(get("/api/v1/diagrams/" + diagramId + "/revisions" + query)
        .header("Authorization", ownerJwt)).andExpect(status().isOk()).andReturn();
    return mapper.readTree(r.getResponse().getContentAsString()).get("data");
  }

  private void update(String body) throws Exception {
    mockMvc.perform(json(put("/api/v1/diagrams/" + diagramId), ownerJwt, body))
        .andExpect(status().isOk());
  }

  private List<String> auditActions() {
    return auditEvents.findByWorkspaceIdOrderByCreatedAtDesc(ws.getId(), PageRequest.of(0, 100))
        .stream().map(AuditEvent::getAction).toList();
  }

  @Test
  void nameAndListNamedOnly() throws Exception {
    update("{\"nodes\":[{\"id\":\"a\",\"label\":\"A2\"}]}");
    JsonNode all = revisionList("");
    assertThat(all).hasSize(2);
    String revId = all.get(1).get("id").asText(); // oldest

    assertThat(revisionList("?named=true")).isEmpty();
    mockMvc.perform(json(patch("/api/v1/diagrams/" + diagramId + "/revisions/" + revId), ownerJwt,
        "{\"name\":\"v1 launch\",\"description\":\"first cut\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.name", is("v1 launch")))
        .andExpect(jsonPath("$.data.description", is("first cut")));

    mockMvc.perform(get("/api/v1/diagrams/" + diagramId + "/revisions?named=true")
        .header("Authorization", ownerJwt))
        .andExpect(jsonPath("$.data", hasSize(1)))
        .andExpect(jsonPath("$.data[0].id", is(revId)))
        .andExpect(jsonPath("$.data[0].name", is("v1 launch")))
        .andExpect(jsonPath("$.data[0].authorName", is("nv-owner")));
    mockMvc.perform(get("/api/v1/diagrams/" + diagramId + "/revisions")
        .header("Authorization", ownerJwt)).andExpect(jsonPath("$.data", hasSize(2)));

    // null name un-names
    mockMvc.perform(json(patch("/api/v1/diagrams/" + diagramId + "/revisions/" + revId), ownerJwt,
        "{\"name\":null}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.data.name", nullValue()));
    assertThat(revisionList("?named=true")).isEmpty();
    assertThat(auditActions()).contains("version.name");
  }

  @Test
  void nameValidationAndAuthEdges() throws Exception {
    String revId = revisionList("").get(0).get("id").asText();
    String url = "/api/v1/diagrams/" + diagramId + "/revisions/" + revId;
    mockMvc.perform(json(patch(url), ownerJwt, "{\"name\":\"" + "x".repeat(81) + "\"}"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc.perform(json(patch(url), ownerJwt,
        "{\"name\":\"ok\",\"description\":\"" + "x".repeat(2001) + "\"}"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc.perform(patch(url).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"n\"}"))
        .andExpect(status().isUnauthorized());
    mockMvc.perform(post(url + "/restore")).andExpect(status().isUnauthorized());
    // another workspace's diagram is 404
    mockMvc.perform(json(patch(url), outsiderJwt, "{\"name\":\"n\"}"))
        .andExpect(status().isNotFound());
    mockMvc.perform(post(url + "/restore").header("Authorization", outsiderJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(get("/api/v1/diagrams/" + diagramId + "/revisions")
        .header("Authorization", outsiderJwt)).andExpect(status().isNotFound());
    // unknown revision on an accessible diagram is 404
    mockMvc.perform(json(patch("/api/v1/diagrams/" + diagramId + "/revisions/" + UUID.randomUUID()),
        ownerJwt, "{\"name\":\"n\"}")).andExpect(status().isNotFound());
  }

  @Test
  void restoreCreatesNewRevisionNotRewind() throws Exception {
    JsonNode before = revisionList("");
    assertThat(before).hasSize(1);
    String firstId = before.get(0).get("id").asText();
    update("{\"nodes\":[{\"id\":\"a\",\"label\":\"A2\"},{\"id\":\"b\",\"label\":\"B\"}]}");
    assertThat(revisionList("")).hasSize(2);
    long versionBefore = mapper.readTree(mockMvc.perform(get("/api/v1/diagrams/" + diagramId)
        .header("Authorization", ownerJwt)).andReturn().getResponse().getContentAsString())
        .at("/data/version").asLong();

    MvcResult r = mockMvc.perform(post("/api/v1/diagrams/" + diagramId + "/revisions/" + firstId
        + "/restore").header("Authorization", ownerJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.nodes", hasSize(1)))
        .andExpect(jsonPath("$.data.nodes[0].label", is("A")))
        .andReturn();
    assertThat(mapper.readTree(r.getResponse().getContentAsString()).at("/data/version").asLong())
        .isEqualTo(versionBefore + 1);

    JsonNode after = revisionList("");
    assertThat(after).hasSize(3);
    assertThat(after.get(0).get("source").asText()).isEqualTo("restore");
    assertThat(after.get(0).get("message").asText())
        .isEqualTo("Restored " + firstId.substring(0, 8));
    assertThat(after.get(0).get("contentHash").asText())
        .isEqualTo(after.get(2).get("contentHash").asText());
    assertThat(revisionRepo.countByDiagram_Id(UUID.fromString(diagramId))).isEqualTo(3);

    // a named version restores with its name in the message
    mockMvc.perform(json(patch("/api/v1/diagrams/" + diagramId + "/revisions/" + firstId),
        ownerJwt, "{\"name\":\"Baseline\"}")).andExpect(status().isOk());
    mockMvc.perform(post("/api/v1/diagrams/" + diagramId + "/revisions/" + firstId + "/restore")
        .header("Authorization", ownerJwt)).andExpect(status().isOk());
    assertThat(revisionList("").get(0).get("message").asText()).isEqualTo("Restored Baseline");
    assertThat(auditActions()).contains("version.restore");
  }

  @Test
  void revertSourceAccepted_otherSourceRejected() throws Exception {
    mockMvc.perform(json(put("/api/v1/diagrams/" + diagramId), ownerJwt,
        "{\"nodes\":[],\"source\":\"revert\"}")).andExpect(status().isOk());
    assertThat(revisionList("").get(0).get("source").asText()).isEqualTo("revert");
    mockMvc.perform(json(put("/api/v1/diagrams/" + diagramId), ownerJwt,
        "{\"nodes\":[],\"source\":\"import\"}")).andExpect(status().isOk());
    for (String bad : List.of("restore", "sync", "webhook", "bogus")) {
      mockMvc.perform(json(put("/api/v1/diagrams/" + diagramId), ownerJwt,
          "{\"nodes\":[],\"source\":\"" + bad + "\"}"))
          .andExpect(status().isUnprocessableEntity());
    }
    assertThat(revisionList("")).hasSize(3);
  }

  @Test
  void viewerCannotNameOrRestore() throws Exception {
    String revId = revisionList("").get(0).get("id").asText();
    String url = "/api/v1/diagrams/" + diagramId + "/revisions/" + revId;
    // a viewer can still read the timeline
    mockMvc.perform(get("/api/v1/diagrams/" + diagramId + "/revisions")
        .header("Authorization", viewerJwt)).andExpect(status().isOk());
    mockMvc.perform(json(patch(url), viewerJwt, "{\"name\":\"n\"}"))
        .andExpect(status().isForbidden());
    mockMvc.perform(post(url + "/restore").header("Authorization", viewerJwt))
        .andExpect(status().isForbidden());
    assertThat(revisionList("")).hasSize(1);
  }
}
