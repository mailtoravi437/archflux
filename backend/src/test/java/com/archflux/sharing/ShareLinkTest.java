package com.archflux.sharing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
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
import com.archflux.repo.WorkspaceRepository;
import com.archflux.security.ShareTokens;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManager;

/** R1-E07-T03: share links and the X-Share-Token header. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class ShareLinkTest extends SharingIT {

  @Autowired
  private EntityManager entityManager;

  @Autowired
  private WorkspaceRepository workspaceRows;

  private String id;
  private String links;

  @BeforeEach
  void setUp() throws Exception {
    setUpPeople("link");
    id = createDiagram(aliceJwt, "Public map");
    links = "/api/v1/diagrams/" + id + "/links";
    mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/threads"), aliceJwt,
            "{\"author\":\"alice\",\"text\":\"first\"}"))
        .andExpect(status().isCreated());
  }

  private JsonNode createLink(String jwt, String role, String audience, String expiresAt)
      throws Exception {
    String body = "{\"role\":\"" + role + "\",\"audience\":\"" + audience + "\""
        + (expiresAt == null ? "" : ",\"expiresAt\":\"" + expiresAt + "\"") + "}";
    MvcResult result = mockMvc.perform(json(post(links), jwt, body))
        .andExpect(status().isCreated())
        .andReturn();
    return body(result).get("data");
  }

  @Test
  void tokenReturnedOnceAndHashedAtRest() throws Exception {
    JsonNode link = createLink(aliceJwt, "viewer", "anyone", null);
    String token = link.get("token").asText();
    assertThat(ShareTokens.wellFormed(token)).isTrue();
    assertThat(java.util.Base64.getUrlDecoder().decode(token)).hasSize(32);
    assertThat(link.get("url").asText()).endsWith("/d/" + id + "?link=1")
        .doesNotContain(token);
    assertThat(link.get("state").asText()).isEqualTo("active");

    // At rest: only the SHA-256 hex; no column holds the token.
    Object[] row = (Object[]) entityManager.createNativeQuery(
            "SELECT token_hash, CAST(row_to_json(l) AS text) FROM share_links l WHERE id = :id")
        .setParameter("id", UUID.fromString(link.get("id").asText()))
        .getSingleResult();
    assertThat(row[0]).isEqualTo(ShareTokens.hash(token));
    assertThat((String) row[1]).doesNotContain(token);

    // Listing never returns the token or its hash.
    mockMvc.perform(get(links).header("Authorization", aliceJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()", is(1)))
        .andExpect(jsonPath("$.data[0].id", is(link.get("id").asText())))
        .andExpect(jsonPath("$.data[0].token").doesNotExist())
        .andExpect(content().string(not(containsString(token))))
        .andExpect(content().string(not(containsString(ShareTokens.hash(token)))));

    // An Idempotency-Key never replays (or stores) the one-time token.
    String key = UUID.randomUUID().toString();
    String first = mockMvc.perform(json(post(links), aliceJwt,
            "{\"role\":\"viewer\",\"audience\":\"workspace\"}").header("Idempotency-Key", key))
        .andExpect(status().isCreated())
        .andExpect(header().doesNotExist("Idempotency-Replay"))
        .andReturn().getResponse().getContentAsString();
    String firstToken = mapper.readTree(first).get("data").get("token").asText();
    Number stored = (Number) entityManager.createNativeQuery(
            "SELECT COUNT(*) FROM idempotency_keys WHERE key = CAST(:k AS uuid)")
        .setParameter("k", key).getSingleResult();
    assertThat(stored.longValue()).isZero();
    assertThat(firstToken).isNotEqualTo(token);
    assertThat(auditActions(aliceWs.getId())).contains("share.link_create");

    // Guards: 401, 404 for another workspace, 403 below editor, 400/422 for bad input.
    mockMvc.perform(json(post(links), null, "{\"role\":\"viewer\",\"audience\":\"anyone\"}"))
        .andExpect(status().isUnauthorized());
    mockMvc.perform(json(post(links), bobJwt, "{\"role\":\"viewer\",\"audience\":\"anyone\"}"))
        .andExpect(status().isNotFound());
    mockMvc.perform(get(links).header("Authorization", bobJwt)).andExpect(status().isNotFound());
    mockMvc.perform(json(post(links), reviewerJwt, "{\"role\":\"viewer\",\"audience\":\"anyone\"}"))
        .andExpect(status().isForbidden());
    mockMvc.perform(get(links).header("Authorization", viewerJwt)).andExpect(status().isForbidden());
    mockMvc.perform(json(post(links), aliceJwt, "{\"role\":\"editor\",\"audience\":\"anyone\"}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(post(links), aliceJwt, "{\"role\":\"viewer\",\"audience\":\"world\"}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(post(links), aliceJwt, "{\"role\":\"viewer\",\"audience\":\"anyone\","
            + "\"expiresAt\":\"" + Instant.now().minus(1, ChronoUnit.HOURS) + "\"}"))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void anyoneLinkReadsWithoutJwt() throws Exception {
    String token = createLink(aliceJwt, "commenter", "anyone", null).get("token").asText();
    mockMvc.perform(get("/api/v1/diagrams/" + id).header(ShareTokens.HEADER, token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.title", is("Public map")))
        .andExpect(jsonPath("$.data.role", is("commenter")));
    MvcResult threads = mockMvc.perform(get("/api/v1/diagrams/" + id + "/threads")
            .header(ShareTokens.HEADER, token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()", is(1)))
        .andReturn();
    String threadId = body(threads).get("data").get(0).get("id").asText();
    mockMvc.perform(get("/api/v1/diagrams/" + id + "/threads/" + threadId + "/replies")
            .header(ShareTokens.HEADER, token))
        .andExpect(status().isOk());
    // Any other route still needs a JWT.
    for (String path : List.of("/checkpoints", "/revisions", "/members", "/links")) {
      mockMvc.perform(get("/api/v1/diagrams/" + id + path).header(ShareTokens.HEADER, token))
          .andExpect(status().isUnauthorized());
    }
    mockMvc.perform(get("/api/v1/diagrams").header(ShareTokens.HEADER, token))
        .andExpect(status().isUnauthorized());
    // The token belongs to this diagram only.
    String other = createDiagram(aliceJwt, "Private");
    mockMvc.perform(get("/api/v1/diagrams/" + other).header(ShareTokens.HEADER, token))
        .andExpect(status().isNotFound());
    // With a JWT the link adds its role: Bob (another workspace) may comment.
    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", bobJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/threads"), bobJwt,
            "{\"author\":\"bob\",\"text\":\"via link\"}").header(ShareTokens.HEADER, token))
        .andExpect(status().isCreated());
    // A malformed token is no token.
    mockMvc.perform(get("/api/v1/diagrams/" + id).header(ShareTokens.HEADER, "not-a-token"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void anyoneLinkCannotPut() throws Exception {
    String token = createLink(aliceJwt, "commenter", "anyone", null).get("token").asText();
    mockMvc.perform(json(put("/api/v1/diagrams/" + id), null, "{\"title\":\"defaced\"}")
            .header(ShareTokens.HEADER, token))
        .andExpect(status().isUnauthorized());
    mockMvc.perform(delete("/api/v1/diagrams/" + id).header(ShareTokens.HEADER, token))
        .andExpect(status().isUnauthorized());
    mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/threads"), null,
            "{\"author\":\"anon\",\"text\":\"spam\"}").header(ShareTokens.HEADER, token))
        .andExpect(status().isUnauthorized());
    // With a JWT, a commenter link still never grants editing.
    mockMvc.perform(json(put("/api/v1/diagrams/" + id), bobJwt, "{\"title\":\"defaced\"}")
            .header(ShareTokens.HEADER, token))
        .andExpect(status().isForbidden());
    mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/checkpoints"), bobJwt,
            "{\"title\":\"cp\"}").header(ShareTokens.HEADER, token))
        .andExpect(status().isForbidden());
    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data.title", is("Public map")));

    // Admin policy: no 'anyone' links when the workspace disallows them.
    aliceWs = workspaceRows.findById(aliceWs.getId()).orElseThrow();
    aliceWs.setPublicLinksAllowed(false);
    workspaceRows.saveAndFlush(aliceWs);
    mockMvc.perform(json(post(links), aliceJwt, "{\"role\":\"viewer\",\"audience\":\"anyone\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("PUBLIC_LINKS_DISABLED")));
    createLink(aliceJwt, "viewer", "workspace", null);
  }

  @Test
  void workspaceLinkRequiresMembership() throws Exception {
    String token = createLink(aliceJwt, "commenter", "workspace", null).get("token").asText();
    // No JWT: a workspace link is not enough.
    mockMvc.perform(get("/api/v1/diagrams/" + id).header(ShareTokens.HEADER, token))
        .andExpect(status().isNotFound());
    // Outsider with JWT: still nothing.
    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", bobJwt)
            .header(ShareTokens.HEADER, token))
        .andExpect(status().isNotFound());
    // A workspace viewer is lifted to commenter by the link.
    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", viewerJwt)
            .header(ShareTokens.HEADER, token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.role", is("commenter")));
    mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/threads"), viewerJwt,
            "{\"author\":\"vic\",\"text\":\"ok\"}").header(ShareTokens.HEADER, token))
        .andExpect(status().isCreated());
  }

  @Test
  void revokedLinkDenied() throws Exception {
    JsonNode link = createLink(aliceJwt, "viewer", "anyone", null);
    String token = link.get("token").asText();
    String linkId = link.get("id").asText();
    mockMvc.perform(get("/api/v1/diagrams/" + id).header(ShareTokens.HEADER, token))
        .andExpect(status().isOk());
    mockMvc.perform(delete(links + "/" + linkId).header("Authorization", viewerJwt))
        .andExpect(status().isForbidden());
    mockMvc.perform(delete(links + "/" + linkId).header("Authorization", bobJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(delete(links + "/" + UUID.randomUUID()).header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(delete(links + "/" + linkId).header("Authorization", editorJwt))
        .andExpect(status().isNoContent());
    mockMvc.perform(get("/api/v1/diagrams/" + id).header(ShareTokens.HEADER, token))
        .andExpect(status().isNotFound());
    mockMvc.perform(get("/api/v1/diagrams/" + id + "/threads").header(ShareTokens.HEADER, token))
        .andExpect(status().isNotFound());
    mockMvc.perform(get(links).header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[0].state", is("revoked")))
        .andExpect(jsonPath("$.data[0].revokedAt").isNotEmpty());
    assertThat(auditActions(aliceWs.getId())).contains("share.link_revoke");
  }

  @Test
  void expiredLinkReportsExpired() throws Exception {
    JsonNode link = createLink(aliceJwt, "viewer", "anyone",
        Instant.now().plus(1, ChronoUnit.HOURS).toString());
    String token = link.get("token").asText();
    mockMvc.perform(get("/api/v1/diagrams/" + id).header(ShareTokens.HEADER, token))
        .andExpect(status().isOk());
    entityManager.createNativeQuery(
            "UPDATE share_links SET expires_at = now() - interval '1 minute' WHERE id = :id")
        .setParameter("id", UUID.fromString(link.get("id").asText()))
        .executeUpdate();
    entityManager.clear();
    // Expired = no token: link-only reads are 404, a member keeps their own role.
    mockMvc.perform(get("/api/v1/diagrams/" + id).header(ShareTokens.HEADER, token))
        .andExpect(status().isNotFound());
    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", viewerJwt)
            .header(ShareTokens.HEADER, token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.role", is("viewer")));
    mockMvc.perform(get(links).header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[0].state", is("expired")));
    // GET /access reports the expired state.
    mockMvc.perform(get("/api/v1/diagrams/" + id + "/access").header(ShareTokens.HEADER, token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.state", is("expired")))
        .andExpect(jsonPath("$.data.title").doesNotExist());
  }

  @Test
  void tokenNotLogged() throws Exception {
    String token;
    String linkId;
    try (LogCapture logs = new LogCapture()) {
      JsonNode link = createLink(aliceJwt, "commenter", "anyone", null);
      token = link.get("token").asText();
      linkId = link.get("id").asText();
      mockMvc.perform(get("/api/v1/diagrams/" + id).header(ShareTokens.HEADER, token))
          .andExpect(status().isOk());
      mockMvc.perform(get("/api/v1/diagrams/" + id + "/threads").header(ShareTokens.HEADER, token))
          .andExpect(status().isOk());
      mockMvc.perform(get("/api/v1/diagrams/" + id + "/access").header(ShareTokens.HEADER, token))
          .andExpect(status().isOk());
      mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/threads"), bobJwt,
              "{\"author\":\"b\",\"text\":\"t\"}").header(ShareTokens.HEADER, token))
          .andExpect(status().isCreated());
      // Failure paths log too: write attempt, wrong diagram, revoke, then reuse.
      mockMvc.perform(json(put("/api/v1/diagrams/" + id), null, "{\"title\":\"x\"}")
              .header(ShareTokens.HEADER, token))
          .andExpect(status().isUnauthorized());
      mockMvc.perform(get("/api/v1/diagrams/" + UUID.randomUUID()).header(ShareTokens.HEADER, token))
          .andExpect(status().isNotFound());
      mockMvc.perform(delete(links + "/" + linkId).header("Authorization", aliceJwt))
          .andExpect(status().isNoContent());
      mockMvc.perform(get("/api/v1/diagrams/" + id).header(ShareTokens.HEADER, token))
          .andExpect(status().isNotFound());
      String everything = logs.everything();
      assertThat(logs.events()).isNotEmpty();
      // Sanity: the capture sees request logging for these calls.
      assertThat(everything).contains("/api/v1/diagrams/" + id);
      assertThat(everything).doesNotContain(token);
      assertThat(everything).doesNotContain(ShareTokens.hash(token));
    }
    assertThat(Map.of("token", token)).isNotEmpty();
  }
}
