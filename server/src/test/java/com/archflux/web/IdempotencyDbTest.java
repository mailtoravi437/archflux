package com.archflux.web;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
 * Durable idempotency: a repeated {@code Idempotency-Key} replays the stored
 * response verbatim (DB-backed, survives the request); non-UUID keys are 400.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class IdempotencyDbTest extends PostgresIT {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private JwtService jwtService;

  @Autowired
  private UserRepository users;

  @MockitoBean
  private MagicLinkService magicLinkService;

  private final ObjectMapper mapper = new ObjectMapper();

  private String jwtA;

  @BeforeEach
  void setUp() {
    User userA = new User();
    userA.setEmail("idem-a-" + UUID.randomUUID() + "@archflux.local");
    userA.setName("IdemA");
    userA.setProvider("email");
    userA.setProviderId(userA.getEmail());
    userA.setRole("member");
    users.saveAndFlush(userA);
    jwtA = jwtService.generateToken(userA, "session-a");
  }

  private static String bearer(String token) {
    return "Bearer " + token;
  }

  @Test
  void repeatedKeyReplaysIdenticalBody() throws Exception {
    String key = UUID.randomUUID().toString();
    String body = "{\"title\":\"idem-" + UUID.randomUUID() + "\"}";

    MvcResult first = mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer(jwtA))
            .header("Idempotency-Key", key)
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isCreated())
        .andExpect(header().string("Idempotency-Replay", "false"))
        .andExpect(header().string("Idempotency-Key", key))
        .andReturn();

    MvcResult second = mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer(jwtA))
            .header("Idempotency-Key", key)
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isCreated())
        .andExpect(header().string("Idempotency-Replay", "true"))
        .andExpect(header().string("Idempotency-Key", key))
        .andReturn();

    String firstBody = first.getResponse().getContentAsString();
    String secondBody = second.getResponse().getContentAsString();
    assert firstBody.equals(secondBody) : "replay body must be identical";
    JsonNode firstJson = mapper.readTree(firstBody);
    JsonNode secondJson = mapper.readTree(secondBody);
    assert firstJson.get("data").get("id").asText()
        .equals(secondJson.get("data").get("id").asText()) : "replay must echo the original id";

    // Only one diagram was actually created.
    MvcResult list = mockMvc.perform(get("/api/v1/diagrams")
            .header("Authorization", bearer(jwtA)))
        .andExpect(status().isOk())
        .andReturn();
    assert mapper.readTree(list.getResponse().getContentAsString())
        .get("total").asLong() == 1L : "duplicate request must not create a second diagram";
  }

  @Test
  void nonUuidKeyIs400() throws Exception {
    mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer(jwtA))
            .header("Idempotency-Key", "not-a-uuid")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"x\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code", is("IDEMPOTENCY_KEY_INVALID")));
  }
}
