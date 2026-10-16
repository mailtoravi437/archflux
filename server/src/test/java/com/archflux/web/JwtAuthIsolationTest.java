package com.archflux.web;

import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
import jakarta.servlet.http.Cookie;
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
 * PROD-001/PROD-002 Phase-1 proof at user scope (full filter chain):
 * JWT-or-nothing authentication, static-token rejection outside the webhook,
 * and per-user isolation across diagrams, export, and threads.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class JwtAuthIsolationTest extends PostgresIT {

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
    userA = persistUser("alice-" + UUID.randomUUID() + "@archflux.local", "Alice");
    userB = persistUser("bob-" + UUID.randomUUID() + "@archflux.local", "Bob");
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

  private static Cookie cookie(String token) {
    return new Cookie("ARCHFLUX_TOKEN", token);
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
        .andReturn();
    JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
    return body.get("data").get("id").asText();
  }

  @Test
  void noCredentialIs401() throws Exception {
    mockMvc.perform(get("/api/v1/diagrams"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code", is("UNAUTHENTICATED")))
        .andExpect(jsonPath("$.error.message", is("Missing or invalid credential")));
  }

  @Test
  void garbageJwtIs401() throws Exception {
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", "Bearer garbage.jwt.token"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code", is("UNAUTHENTICATED")));
  }

  @Test
  void staticTokenDoesNotAuthenticateAsUser() throws Exception {
    // app.api-token=test-token in test config: valid service credential,
    // but must NOT authenticate as a user outside the webhook path.
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", "Bearer test-token"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code", is("UNAUTHENTICATED")));
  }

  @Test
  void jwtSignedWithUnknownKeyIs401() throws Exception {
    com.archflux.auth.JwtService stranger = new com.archflux.auth.JwtService(
        "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", "", "archflux", "archflux-api", 60, 30);
    String forged = stranger.generateToken(userA, "session-x");
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", bearer(forged)))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code", is("UNAUTHENTICATED")));
  }

  @Test
  void cookieCredentialAuthenticates() throws Exception {
    mockMvc.perform(get("/api/v1/diagrams").cookie(cookie(jwtA)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total", is(0)));
  }

  @Test
  void validatedJwtAutoProvisionsMissingUser() throws Exception {
    UUID freshId = UUID.randomUUID();
    User ghost = new User(freshId, "ghost-" + freshId + "@archflux.local", "Ghost", "member");
    ghost.setProvider("email");
    String ghostJwt = jwtService.generateToken(ghost, "session-ghost");

    assertTrue(users.findById(freshId).isEmpty());
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", bearer(ghostJwt)))
        .andExpect(status().isOk());
    assertTrue(users.findById(freshId).isPresent(), "validated JWT sub must resolve to a User row");
  }

  @Test
  void userACanRunFullDiagramCrud() throws Exception {
    String id = createDiagram(jwtA, "a-diagram-" + UUID.randomUUID());

    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.id", is(id)));

    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", bearer(jwtA)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total", is(1)));

    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"renamed\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.title", is("renamed")));

    mockMvc.perform(get("/api/v1/export").header("Authorization", bearer(jwtA))
            .param("diagramId", id))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metadata.title", is("renamed")));

    mockMvc.perform(post("/api/v1/diagrams/" + id + "/threads")
            .header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"author\":\"alice\",\"text\":\"looks good?\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.id").exists());

    mockMvc.perform(get("/api/v1/diagrams/" + id + "/threads")
            .header("Authorization", bearer(jwtA)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()", is(1)));

    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA)))
        .andExpect(status().isNoContent());

    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA)))
        .andExpect(status().isNotFound());
  }

  @Test
  void userBCannotSeeOrMutateUserADiagram() throws Exception {
    String id = createDiagram(jwtA, "secret-" + UUID.randomUUID());
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

    // Writes to foreign rows are forbidden.
    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtB))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"hijack\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("FORBIDDEN")));

    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtB)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("FORBIDDEN")));

    // Export of a foreign diagram is not-found.
    mockMvc.perform(get("/api/v1/export").header("Authorization", bearer(jwtB))
            .param("diagramId", id))
        .andExpect(status().isNotFound());

    // Threads on a foreign diagram: read 404, write 403.
    mockMvc.perform(get("/api/v1/diagrams/" + id + "/threads")
            .header("Authorization", bearer(jwtB)))
        .andExpect(status().isNotFound());

    mockMvc.perform(post("/api/v1/diagrams/" + id + "/threads")
            .header("Authorization", bearer(jwtB))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"author\":\"bob\",\"text\":\"snoop\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("FORBIDDEN")));
  }

  @Test
  void crossOriginStateChangingRequestIsRejected() throws Exception {
    mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer(jwtA))
            .header("Origin", "http://evil.example.com")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"x\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("FORBIDDEN")));
  }

  @Test
  void sameOriginStateChangingRequestPasses() throws Exception {
    String id = createDiagramWithOrigin(jwtA, "same-origin-" + UUID.randomUUID(), "http://localhost:5173");
    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtA)))
        .andExpect(status().isOk());
  }

  private String createDiagramWithOrigin(String token, String title, String origin) throws Exception {
    MvcResult result = mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer(token))
            .header("Origin", origin)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"" + title + "\"}"))
        .andExpect(status().isCreated())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString()).get("data").get("id").asText();
  }

  @Test
  void magicLinkEndpointIsRateLimited() throws Exception {
    when(magicLinkService.generateMagicLink(anyString())).thenReturn("test-token");
    for (int i = 0; i < 60; i++) {
      mockMvc.perform(post("/api/v1/auth/magic-link")
              .contentType(MediaType.APPLICATION_JSON)
              .content("{\"email\":\"user" + i + "@example.com\"}"))
          .andExpect(status().isOk());
    }
    mockMvc.perform(post("/api/v1/auth/magic-link")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"one-too-many@example.com\"}"))
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.error.code", is("RATE_LIMITED")));
  }
}
