package com.archflux.web;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import com.archflux.PostgresIT;
import com.archflux.TestInfraMocks;
import com.archflux.auth.JwtService;
import com.archflux.auth.MagicLinkService;
import com.archflux.domain.User;
import com.archflux.repo.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 2 revisions + optimistic concurrency: every mutation records a
 * revision with parent lineage and a stable content hash; stale versions get
 * 409 VERSION_CONFLICT; force:true bypasses but preserves history; diffs are
 * deterministic; foreign diagrams stay 404.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class RevisionConcurrencyTest extends PostgresIT {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private JwtService jwtService;

  @Autowired
  private UserRepository users;

  @MockitoBean
  private MagicLinkService magicLinkService;

  private final ObjectMapper mapper = new ObjectMapper();

  private User userA;
  private User userB;
  private String jwtA;
  private String jwtB;

  @BeforeEach
  void setUp() {
    userA = persistUser("rev-a-" + UUID.randomUUID() + "@archflux.local", "RevA");
    userB = persistUser("rev-b-" + UUID.randomUUID() + "@archflux.local", "RevB");
    jwtA = jwtService.generateToken(userA, "session-a");
    jwtB = jwtService.generateToken(userB, "session-b");
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

  private String createDiagram(String graphJson) throws Exception {
    MvcResult result = mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"rev-"
                + UUID.randomUUID() + "\",\"graph\":" + graphJson + "}"))
        .andExpect(status().isCreated())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString())
        .get("data").get("id").asText();
  }

  private JsonNode revisionsOf(String diagramId, String token) throws Exception {
    MvcResult result = mockMvc.perform(get("/api/v1/diagrams/" + diagramId + "/revisions")
            .header("Authorization", bearer(token)))
        .andExpect(status().isOk())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString()).get("data");
  }

  @Test
  void mutationsBuildParentChainWithStableHash() throws Exception {
    String id = createDiagram(
        "{\"nodes\":[{\"id\":\"a\",\"label\":\"A\"}],\"edges\":[]}");
    JsonNode revs = revisionsOf(id, jwtA);
    assert revs.size() == 1 : "create must record one revision";
    String rev1 = revs.get(0).get("id").asText();
    assert revs.get(0).get("parentRevisionId").isNull() : "first revision has no parent";
    String hash1 = revs.get(0).get("contentHash").asText();
    assert hash1 != null && hash1.length() == 64 : "sha256 hex hash expected";

    long v1 = mapper.readTree(mockMvc.perform(
            get("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA)))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
        .get("data").get("version").asLong();

    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"renamed\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.version", is((int) v1 + 1)));

    JsonNode revs2 = revisionsOf(id, jwtA);
    assert revs2.size() == 2 : "update must append a revision";
    assert revs2.get(0).get("parentRevisionId").asText().equals(rev1)
        : "newest revision parents the previous latest";

    // Title-only change keeps the same graph snapshot hash.
    assert revs2.get(0).get("contentHash").asText().equals(hash1)
        : "unchanged graph must keep a stable content hash";
  }

  @Test
  void staleVersionIs409AndForceBypassesWithHistory() throws Exception {
    String id = createDiagram(
        "{\"nodes\":[{\"id\":\"a\",\"label\":\"A\"}],\"edges\":[]}");
    long current = mapper.readTree(mockMvc.perform(
            get("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA)))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
        .get("data").get("version").asLong();

    MvcResult conflict = mockMvc.perform(put("/api/v1/diagrams/" + id)
            .header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"stale\",\"version\":" + (current - 1) + "}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code", is("VERSION_CONFLICT")))
        .andReturn();
    String message = mapper.readTree(conflict.getResponse().getContentAsString())
        .get("error").get("message").asText();
    assert message.equals(
        "Diagram changed since version " + (current - 1) + " (current " + current + "). Reload and retry.")
        : "unexpected 409 message: " + message;

    // History untouched by the rejected write.
    assert revisionsOf(id, jwtA).size() == 1 : "rejected write must not record a revision";

    // Query-param version works too; force bypasses but preserves history.
    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA))
            .param("version", String.valueOf(current - 1))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"forced\",\"force\":true}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.title", is("forced")));
    assert revisionsOf(id, jwtA).size() == 2 : "forced overwrite must still record history";
  }

  @Test
  void diffReportsAddedRemovedChanged() throws Exception {
    String id = createDiagram(
        "{\"nodes\":[{\"id\":\"a\",\"label\":\"A\"},{\"id\":\"b\",\"label\":\"B\"}],"
            + "\"edges\":[{\"id\":\"e1\",\"from\":\"a\",\"to\":\"b\",\"label\":\"x\"}]}");
    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"graph\":{\"nodes\":[{\"id\":\"a\",\"label\":\"A2\"},"
                + "{\"id\":\"c\",\"label\":\"C\",\"shape\":\"box\"}],\"edges\":[]}}"))
        .andExpect(status().isOk());

    JsonNode revs = revisionsOf(id, jwtA);
    String newer = revs.get(0).get("id").asText();
    String older = revs.get(1).get("id").asText();

    MvcResult result = mockMvc.perform(get("/api/v1/diagrams/" + id + "/diff")
            .header("Authorization", bearer(jwtA))
            .param("from", older).param("to", newer))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.added.length()", is(1)))
        .andExpect(jsonPath("$.added[0].id", is("c")))
        .andExpect(jsonPath("$.added[0].type", is("node")))
        .andExpect(jsonPath("$.removed.length()", is(2)))
        .andExpect(jsonPath("$.changed.length()", is(1)))
        .andExpect(jsonPath("$.changed[0].id", is("a")))
        .andReturn();
    JsonNode diff = mapper.readTree(result.getResponse().getContentAsString());
    boolean labelChanged = false;
    for (JsonNode field : diff.get("changed").get(0).get("fields")) {
      if (field.asText().equals("label")) {
        labelChanged = true;
      }
    }
    assert labelChanged : "changed fields must include label";
  }

  @Test
  void foreignDiagramRevisionsAre404() throws Exception {
    String id = createDiagram("{\"nodes\":[],\"edges\":[]}");
    JsonNode revs = revisionsOf(id, jwtA);
    String revId = revs.get(0).get("id").asText();

    mockMvc.perform(get("/api/v1/diagrams/" + id + "/revisions")
            .header("Authorization", bearer(jwtB)))
        .andExpect(status().isNotFound());
    mockMvc.perform(get("/api/v1/diagrams/" + id + "/revisions/" + revId)
            .header("Authorization", bearer(jwtB)))
        .andExpect(status().isNotFound());
    mockMvc.perform(get("/api/v1/diagrams/" + id + "/diff")
            .header("Authorization", bearer(jwtB))
            .param("from", revId).param("to", revId))
        .andExpect(status().isNotFound());
  }

  @Test
  void structurallyInvalidGraphIs422() throws Exception {
    mockMvc.perform(post("/api/v1/diagrams").header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"bad\",\"graph\":{\"nodes\":\"nope\"}}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.error.code", is("UNPROCESSABLE_ENTITY")));

    String id = createDiagram("{\"nodes\":[],\"edges\":[]}");
    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"nodes\":{\"not\":\"an-array\"}}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.error.code", is("UNPROCESSABLE_ENTITY")));

    // Blank title stays 400; malformed JSON stays 400.
    mockMvc.perform(post("/api/v1/diagrams").header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"  \"}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(post("/api/v1/diagrams").header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{not json"))
        .andExpect(status().isBadRequest());
  }
}
