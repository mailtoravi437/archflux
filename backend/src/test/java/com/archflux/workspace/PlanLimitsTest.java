package com.archflux.workspace;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.repo.WorkspaceRepository;
import com.archflux.service.PlanService;
import com.fasterxml.jackson.databind.ObjectMapper;

/** R1-E11-T01: free-plan diagram limit and PlanService. */
class PlanLimitsTest extends WorkspaceTestBase {

  @Autowired private WorkspaceRepository workspaces;
  @Autowired private PlanService plans;

  private User alice;
  private Workspace ws;
  private String aliceJwt;

  @BeforeEach
  void setUp() {
    alice = persistUser("limits-alice");
    ws = personal(alice);
    aliceJwt = jwt(alice);
  }

  private MvcResult create(String title) throws Exception {
    return mockMvc.perform(json(post("/api/v1/diagrams"), aliceJwt, "{\"title\":\"" + title + "\"}"))
        .andReturn();
  }

  @Test
  void fourthCloudDiagramOnFreeIs402WithBody() throws Exception {
    for (int i = 1; i <= 3; i++) {
      org.assertj.core.api.Assertions.assertThat(create("D" + i).getResponse().getStatus())
          .isEqualTo(201);
    }
    mockMvc.perform(json(post("/api/v1/diagrams"), aliceJwt, "{\"title\":\"D4\"}"))
        .andExpect(status().isPaymentRequired())
        .andExpect(jsonPath("$.error.code", is("LIMIT_REACHED")))
        .andExpect(jsonPath("$.error.limit", is("cloudDiagrams")))
        .andExpect(jsonPath("$.error.current", is(3)))
        .andExpect(jsonPath("$.error.max", is(3)));

    // upgrading the plan lifts the limit
    ws.setPlan("team");
    workspaces.saveAndFlush(ws);
    org.assertj.core.api.Assertions.assertThat(create("D4").getResponse().getStatus())
        .isEqualTo(201);
  }

  @Test
  void updateExistingDiagramNeverLimited() throws Exception {
    String id = null;
    for (int i = 1; i <= 3; i++) {
      MvcResult r = create("E" + i);
      id = new ObjectMapper().readTree(r.getResponse().getContentAsString()).get("data").get("id")
          .asText();
    }
    mockMvc.perform(json(put("/api/v1/diagrams/" + id), aliceJwt, "{\"title\":\"renamed\"}"))
        .andExpect(status().isOk());
    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", aliceJwt))
        .andExpect(status().isOk());
    // deleting (trashing) is never limited and frees a slot
    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", aliceJwt))
        .andExpect(status().is2xxSuccessful());
    org.assertj.core.api.Assertions.assertThat(create("E4").getResponse().getStatus())
        .isEqualTo(201);
  }

  @Test
  void limitsPerPlan() {
    org.assertj.core.api.Assertions.assertThat(plans.limitsFor("free").cloudDiagrams()).isEqualTo(3);
    org.assertj.core.api.Assertions.assertThat(plans.limitsFor("member").editors()).isEqualTo(3);
    org.assertj.core.api.Assertions.assertThat(plans.limitsFor("team").historyDays()).isEqualTo(365);
    org.assertj.core.api.Assertions.assertThat(plans.limitsFor("team").connectors()).isEqualTo(2);
    org.assertj.core.api.Assertions.assertThat(plans.limitsFor("enterprise").cloudDiagrams())
        .isEqualTo(Integer.MAX_VALUE);
    org.assertj.core.api.Assertions.assertThat(plans.limitsFor("nope").proposals()).isFalse();
  }
}
