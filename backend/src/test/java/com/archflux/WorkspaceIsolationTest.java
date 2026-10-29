package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import com.archflux.auth.JwtService;
import com.archflux.domain.User;
import com.archflux.repo.UserRepository;
import com.archflux.service.WorkspaceService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * PROD-002 workspace isolation (Phase 1): JWTs minted via the real
 * {@link JwtService} (claims constructed by {@code generateToken}, never
 * hand-rolled) resolve to the real user UUID through the reworked
 * {@code AuthFilter}; services scope every diagram, checkpoint, thread, and
 * export by workspace membership with 404 for foreign reads and writes (R1-E07-T01)
 * semantics and identical response shapes.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class WorkspaceIsolationTest extends PostgresIT {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private JwtService jwtService;

  @Autowired
  private UserRepository users;

  @Autowired
  private WorkspaceService workspaceService;

  private final ObjectMapper mapper = new ObjectMapper();

  private User userA;
  private User userB;
  private String jwtA;
  private String jwtB;

  @BeforeEach
  void setUp() {
    userA = persistUser("iso-alice-" + UUID.randomUUID() + "@archflux.local", "Alice Iso");
    userB = persistUser("iso-bob-" + UUID.randomUUID() + "@archflux.local", "Bob Iso");
    // Mint through JwtService.generateToken (the shared contract) and pin
    // the subject to the real user UUID.
    jwtA = jwtService.generateToken(userA, "session-iso-a");
    jwtB = jwtService.generateToken(userB, "session-iso-b");
    assertThat(jwtService.getUserId(jwtA)).isEqualTo(userA.getId());
    assertThat(jwtService.getUserId(jwtB)).isEqualTo(userB.getId());
  }

  private User persistUser(String email, String name) {
    User user = new User();
    user.setEmail(email);
    user.setName(name);
    user.setProvider("email");
    user.setProviderId(email);
    user.setRole("member");
    return users.saveAndFlush(user);
  }

  private static String bearer(String token) {
    return "Bearer " + token;
  }

  private String createDiagram(String token, String title) throws Exception {
    MvcResult result = mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"" + title + "\",\"tags\":[\"t\"],"
                + "\"graph\":{\"nodes\":[{\"id\":\"a\",\"label\":\"A\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"a\",\"to\":\"a\",\"label\":\"self\"}]}}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.id").exists())
        .andExpect(jsonPath("$.data.graph.nodes.length()", is(1)))
        .andReturn();
    JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
    return body.get("data").get("id").asText();
  }

  @Test
  void userBCannotReadMutateOrExportUserADiagram() throws Exception {
    String id = createDiagram(jwtA, "iso-secret-" + UUID.randomUUID());

    mockMvc.perform(post("/api/v1/diagrams/" + id + "/checkpoints")
            .header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"v1\"}"))
        .andExpect(status().isCreated());

    mockMvc.perform(post("/api/v1/diagrams/" + id + "/threads")
            .header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"author\":\"alice\",\"text\":\"private\"}"))
        .andExpect(status().isCreated());

    // B's list is empty — no inference of A's diagram.
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", bearer(jwtB)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total", is(0)))
        .andExpect(jsonPath("$.data.length()", is(0)));

    // Scoped reads of foreign rows behave as not-found.
    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtB)))
        .andExpect(status().isNotFound());

    mockMvc.perform(get("/api/v1/diagrams/" + id + "/threads")
            .header("Authorization", bearer(jwtB)))
        .andExpect(status().isNotFound());

    mockMvc.perform(get("/api/v1/diagrams/" + id + "/checkpoints")
            .header("Authorization", bearer(jwtB)))
        .andExpect(status().isNotFound());

    // Writes to foreign rows are 404 too (R1-E07-T01: no existence leak).
    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtB))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"hijack\"}"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code", is("NOT_FOUND")));

    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtB)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code", is("NOT_FOUND")));

    mockMvc.perform(post("/api/v1/diagrams/" + id + "/threads")
            .header("Authorization", bearer(jwtB))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"author\":\"bob\",\"text\":\"snoop\"}"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code", is("NOT_FOUND")));

    mockMvc.perform(post("/api/v1/diagrams/" + id + "/checkpoints")
            .header("Authorization", bearer(jwtB))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"evil\"}"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code", is("NOT_FOUND")));

    // Export of a foreign diagram is not-found.
    mockMvc.perform(get("/api/v1/export").header("Authorization", bearer(jwtB))
            .param("diagramId", id))
        .andExpect(status().isNotFound());

    // A still sees exactly their own diagram (response shapes unchanged).
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", bearer(jwtA)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total", is(1)))
        .andExpect(jsonPath("$.data.length()", is(1)));
  }

  @Test
  void personalWorkspaceIsAutoProvisionedForBrandNewUuid() throws Exception {
    // C exists as a User row but predates any membership (no V6 backfill ran
    // for them); creating a diagram lazily provisions their workspace.
    User userC = persistUser("iso-cara-" + UUID.randomUUID() + "@archflux.local", "Cara Iso");
    assertThat(workspaceService.workspaceIdsFor(userC.getId())).isEmpty();
    String jwtC = jwtService.generateToken(userC, "session-iso-c");

    String id = createDiagram(jwtC, "cara-first-" + UUID.randomUUID());
    assertThat(workspaceService.workspaceIdsFor(userC.getId())).hasSize(1);

    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", bearer(jwtC)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total", is(1)));

    // A brand-new UUID with no User row at all: the validated JWT provisions
    // the user (AuthFilter) and the personal workspace (WorkspaceService).
    UUID freshId = UUID.randomUUID();
    User ghost = new User(freshId, "iso-ghost-" + freshId + "@archflux.local", "Ghost Iso", "member");
    ghost.setProvider("email");
    String jwtGhost = jwtService.generateToken(ghost, "session-iso-ghost");
    assertThat(users.findById(freshId)).isEmpty();

    mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer(jwtGhost))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"ghost-first\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.id").exists());

    assertThat(users.findById(freshId)).isPresent();
    assertThat(workspaceService.workspaceIdsFor(freshId)).hasSize(1);
    assertThat(id).isNotBlank();
  }

  @Test
  void readinessReportsSchemaVersion() throws Exception {
    mockMvc.perform(get("/api/ready"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ready", is(true)))
        .andExpect(jsonPath("$.schemaVersion", is("unmanaged")));
  }
}
