package com.archflux.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import com.archflux.PostgresIT;
import com.archflux.TestInfraMocks;
import com.archflux.auth.JwtService;
import com.archflux.auth.MagicLinkService;
import com.archflux.domain.User;
import com.archflux.repo.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.hamcrest.Matchers;
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
 * Observability surface: actuator exposes health + Prometheus, and the custom
 * Phase 2 meters (sync runs, diagram conflicts) render on the scrape
 * endpoint.
 */
@SpringBootTest(properties = {
    // The test classpath shadows the main application.yml with its own
    // (pre-existing repo behavior: singular classpath resource wins), so the
    // actuator surface from the main config is restated here to verify the
    // endpoint wiring, security permit, and custom meters end to end.
    "management.endpoints.enabled-by-default=false",
    "management.endpoints.web.exposure.include=health,info,metrics,prometheus",
    "management.endpoint.health.enabled=true",
    "management.endpoint.info.enabled=true",
    "management.endpoint.metrics.enabled=true",
    "management.endpoint.prometheus.enabled=true",
    "management.prometheus.metrics.export.enabled=true"
})
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class ActuatorMetricsTest extends PostgresIT {

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
    userA.setEmail("metrics-a-" + UUID.randomUUID() + "@archflux.local");
    userA.setName("MetricsA");
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
  void prometheusRendersCustomMeters() throws Exception {
    mockMvc.perform(get("/actuator/health"))
        .andExpect(status().isOk());

    // Produce a sync run and a version conflict.
    MvcResult created = mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"metrics-" + UUID.randomUUID() + "\"}"))
        .andExpect(status().isCreated())
        .andReturn();
    String id = mapper.readTree(created.getResponse().getContentAsString())
        .get("data").get("id").asText();
    long version = mapper.readTree(created.getResponse().getContentAsString())
        .get("data").get("version").asLong();

    mockMvc.perform(post("/api/v1/sync")
            .header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"diagram\":{\"id\":\"" + id + "\"},\"upstream\":{}}"))
        .andExpect(status().isOk());

    mockMvc.perform(put("/api/v1/diagrams/" + id)
            .header("Authorization", bearer(jwtA))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"stale\",\"version\":" + (version - 1) + "}"))
        .andExpect(status().isConflict());

    mockMvc.perform(get("/actuator/prometheus"))
        .andExpect(status().isOk())
        .andExpect(content().string(Matchers.containsString("archflux_sync_runs")))
        .andExpect(content().string(Matchers.containsString("archflux_diagrams_conflicts")));
  }
}
