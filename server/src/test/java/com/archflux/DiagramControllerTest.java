package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.config.AppProperties;
import com.archflux.domain.Diagram;
import com.archflux.domain.User;
import com.archflux.repo.DiagramRepository;
import com.archflux.repo.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** HTTP contract tests: auth, CRUD, validation, pagination cap, engines, export. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DiagramControllerTest extends PostgresIT {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private AppProperties appProperties;

  @Autowired
  private UserRepository users;

  @Autowired
  private DiagramRepository diagrams;

  private final ObjectMapper mapper = new ObjectMapper();

  private String bearer() {
    return "Bearer " + appProperties.effectiveToken();
  }

  private String createDiagram(String title) throws Exception {
    MvcResult result = mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer())
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
  void healthAndReadyArePublic() throws Exception {
    mockMvc.perform(get("/api/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status", is("UP")));
    mockMvc.perform(get("/api/ready"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ready", is(true)));
  }

  @Test
  void missingTokenIs401() throws Exception {
    mockMvc.perform(get("/api/v1/diagrams"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code", is("UNAUTHENTICATED")));
    mockMvc.perform(post("/api/v1/lint")
            .contentType(MediaType.APPLICATION_JSON).content("{\"nodes\":[],\"edges\":[]}"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code", is("UNAUTHENTICATED")));
  }

  @Test
  void wrongTokenIs401() throws Exception {
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", "Bearer wrong-token"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code", is("UNAUTHENTICATED")));
  }

  @Test
  void createGetUpdateDeleteRoundTrip() throws Exception {
    String id = createDiagram("crud-" + UUID.randomUUID());

    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.title", containsString("crud-")));

    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"renamed\",\"tags\":[\"n1\",\"n2\"]}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.title", is("renamed")))
        .andExpect(jsonPath("$.data.tags.length()", is(2)));

    // Flat-field graph update replaces edges only (nodes merge from current graph).
    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"edges\":[]}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.edges.length()", is(0)))
        .andExpect(jsonPath("$.data.nodes.length()", is(1)));

    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", bearer()))
        .andExpect(status().isNoContent());

    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", bearer()))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code", is("NOT_FOUND")));
  }

  @Test
  void unknownDiagramIs404() throws Exception {
    mockMvc.perform(get("/api/v1/diagrams/" + UUID.randomUUID()).header("Authorization", bearer()))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code", is("NOT_FOUND")));
  }

  @Test
  void blankTitleIsValidationError() throws Exception {
    mockMvc.perform(post("/api/v1/diagrams").header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"  \"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")));
  }

  @Test
  void malformedJsonIsValidationError() throws Exception {
    mockMvc.perform(post("/api/v1/diagrams").header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")));
  }

  @Test
  void writesToForeignDiagramAreForbidden() throws Exception {
    User other = users.saveAndFlush(
        new User(UUID.randomUUID(), "other-" + UUID.randomUUID() + "@x.local", "Other", "member"));
    Diagram foreign = new Diagram();
    foreign.setOwner(other);
    foreign.setTitle("not yours");
    foreign.setTags(List.of());
    foreign.setGraph("{}");
    foreign = diagrams.saveAndFlush(foreign);

    mockMvc.perform(put("/api/v1/diagrams/" + foreign.getId()).header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"hijack\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("FORBIDDEN")));

    mockMvc.perform(delete("/api/v1/diagrams/" + foreign.getId()).header("Authorization", bearer()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("FORBIDDEN")));

    mockMvc.perform(post("/api/v1/diagrams/" + foreign.getId() + "/threads")
            .header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"author\":\"x\",\"text\":\"y\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("FORBIDDEN")));

    // Scoped reads of foreign rows behave as not-found.
    mockMvc.perform(get("/api/v1/diagrams/" + foreign.getId()).header("Authorization", bearer()))
        .andExpect(status().isNotFound());
  }

  @Test
  void paginationCapAndSearch() throws Exception {
    String marker = "cap-" + UUID.randomUUID();
    for (int i = 0; i < 3; i++) {
      createDiagram(marker + "-" + i);
    }
    // limit above the hard max is capped to 50.
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", bearer())
            .param("limit", "500").param("q", marker))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.limit", is(50)))
        .andExpect(jsonPath("$.page", is(1)))
        .andExpect(jsonPath("$.total", is(3)))
        .andExpect(jsonPath("$.data.length()", is(3)));

    // LIKE wildcards in q are escaped, not treated as wildcards.
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", bearer())
            .param("q", marker + "%"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total", is(0)));
  }

  @Test
  void checkpointThreadReplyFlow() throws Exception {
    String id = createDiagram("collab-" + UUID.randomUUID());

    MvcResult cp = mockMvc.perform(post("/api/v1/diagrams/" + id + "/checkpoints")
            .header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"v1\",\"meta\":\"m\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.snapshot.nodes.length()", is(1)))
        .andReturn();
    assertThatJson(cp, "v1");

    mockMvc.perform(get("/api/v1/diagrams/" + id + "/checkpoints").header("Authorization", bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()", is(1)));

    MvcResult thread = mockMvc.perform(post("/api/v1/diagrams/" + id + "/threads")
            .header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"author\":\"ann\",\"pinned_to\":\"a\",\"text\":\"looks good?\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.pinned_to", is("a")))
        .andReturn();
    String tid = mapper.readTree(thread.getResponse().getContentAsString()).get("data").get("id").asText();

    mockMvc.perform(post("/api/v1/diagrams/" + id + "/threads/" + tid + "/replies")
            .header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"author\":\"bob\",\"text\":\"ship it\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.threadId", is(tid)));

    mockMvc.perform(get("/api/v1/diagrams/" + id + "/threads/" + tid + "/replies")
            .header("Authorization", bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()", is(1)));
  }

  private static void assertThatJson(MvcResult result, String title) throws Exception {
    JsonNode body = new ObjectMapper().readTree(result.getResponse().getContentAsString());
    org.assertj.core.api.Assertions.assertThat(body.get("data").get("title").asText()).isEqualTo(title);
  }

  @Test
  void lintEndpointFlagsProblems() throws Exception {
    mockMvc.perform(post("/api/v1/lint").header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"nodes\":[{\"id\":\"a\"},{\"id\":\"b\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"a\",\"to\":\"nowhere\"}]}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.dangling[0]", is("e1")))
        .andExpect(jsonPath("$.ok", is(false)));
  }

  @Test
  void syncEndpointIsIdempotentOverHttp() throws Exception {
    String id = createDiagram("httpsync-" + UUID.randomUUID());
    String payload = "{\"diagram\":{\"id\":\"" + id + "\","
        + "\"graph\":{\"nodes\":[{\"id\":\"a\"}],\"edges\":[]}},\"upstream\":{}}";

    MvcResult first = mockMvc.perform(post("/api/v1/sync").header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON).content(payload))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status", is("synced")))
        .andExpect(jsonPath("$.nodesSynced", is(1)))
        .andReturn();
    JsonNode firstBody = mapper.readTree(first.getResponse().getContentAsString());

    mockMvc.perform(post("/api/v1/sync").header("Authorization", bearer())
            .contentType(MediaType.APPLICATION_JSON).content(payload))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status", is("noop")))
        .andExpect(jsonPath("$.nodesSynced", is(0)))
        .andExpect(jsonPath("$.commitSha", is(firstBody.get("commitSha").asText())))
        .andExpect(jsonPath("$.timestamp", is(firstBody.get("timestamp").asText())));
  }

  @Test
  void exportEndpointReturnsArchPayload() throws Exception {
    String id = createDiagram("export-" + UUID.randomUUID());
    mockMvc.perform(get("/api/v1/export").header("Authorization", bearer())
            .param("diagramId", id))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.app", is("ArchFlux")))
        .andExpect(jsonPath("$.spec", is(".arch")))
        .andExpect(jsonPath("$.version", is(1)))
        .andExpect(jsonPath("$.nodes.length()", is(1)))
        .andExpect(jsonPath("$.metadata.diagramId", is(id)));
  }

  @Test
  void exportWithoutDiagramIdIsValidationError() throws Exception {
    mockMvc.perform(get("/api/v1/export").header("Authorization", bearer()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")));
  }

  @Test
  void oversizedBodyIs413() throws Exception {
    mockMvc.perform(post("/api/v1/lint").header("Authorization", bearer())
            .header("Content-Length", String.valueOf(1024L * 1024L + 1))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"nodes\":[],\"edges\":[]}"))
        .andExpect(status().isRequestEntityTooLarge())
        .andExpect(jsonPath("$.error.code", is("PAYLOAD_TOO_LARGE")));
  }

  @Test
  void rateLimitHeadersAppearWhenBucketEmptied() throws Exception {
    // Exhaust the per-test bucket quickly by hammering lint; the first 60 pass.
    String body = "{\"nodes\":[],\"edges\":[]}";
    int limited = 0;
    for (int i = 0; i < 70; i++) {
      MvcResult result = mockMvc.perform(post("/api/v1/lint").header("Authorization", bearer())
              .header("X-Forwarded-For", "ratelimit-" + UUID.randomUUID())
              .contentType(MediaType.APPLICATION_JSON).content(body))
          .andReturn();
      if (result.getResponse().getStatus() == 429) {
        limited++;
      }
    }
    assertThat(limited).isZero(); // distinct IPs must not share a bucket

    String sharedIp = "ratelimit-shared-" + UUID.randomUUID();
    int got429 = 0;
    String retryAfter = null;
    for (int i = 0; i < 70; i++) {
      MvcResult result = mockMvc.perform(post("/api/v1/lint").header("Authorization", bearer())
              .header("X-Forwarded-For", sharedIp)
              .contentType(MediaType.APPLICATION_JSON).content(body))
          .andReturn();
      if (result.getResponse().getStatus() == 429) {
        got429++;
        retryAfter = result.getResponse().getHeader("Retry-After");
      }
    }
    assertThat(got429).isPositive();
    assertThat(retryAfter).isNotBlank();
  }
}
