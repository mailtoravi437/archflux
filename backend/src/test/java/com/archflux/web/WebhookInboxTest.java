package com.archflux.web;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import com.archflux.PostgresIT;
import com.archflux.TestInfraMocks;
import com.archflux.auth.JwtService;
import com.archflux.auth.MagicLinkService;
import com.archflux.domain.User;
import com.archflux.repo.UserRepository;
import com.archflux.repo.WebhookEventRepository;
import com.archflux.service.GitHubArchFetcher;
import com.archflux.web.SyncController;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Webhook inbox: persist-before-ack, duplicate delivery answered without
 * reprocessing, failed events replayable to processed. No {@code @Transactional}
 * here — the async worker runs on its own thread/transaction and can only see
 * committed rows. Async completion uses deadline polling (no extra deps).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
class WebhookInboxTest extends PostgresIT {

  private static final String WEBHOOK_SECRET = "test-webhook-secret";

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private JwtService jwtService;

  @Autowired
  private UserRepository users;

  @Autowired
  private WebhookEventRepository webhookEvents;

  @Autowired
  private SyncController syncController;

  @MockitoBean
  private GitHubArchFetcher fetcher;

  @MockitoBean
  private MagicLinkService magicLinkService;

  private final ObjectMapper mapper = new ObjectMapper();

  private User userA;
  private String jwtA;

  @BeforeEach
  void setUp() {
    ReflectionTestUtils.setField(syncController, "webhookSecretProp", WEBHOOK_SECRET);
    userA = persistUser("wh-a-" + UUID.randomUUID() + "@archflux.local", "WhA");
    jwtA = jwtService.generateToken(userA, "session-a");
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

  private static String sign(String payload, String secret) throws Exception {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
    StringBuilder hex = new StringBuilder(hash.length * 2);
    for (byte b : hash) {
      hex.append(String.format("%02x", b));
    }
    return "sha256=" + hex;
  }

  private static String pushPayload(String repo, String file) {
    return "{\"ref\":\"refs/heads/main\",\"repository\":{\"full_name\":\"" + repo + "\"},"
        + "\"commits\":[{\"added\":[\"" + file + "\"],\"modified\":[],\"removed\":[]}],"
        + "\"head_commit\":{\"added\":[],\"modified\":[],\"removed\":[]}}";
  }

  private MvcResult postWebhook(String deliveryId, String event, String payload) throws Exception {
    return mockMvc.perform(post("/api/v1/sync/webhook/git")
            .header("Authorization", bearer(jwtA))
            .header("X-Hub-Signature-256", sign(payload, WEBHOOK_SECRET))
            .header("X-GitHub-Event", event)
            .header("X-GitHub-Delivery", deliveryId)
            .contentType(MediaType.APPLICATION_JSON)
            .content(payload))
        .andExpect(status().isOk())
        .andReturn();
  }

  private String pollStatus(String deliveryId, long timeoutMs) throws Exception {
    long deadline = System.currentTimeMillis() + timeoutMs;
    String last = null;
    while (System.currentTimeMillis() < deadline) {
      last = webhookEvents.findByDeliveryId(deliveryId)
          .map(e -> e.getStatus()).orElse(null);
      if ("processed".equals(last) || "failed".equals(last)) {
        return last;
      }
      Thread.sleep(200);
    }
    return last;
  }

  private long diagramTotal(String token) throws Exception {
    MvcResult result = mockMvc.perform(get("/api/v1/diagrams")
            .header("Authorization", bearer(token)))
        .andExpect(status().isOk())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString()).get("total").asLong();
  }

  @Test
  void duplicateDeliverySucceedsWithoutReprocessing() throws Exception {
    String repo = "acme/dup-" + UUID.randomUUID();
    String payload = pushPayload(repo, "arch/infra.arch");
    when(fetcher.fetch(anyString(), anyString(), anyString())).thenReturn(
        "{\"nodes\":[{\"id\":\"n1\",\"label\":\"N1\"}],\"edges\":[]}");
    String delivery = "dup-" + UUID.randomUUID();

    long before = diagramTotal(jwtA);
    postWebhook(delivery, "push", payload);
    assert pollStatus(delivery, 10000).equals("processed") : "event must reach processed";
    assert diagramTotal(jwtA) == before + 1 : "first delivery must create one diagram";

    MvcResult dup = postWebhook(delivery, "push", payload);
    assert mapper.readTree(dup.getResponse().getContentAsString())
        .get("status").asText().equals("duplicate") : "second delivery must be a duplicate";
    assert webhookEvents.findByDeliveryId(delivery).isPresent() : "one inbox row expected";
    Thread.sleep(500);
    assert diagramTotal(jwtA) == before + 1 : "duplicate must not reprocess";
  }

  @Test
  void failedEventReplaysToProcessed() throws Exception {
    String repo = "acme/replay-" + UUID.randomUUID();
    String payload = pushPayload(repo, "arch/app.arch");
    when(fetcher.fetch(anyString(), anyString(), anyString())).thenReturn(null);
    String delivery = "fail-" + UUID.randomUUID();

    postWebhook(delivery, "push", payload);
    assert pollStatus(delivery, 10000).equals("failed") : "unfetchable .arch must fail";
    assert webhookEvents.findByDeliveryId(delivery).orElseThrow()
        .getRetryCount() >= 1 : "failure must record a retry";

    // Unknown delivery replays 404; non-failed would conflict (covered below).
    mockMvc.perform(post("/api/v1/sync/webhook/git/replay")
            .header("Authorization", bearer(jwtA))
            .param("deliveryId", "no-such-delivery"))
        .andExpect(status().isNotFound());

    when(fetcher.fetch(anyString(), anyString(), anyString())).thenReturn(
        "{\"nodes\":[{\"id\":\"n9\",\"label\":\"N9\"}],\"edges\":[]}");
    long before = diagramTotal(jwtA);
    mockMvc.perform(post("/api/v1/sync/webhook/git/replay")
            .header("Authorization", bearer(jwtA))
            .param("deliveryId", delivery))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status", is("received")));
    assert pollStatus(delivery, 10000).equals("processed") : "replay must reach processed";
    assert diagramTotal(jwtA) == before + 1 : "replay must create the diagram";

    // Processed events are not replayable.
    mockMvc.perform(post("/api/v1/sync/webhook/git/replay")
            .header("Authorization", bearer(jwtA))
            .param("deliveryId", delivery))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code", is("WEBHOOK_NOT_FAILED")));

    // Replay requires authentication.
    mockMvc.perform(post("/api/v1/sync/webhook/git/replay")
            .param("deliveryId", delivery))
        .andExpect(status().isUnauthorized());
  }

  // SVC-G25: GitHub deliveries carry only the HMAC signature — no Authorization.
  @Test
  void githubStyleSignedDeliveryWithoutAuthorizationIsAccepted() throws Exception {
    String payload = "{\"ref\":\"refs/heads/main\",\"commits\":[]}";
    mockMvc.perform(post("/api/v1/sync/webhook/git")
            .header("X-Hub-Signature-256", sign(payload, WEBHOOK_SECRET))
            .header("X-GitHub-Event", "ping")
            .header("X-GitHub-Delivery", "gh-" + java.util.UUID.randomUUID())
            .contentType(MediaType.APPLICATION_JSON)
            .content(payload))
        .andExpect(status().isOk());
  }

  @Test
  void unauthenticatedDeliveryWithBadSignatureIsRejected() throws Exception {
    String payload = "{\"ref\":\"refs/heads/main\"}";
    mockMvc.perform(post("/api/v1/sync/webhook/git")
            .header("X-Hub-Signature-256", "sha256=" + "0".repeat(64))
            .header("X-GitHub-Event", "push")
            .contentType(MediaType.APPLICATION_JSON)
            .content(payload))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void unauthenticatedUnsignedDeliveryIsRejected() throws Exception {
    mockMvc.perform(post("/api/v1/sync/webhook/git")
            .header("X-GitHub-Event", "push")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isUnauthorized());
  }
}
