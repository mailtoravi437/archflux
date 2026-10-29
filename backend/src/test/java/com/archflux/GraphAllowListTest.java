package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.auth.JwtService;
import com.archflux.domain.User;
import com.archflux.repo.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** R1-E00-T06: the graph allow-list keeps pages, layers, defaults and schemaVersion. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class GraphAllowListTest extends PostgresIT {

  private static final String PAGES =
      "[{\"id\":\"pg-1\",\"name\":\"Page 1\",\"order\":0},{\"id\":\"pg-2\",\"name\":\"Ops\",\"order\":1}]";
  private static final String LAYERS =
      "[{\"id\":\"ly-default\",\"name\":\"Default\",\"order\":0,\"visible\":true,\"locked\":false}]";
  private static final String DEFAULTS =
      "{\"displayStyle\":\"card\",\"size\":\"m\",\"propertyLine\":\"owner\"}";

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private JwtService jwtService;

  @Autowired
  private UserRepository users;

  private final ObjectMapper mapper = new ObjectMapper();

  private String jwt;

  @BeforeEach
  void setUp() {
    User user = new User(UUID.randomUUID(),
        "allow-" + UUID.randomUUID() + "@archflux.local", "Allow Tester", "member");
    user.setProvider("email");
    users.saveAndFlush(user);
    jwt = "Bearer " + jwtService.generateToken(user, "session-allow-list");
  }

  private String graphBody(String extra) {
    return "{\"title\":\"pages\",\"graph\":{\"nodes\":[{\"id\":\"a\",\"label\":\"A\",\"pageId\":\"pg-2\"}],"
        + "\"edges\":[],\"pages\":" + PAGES + ",\"layers\":" + LAYERS
        + ",\"defaults\":" + DEFAULTS + ",\"schemaVersion\":2" + extra + "}}";
  }

  private JsonNode create(String body) throws Exception {
    MvcResult result = mockMvc.perform(post("/api/v1/diagrams").header("Authorization", jwt)
            .contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isCreated())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString()).get("data");
  }

  private JsonNode fetch(String id) throws Exception {
    MvcResult result = mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", jwt))
        .andExpect(status().isOk())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString()).get("data");
  }

  @Test
  void pagesLayersDefaultsRoundTrip() throws Exception {
    String id = create(graphBody("")).get("id").asText();
    JsonNode got = fetch(id);
    // Compare parsed JSON, not strings (canonical JSON sorts keys).
    assertThat(got.get("pages")).isEqualTo(mapper.readTree(PAGES));
    assertThat(got.get("layers")).isEqualTo(mapper.readTree(LAYERS));
    assertThat(got.get("defaults")).isEqualTo(mapper.readTree(DEFAULTS));
    assertThat(got.get("schemaVersion").asInt()).isEqualTo(2);
    assertThat(got.get("graph").get("pages")).isEqualTo(mapper.readTree(PAGES));
    assertThat(got.get("nodes").get(0).get("pageId").asText()).isEqualTo("pg-2");

    // A flat-field update (no graph object) keeps the stored pages and layers.
    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", jwt)
            .contentType(MediaType.APPLICATION_JSON).content("{\"edges\":[]}"))
        .andExpect(status().isOk());
    JsonNode after = fetch(id);
    assertThat(after.get("pages")).isEqualTo(mapper.readTree(PAGES));
    assertThat(after.get("layers")).isEqualTo(mapper.readTree(LAYERS));
  }

  @Test
  void legacyDocWithoutPagesGetsEmptyDefaults() throws Exception {
    JsonNode created = create("{\"title\":\"legacy\",\"graph\":{\"nodes\":[],\"edges\":[]}}");
    JsonNode got = fetch(created.get("id").asText());
    assertThat(got.get("pages").isArray()).isTrue();
    assertThat(got.get("pages").size()).isZero();
    assertThat(got.get("layers").size()).isZero();
    assertThat(got.get("defaults").isObject()).isTrue();
    assertThat(got.get("schemaVersion").isNull()).isTrue();
    assertThat(got.get("graph").has("pages")).isFalse();
  }

  @Test
  void unknownGraphKeyIsDropped() throws Exception {
    JsonNode created = create("{\"title\":\"evil\",\"graph\":{\"nodes\":[],"
        + "\"evil\":{\"blob\":\"xxxxxxxx\",\"nested\":[1,2,3]}}}");
    JsonNode got = fetch(created.get("id").asText());
    assertThat(got.has("evil")).isFalse();
    assertThat(got.get("graph").has("evil")).isFalse();
  }

  @Test
  void nonIntegerSchemaVersionIsDropped() throws Exception {
    JsonNode created = create("{\"title\":\"sv\",\"graph\":{\"nodes\":[],\"schemaVersion\":\"2; drop\"}}");
    JsonNode got = fetch(created.get("id").asText());
    assertThat(got.get("schemaVersion").isNull()).isTrue();
    assertThat(got.get("graph").has("schemaVersion")).isFalse();
  }

  @Test
  void pagesNotArrayIs422() throws Exception {
    mockMvc.perform(post("/api/v1/diagrams").header("Authorization", jwt)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"bad\",\"graph\":{\"nodes\":[],\"pages\":{\"id\":\"pg-1\"}}}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.error.message", is("pages must be an array")));
    mockMvc.perform(post("/api/v1/diagrams").header("Authorization", jwt)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"bad\",\"graph\":{\"nodes\":[],\"layers\":\"x\"}}"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc.perform(post("/api/v1/diagrams").header("Authorization", jwt)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"bad\",\"graph\":{\"nodes\":[],\"defaults\":[1]}}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.error.message", is("defaults must be an object")));
  }

  @Test
  void unauthenticatedSaveIs401() throws Exception {
    mockMvc.perform(post("/api/v1/diagrams")
            .contentType(MediaType.APPLICATION_JSON).content(graphBody("")))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void revisionSnapshotKeepsPages() throws Exception {
    String id = create(graphBody("")).get("id").asText();
    MvcResult list = mockMvc.perform(get("/api/v1/diagrams/" + id + "/revisions")
            .header("Authorization", jwt))
        .andExpect(status().isOk())
        .andReturn();
    String revId = mapper.readTree(list.getResponse().getContentAsString())
        .get("data").get(0).get("id").asText();
    MvcResult rev = mockMvc.perform(get("/api/v1/diagrams/" + id + "/revisions/" + revId)
            .header("Authorization", jwt))
        .andExpect(status().isOk())
        .andReturn();
    JsonNode snapshot = mapper.readTree(rev.getResponse().getContentAsString())
        .get("data").get("snapshot");
    assertThat(snapshot.get("pages")).isEqualTo(mapper.readTree(PAGES));
    assertThat(snapshot.get("layers")).isEqualTo(mapper.readTree(LAYERS));
    assertThat(snapshot.get("defaults")).isEqualTo(mapper.readTree(DEFAULTS));

    // Checkpoints snapshot the stored (already canonical) graph too.
    MvcResult cp = mockMvc.perform(post("/api/v1/diagrams/" + id + "/checkpoints")
            .header("Authorization", jwt)
            .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"cp\"}"))
        .andExpect(status().isCreated())
        .andReturn();
    JsonNode cpSnapshot = mapper.readTree(cp.getResponse().getContentAsString())
        .get("data").get("snapshot");
    assertThat(cpSnapshot.get("pages")).isEqualTo(mapper.readTree(PAGES));
  }
}
