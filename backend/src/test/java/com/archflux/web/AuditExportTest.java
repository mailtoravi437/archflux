package com.archflux.web;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import com.archflux.PostgresIT;
import com.archflux.TestInfraMocks;
import com.archflux.auth.JwtService;
import com.archflux.auth.MagicLinkService;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.repo.UserRepository;
import com.archflux.repo.WorkspaceMembershipRepository;
import com.archflux.repo.WorkspaceRepository;
import com.archflux.service.WorkspaceService;
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
 * Audit trail + export: diagram CRUD records events with correlation IDs; the
 * export endpoint needs a workspace, membership, and the admin role (403 for
 * non-admin members, 401 without credentials).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class AuditExportTest extends PostgresIT {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private JwtService jwtService;

  @Autowired
  private UserRepository users;

  @Autowired
  private WorkspaceService workspaceService;

  @Autowired
  private WorkspaceRepository workspaces;

  @Autowired
  private WorkspaceMembershipRepository memberships;

  @MockitoBean
  private MagicLinkService magicLinkService;

  private final ObjectMapper mapper = new ObjectMapper();

  private User admin;
  private User viewer;
  private String jwtAdmin;
  private String jwtViewer;
  private UUID workspaceId;

  @BeforeEach
  void setUp() {
    admin = persistUser("audit-admin-" + UUID.randomUUID() + "@archflux.local", "AuditAdmin");
    viewer = persistUser("audit-viewer-" + UUID.randomUUID() + "@archflux.local", "AuditViewer");
    jwtAdmin = jwtService.generateToken(admin, "session-admin");
    jwtViewer = jwtService.generateToken(viewer, "session-viewer");
    Workspace workspace = workspaceService.resolvePersonalWorkspace(admin.getId());
    workspaceId = workspace.getId();
    // Viewer is a workspace member WITHOUT the admin role.
    memberships.saveAndFlush(
        new WorkspaceMembership(workspaces.findById(workspaceId).orElseThrow(), viewer,
            "viewer", "active"));
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

  private String createDiagram(String token, String correlationId) throws Exception {
    MvcResult result = mockMvc.perform(post("/api/v1/diagrams")
            .header("Authorization", bearer(token))
            .header("X-Correlation-ID", correlationId)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"audit-" + UUID.randomUUID() + "\"}"))
        .andExpect(status().isCreated())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString())
        .get("data").get("id").asText();
  }

  private JsonNode exportAs(String token, String action) throws Exception {
    var req = get("/api/v1/audit").param("workspaceId", workspaceId.toString());
    if (token != null) {
      req.header("Authorization", bearer(token));
    }
    if (action != null) {
      req.param("action", action);
    }
    MvcResult result = mockMvc.perform(req)
        .andExpect(status().isOk())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString());
  }

  @Test
  void diagramCrudIsAuditedWithCorrelationIds() throws Exception {
    String id = createDiagram(jwtAdmin, "corr-create-1");
    mockMvc.perform(put("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtAdmin))
            .header("X-Correlation-ID", "corr-update-1")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"renamed\"}"))
        .andExpect(status().isOk());
    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", bearer(jwtAdmin))
            .header("X-Correlation-ID", "corr-delete-1"))
        .andExpect(status().isNoContent());

    JsonNode export = exportAs(jwtAdmin, null);
    assert export.get("data").size() >= 3 : "expected CRUD + export rows";

    boolean sawCreate = false;
    boolean sawUpdate = false;
    boolean sawDelete = false;
    for (JsonNode row : export.get("data")) {
      String action = row.get("action").asText();
      if (action.equals("diagram.create")
          && "corr-create-1".equals(row.get("correlationId").asText())) {
        sawCreate = true;
      }
      if (action.equals("diagram.update")
          && "corr-update-1".equals(row.get("correlationId").asText())) {
        sawUpdate = true;
      }
      // R1-E06-T02: DELETE is a soft delete, audited as diagram.trash.
      if (action.equals("diagram.trash")
          && "corr-delete-1".equals(row.get("correlationId").asText())) {
        sawDelete = true;
      }
      assert row.get("workspaceId").asText().equals(workspaceId.toString())
          : "audit rows must carry the workspace";
    }
    assert sawCreate && sawUpdate && sawDelete : "CRUD actions must all be audited";

    // Action filter narrows the export.
    JsonNode filtered = exportAs(jwtAdmin, "diagram.create");
    assert filtered.get("data").size() >= 1 : "action filter must return rows";
    for (JsonNode row : filtered.get("data")) {
      assert row.get("action").asText().equals("diagram.create") : "filter must apply";
    }
  }

  @Test
  void exportRequiresAdminRole() throws Exception {
    createDiagram(jwtAdmin, "corr-admin-1");

    // Non-admin member is forbidden.
    mockMvc.perform(get("/api/v1/audit").param("workspaceId", workspaceId.toString())
            .header("Authorization", bearer(jwtViewer)))
        .andExpect(status().isForbidden());

    // Admin succeeds.
    mockMvc.perform(get("/api/v1/audit").param("workspaceId", workspaceId.toString())
            .header("Authorization", bearer(jwtAdmin)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data").isArray());

    // Missing workspace is 400; unauthenticated is 401.
    mockMvc.perform(get("/api/v1/audit").header("Authorization", bearer(jwtAdmin)))
        .andExpect(status().isBadRequest());
    mockMvc.perform(get("/api/v1/audit").param("workspaceId", workspaceId.toString()))
        .andExpect(status().isUnauthorized());
  }
}
