package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.auth.JwtService;
import com.archflux.domain.AuditEvent;
import com.archflux.domain.Diagram;
import com.archflux.domain.Folder;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.domain.WorkspaceMembership;
import com.archflux.repo.AuditEventRepository;
import com.archflux.repo.DiagramRepository;
import com.archflux.repo.FolderRepository;
import com.archflux.repo.UserRepository;
import com.archflux.repo.WorkspaceMembershipRepository;
import com.archflux.service.WorkspaceService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;

/** R1-E06-T01: folders API (CONVENTIONS §2.5 checklist + task cases). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class FolderControllerTest extends PostgresIT {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private JwtService jwtService;

  @Autowired
  private UserRepository users;

  @Autowired
  private WorkspaceService workspaceService;

  @Autowired
  private WorkspaceMembershipRepository memberships;

  @Autowired
  private DiagramRepository diagrams;

  @Autowired
  private FolderRepository folders;

  @Autowired
  private AuditEventRepository auditEvents;

  @Autowired
  private EntityManager entityManager;

  private final ObjectMapper mapper = new ObjectMapper();

  private User alice;
  private Workspace aliceWs;
  private String aliceJwt;
  private String bobJwt;
  private String viewerJwt;

  @BeforeEach
  void setUp() {
    alice = persistUser("folder-alice");
    User bob = persistUser("folder-bob");
    User viewer = persistUser("folder-viewer");
    aliceWs = workspaceService.resolvePersonalWorkspace(alice.getId());
    workspaceService.resolvePersonalWorkspace(bob.getId());
    workspaceService.resolvePersonalWorkspace(viewer.getId());
    memberships.saveAndFlush(new WorkspaceMembership(aliceWs, viewer, "viewer", "active"));
    aliceJwt = "Bearer " + jwtService.generateToken(alice, "session-folder-a");
    bobJwt = "Bearer " + jwtService.generateToken(bob, "session-folder-b");
    viewerJwt = "Bearer " + jwtService.generateToken(viewer, "session-folder-v");
  }

  private User persistUser(String prefix) {
    User user = new User(UUID.randomUUID(), prefix + "-" + UUID.randomUUID() + "@archflux.local",
        prefix, "member");
    user.setProvider("email");
    return users.saveAndFlush(user);
  }

  private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String jwt,
      String body) {
    return builder.header("Authorization", jwt).contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private String createFolder(String jwt, String name, String parentId) throws Exception {
    String body = parentId == null
        ? "{\"name\":\"" + name + "\"}"
        : "{\"name\":\"" + name + "\",\"parentId\":\"" + parentId + "\"}";
    MvcResult result = mockMvc.perform(json(post("/api/v1/folders"), jwt, body))
        .andExpect(status().isCreated())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString()).get("data").get("id")
        .asText();
  }

  private Diagram diagramIn(String folderId, String title) {
    Diagram diagram = new Diagram();
    diagram.setOwner(alice);
    diagram.setWorkspace(aliceWs);
    diagram.setTitle(title);
    diagram.setTags(List.of());
    diagram.setGraph("{}");
    diagram.setFolderId(folderId == null ? null : UUID.fromString(folderId));
    return diagrams.saveAndFlush(diagram);
  }

  private Instant deletedAtOf(UUID diagramId) {
    entityManager.clear();
    return diagrams.findById(diagramId).orElseThrow().getDeletedAt();
  }

  private Folder folder(String id) {
    entityManager.clear();
    return folders.findById(UUID.fromString(id)).orElseThrow();
  }

  private List<String> auditActions() {
    return auditEvents.findByWorkspaceIdOrderByCreatedAtDesc(aliceWs.getId(), PageRequest.of(0, 50))
        .stream().map(AuditEvent::getAction).toList();
  }

  @Test
  void createListRenameMoveHappyPath() throws Exception {
    String parent = createFolder(aliceJwt, "Platform", null);
    String child = createFolder(aliceJwt, "Payments", parent);

    mockMvc.perform(get("/api/v1/folders").header("Authorization", aliceJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()", is(2)))
        .andExpect(jsonPath("$.data[?(@.id=='" + child + "')].parentId", hasItem(parent)));

    mockMvc.perform(json(patch("/api/v1/folders/" + child), aliceJwt, "{\"name\":\"Billing\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.name", is("Billing")))
        .andExpect(jsonPath("$.data.parentId", is(parent)));

    mockMvc.perform(json(patch("/api/v1/folders/" + child), aliceJwt, "{\"parentId\":null}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.parentId", nullValue()));

    assertThat(auditActions()).contains("folder.create", "folder.rename", "folder.move");
  }

  @Test
  void missingTokenIs401() throws Exception {
    String id = createFolder(aliceJwt, "Secret", null);
    mockMvc.perform(get("/api/v1/folders")).andExpect(status().isUnauthorized());
    mockMvc.perform(post("/api/v1/folders").contentType(MediaType.APPLICATION_JSON)
        .content("{\"name\":\"x\"}")).andExpect(status().isUnauthorized());
    mockMvc.perform(patch("/api/v1/folders/" + id).contentType(MediaType.APPLICATION_JSON)
        .content("{\"name\":\"x\"}")).andExpect(status().isUnauthorized());
    mockMvc.perform(delete("/api/v1/folders/" + id)).andExpect(status().isUnauthorized());
    mockMvc.perform(post("/api/v1/folders/" + id + "/restore"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void otherWorkspaceFolderIs404() throws Exception {
    String id = createFolder(aliceJwt, "Alice only", null);

    mockMvc.perform(get("/api/v1/folders").header("Authorization", bobJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[*].id", not(hasItem(id))));
    mockMvc.perform(json(patch("/api/v1/folders/" + id), bobJwt, "{\"name\":\"hijack\"}"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code", is("NOT_FOUND")));
    mockMvc.perform(delete("/api/v1/folders/" + id).header("Authorization", bobJwt))
        .andExpect(status().isNotFound());

    mockMvc.perform(delete("/api/v1/folders/" + id).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());
    mockMvc.perform(post("/api/v1/folders/" + id + "/restore").header("Authorization", bobJwt))
        .andExpect(status().isNotFound());

    // A foreign parent is unusable and indistinguishable from a missing one.
    String live = createFolder(aliceJwt, "Alice live", null);
    mockMvc.perform(json(post("/api/v1/folders"), bobJwt,
            "{\"name\":\"sneaky\",\"parentId\":\"" + live + "\"}"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc.perform(json(patch("/api/v1/folders/" + UUID.randomUUID()), aliceJwt,
            "{\"name\":\"ghost\"}"))
        .andExpect(status().isNotFound());
  }

  @Test
  void viewerRoleIs403() throws Exception {
    String id = createFolder(aliceJwt, "Shared", null);

    // A viewer is a member (so 403, not 404) but cannot change folders.
    mockMvc.perform(json(patch("/api/v1/folders/" + id), viewerJwt, "{\"name\":\"nope\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("FORBIDDEN")));
    mockMvc.perform(json(post("/api/v1/folders"), viewerJwt,
            "{\"name\":\"child\",\"parentId\":\"" + id + "\"}"))
        .andExpect(status().isForbidden());
    mockMvc.perform(delete("/api/v1/folders/" + id).header("Authorization", viewerJwt))
        .andExpect(status().isForbidden());

    mockMvc.perform(delete("/api/v1/folders/" + id).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());
    mockMvc.perform(post("/api/v1/folders/" + id + "/restore").header("Authorization", viewerJwt))
        .andExpect(status().isForbidden());
  }

  @Test
  void invalidInputIs400() throws Exception {
    mockMvc.perform(json(post("/api/v1/folders"), aliceJwt, "{\"name\":\"   \"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")));
    mockMvc.perform(json(post("/api/v1/folders"), aliceJwt, "{}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(post("/api/v1/folders"), aliceJwt,
            "{\"name\":\"" + "x".repeat(121) + "\"}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(post("/api/v1/folders"), aliceJwt,
            "{\"name\":\"ok\",\"parentId\":\"not-a-uuid\"}"))
        .andExpect(status().isBadRequest());
    String id = createFolder(aliceJwt, "Valid", null);
    mockMvc.perform(json(patch("/api/v1/folders/" + id), aliceJwt, "{}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(patch("/api/v1/folders/" + id), aliceJwt, "{\"name\":\"  \"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void duplicateSiblingNameIs409() throws Exception {
    String parent = createFolder(aliceJwt, "Teams", null);
    mockMvc.perform(json(post("/api/v1/folders"), aliceJwt, "{\"name\":\"teams\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code", is("FOLDER_NAME_TAKEN")));

    createFolder(aliceJwt, "Core", parent);
    mockMvc.perform(json(post("/api/v1/folders"), aliceJwt,
            "{\"name\":\"CORE\",\"parentId\":\"" + parent + "\"}"))
        .andExpect(status().isConflict());
    // Same name under a different parent is fine.
    createFolder(aliceJwt, "Core", null);

    // Rename into a taken name is 409 too.
    String other = createFolder(aliceJwt, "Edge", parent);
    mockMvc.perform(json(patch("/api/v1/folders/" + other), aliceJwt, "{\"name\":\"core\"}"))
        .andExpect(status().isConflict());

    // A trashed sibling no longer blocks the name.
    mockMvc.perform(delete("/api/v1/folders/" + other).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());
    createFolder(aliceJwt, "Edge", parent);
  }

  @Test
  void depthOver5Is422() throws Exception {
    String level1 = createFolder(aliceJwt, "L1", null);
    String level2 = createFolder(aliceJwt, "L2", level1);
    String level3 = createFolder(aliceJwt, "L3", level2);
    String level4 = createFolder(aliceJwt, "L4", level3);
    String level5 = createFolder(aliceJwt, "L5", level4);
    mockMvc.perform(json(post("/api/v1/folders"), aliceJwt,
            "{\"name\":\"L6\",\"parentId\":\"" + level5 + "\"}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.error.code", is("UNPROCESSABLE_ENTITY")));

    // Moving a 2-deep subtree under level 4 would reach depth 6.
    String top = createFolder(aliceJwt, "Top", null);
    createFolder(aliceJwt, "Under", top);
    mockMvc.perform(json(patch("/api/v1/folders/" + top), aliceJwt,
            "{\"parentId\":\"" + level4 + "\"}"))
        .andExpect(status().isUnprocessableEntity());

    // A folder can't move into its own subtree.
    mockMvc.perform(json(patch("/api/v1/folders/" + level1), aliceJwt,
            "{\"parentId\":\"" + level3 + "\"}"))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void trashFolderTrashesContainedDiagrams() throws Exception {
    String parent = createFolder(aliceJwt, "Doomed", null);
    String child = createFolder(aliceJwt, "Doomed child", parent);
    Diagram inParent = diagramIn(parent, "in parent");
    Diagram inChild = diagramIn(child, "in child");
    Diagram atRoot = diagramIn(null, "at root");

    mockMvc.perform(delete("/api/v1/folders/" + parent).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());

    Instant at = folder(parent).getDeletedAt();
    assertThat(at).isNotNull();
    assertThat(folder(child).getDeletedAt()).isEqualTo(at);
    assertThat(deletedAtOf(inParent.getId())).isEqualTo(at);
    assertThat(deletedAtOf(inChild.getId())).isEqualTo(at);
    assertThat(deletedAtOf(atRoot.getId())).isNull();

    mockMvc.perform(get("/api/v1/folders").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[*].id", not(hasItem(parent))));
    mockMvc.perform(get("/api/v1/folders?trashed=true").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[*].id", hasItem(parent)));
    // A trashed folder can't be renamed or used as a parent.
    mockMvc.perform(json(patch("/api/v1/folders/" + parent), aliceJwt, "{\"name\":\"x\"}"))
        .andExpect(status().isNotFound());
    mockMvc.perform(json(post("/api/v1/folders"), aliceJwt,
            "{\"name\":\"x\",\"parentId\":\"" + parent + "\"}"))
        .andExpect(status().isUnprocessableEntity());
    assertThat(auditActions()).contains("folder.trash");
  }

  @Test
  void restoreFolderRestoresSameBatchOnly() throws Exception {
    String parent = createFolder(aliceJwt, "Batch", null);
    String keptChild = createFolder(aliceJwt, "Kept child", parent);
    String earlierChild = createFolder(aliceJwt, "Earlier child", parent);
    Diagram earlier = diagramIn(parent, "trashed before");
    Diagram later = diagramIn(parent, "trashed with folder");

    // Trashed separately beforehand: a diagram and a subfolder.
    earlier.setDeletedAt(Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MICROS));
    diagrams.saveAndFlush(earlier);
    mockMvc.perform(delete("/api/v1/folders/" + earlierChild).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());

    mockMvc.perform(delete("/api/v1/folders/" + parent).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());
    mockMvc.perform(post("/api/v1/folders/" + parent + "/restore")
            .header("Authorization", aliceJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.deletedAt", nullValue()))
        .andExpect(jsonPath("$.data.restoredTo", is("root")));

    assertThat(folder(parent).getDeletedAt()).isNull();
    assertThat(folder(keptChild).getDeletedAt()).isNull();
    assertThat(folder(earlierChild).getDeletedAt()).isNotNull();
    assertThat(deletedAtOf(later.getId())).isNull();
    assertThat(deletedAtOf(earlier.getId())).isNotNull();
    assertThat(auditActions()).contains("folder.restore");

    // A live folder is not "in trash".
    mockMvc.perform(post("/api/v1/folders/" + parent + "/restore")
            .header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
  }

  @Test
  void restoreUnderTrashedParentGoesToRoot() throws Exception {
    String parent = createFolder(aliceJwt, "Gone parent", null);
    String child = createFolder(aliceJwt, "Orphan", parent);
    mockMvc.perform(delete("/api/v1/folders/" + child).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());
    mockMvc.perform(delete("/api/v1/folders/" + parent).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());

    mockMvc.perform(post("/api/v1/folders/" + child + "/restore")
            .header("Authorization", aliceJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.parentId", nullValue()))
        .andExpect(jsonPath("$.data.restoredTo", is("root")));
    assertThat(folder(parent).getDeletedAt()).isNotNull();
  }

  @Test
  void restoreIntoTakenNameIs409() throws Exception {
    String first = createFolder(aliceJwt, "Clash", null);
    mockMvc.perform(delete("/api/v1/folders/" + first).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());
    createFolder(aliceJwt, "clash", null);
    mockMvc.perform(post("/api/v1/folders/" + first + "/restore")
            .header("Authorization", aliceJwt))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code", is("FOLDER_NAME_TAKEN")));
  }
}
