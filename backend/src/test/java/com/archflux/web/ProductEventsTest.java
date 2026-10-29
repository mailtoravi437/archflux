package com.archflux.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.transaction.annotation.Transactional;
import com.archflux.PostgresIT;
import com.archflux.TestInfraMocks;
import com.archflux.auth.JwtService;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.repo.UserRepository;
import com.archflux.service.WorkspaceService;
import jakarta.persistence.EntityManager;

/** R1-E12-T04: events endpoint. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class ProductEventsTest extends PostgresIT {

  @Autowired private MockMvc mockMvc;
  @Autowired private JwtService jwtService;
  @Autowired private UserRepository users;
  @Autowired private WorkspaceService workspaceService;
  @Autowired private EntityManager em;

  private User user;
  private Workspace ws;
  private String jwt;

  @BeforeEach
  void setUp() {
    user = new User(UUID.randomUUID(), "events-" + UUID.randomUUID() + "@archflux.local", "events", "member");
    user.setProvider("email");
    user = users.saveAndFlush(user);
    ws = workspaceService.resolvePersonalWorkspace(user.getId());
    jwt = "Bearer " + jwtService.generateToken(user, "session-events");
  }

  private org.springframework.test.web.servlet.ResultActions send(String token, String body) throws Exception {
    var req = post("/api/v1/events").contentType(MediaType.APPLICATION_JSON).content(body);
    if (token != null) {
      req = req.header("Authorization", token);
    }
    return mockMvc.perform(req);
  }

  private long count() {
    em.flush();
    return ((Number) em.createNativeQuery(
        "SELECT count(*) FROM product_events WHERE user_id = :u").setParameter("u", user.getId())
        .getSingleResult()).longValue();
  }

  @Test
  void acceptsAllowListedBatch() throws Exception {
    send(jwt, "{\"events\":[{\"name\":\"diagram_created\",\"props\":{\"kind\":\"blank\",\"n\":3,\"ok\":true}},"
        + "{\"name\":\"export_completed\"}]}").andExpect(status().isAccepted());
    assertThat(count()).isEqualTo(2);
    Object wsId = em.createNativeQuery("SELECT DISTINCT workspace_id FROM product_events WHERE user_id = :u")
        .setParameter("u", user.getId()).getSingleResult();
    assertThat(wsId).isEqualTo(ws.getId());
  }

  @Test
  void rejectsUnknownName422() throws Exception {
    send(jwt, "{\"events\":[{\"name\":\"diagram_created\"},{\"name\":\"made_up_event\"}]}")
        .andExpect(status().isUnprocessableEntity());
    assertThat(count()).isZero();
  }

  @Test
  void rejectsLongString422() throws Exception {
    send(jwt, "{\"events\":[{\"name\":\"diagram_created\",\"props\":{\"title\":\"" + "x".repeat(41) + "\"}}]}")
        .andExpect(status().isUnprocessableEntity());
    send(jwt, "{\"events\":[{\"name\":\"diagram_created\",\"props\":{\"o\":{\"a\":1}}}]}")
        .andExpect(status().isUnprocessableEntity());
    StringBuilder many = new StringBuilder();
    for (int i = 0; i < 11; i++) {
      many.append(i > 0 ? "," : "").append("\"k").append(i).append("\":1");
    }
    send(jwt, "{\"events\":[{\"name\":\"diagram_created\",\"props\":{" + many + "}}]}")
        .andExpect(status().isUnprocessableEntity());
    assertThat(count()).isZero();
  }

  @Test
  void disabledWorkspaceDropsSilently() throws Exception {
    em.createNativeQuery("UPDATE workspaces SET analytics_enabled = false WHERE id = :id")
        .setParameter("id", ws.getId()).executeUpdate();
    send(jwt, "{\"events\":[{\"name\":\"diagram_created\"}]}").andExpect(status().isAccepted());
    assertThat(count()).isZero();
  }

  @Test
  void unauthenticatedIs401() throws Exception {
    send(null, "{\"events\":[{\"name\":\"diagram_created\"}]}").andExpect(status().isUnauthorized());
  }
}
