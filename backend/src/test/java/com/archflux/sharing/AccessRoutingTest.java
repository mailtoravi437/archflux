package com.archflux.sharing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.TestInfraMocks;
import com.archflux.security.RequestUser;
import com.archflux.web.CollaborationController;

/** R1-E07-T08: Export, Sync and Collaboration route through AccessService. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class AccessRoutingTest extends SharingIT {

  @Autowired
  private CollaborationController collaboration;

  private String id;

  @BeforeEach
  void setUp() throws Exception {
    setUpPeople("route");
    id = createDiagram(aliceJwt, "Routing");
    // Explicit viewer row for someone who is NOT a workspace member would need the invite flow;
    // workspace viewer already maps to VIEWER.
  }

  private MockHttpServletRequest as(UUID userId) {
    MockHttpServletRequest request = new MockHttpServletRequest();
    RequestUser.set(request, userId);
    return request;
  }

  @Test
  void explicitViewerCanExport() throws Exception {
    mockMvc.perform(get("/api/v1/export").header("Authorization", viewerJwt).param("diagramId", id))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metadata.title", is("Routing")));
    // No access at all: 404, never 403.
    mockMvc.perform(get("/api/v1/export").header("Authorization", bobJwt).param("diagramId", id))
        .andExpect(status().isNotFound());
  }

  @Test
  void viewerCannotSyncApply() throws Exception {
    String body = "{\"diagram\":{\"id\":\"" + id + "\",\"nodes\":[]}}";
    mockMvc.perform(json(post("/api/v1/sync"), viewerJwt, body)).andExpect(status().isForbidden());
    mockMvc.perform(json(post("/api/v1/sync"), reviewerJwt, body)).andExpect(status().isForbidden());
    mockMvc.perform(json(post("/api/v1/sync"), bobJwt, body)).andExpect(status().isNotFound());
    mockMvc.perform(json(post("/api/v1/sync"), editorJwt, body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status", is("synced")));
  }

  @Test
  void nonMemberJoinRefused() {
    Map<String, Object> refused = collaboration.joinDiagram(id, Map.of(), as(bob.getId()));
    assertThat(refused).containsKey("error").doesNotContainKey("yjsState");

    Map<String, Object> viewerJoin = collaboration.joinDiagram(id, Map.of(), as(viewer.getId()));
    assertThat(viewerJoin).containsEntry("type", "join");

    // Viewer may not push updates; editor may.
    Map<String, Object> payload = Map.of("update", "AAEC");
    assertThat(collaboration.handleUpdate(id, payload, as(viewer.getId()))).containsKey("error");
    assertThat(collaboration.handleUpdate(id, payload, as(bob.getId()))).containsKey("error");
    assertThat(collaboration.handleUpdate(id, payload, as(editor.getId())))
        .containsEntry("type", "update");
  }
}
