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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
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
import org.springframework.transaction.PlatformTransactionManager;
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
import com.archflux.repo.WorkspaceRepository;
import com.archflux.service.AuditService;
import com.archflux.service.TrashPurgeJob;
import com.archflux.service.WorkspaceService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;

/** R1-E06-T02: soft delete, restore, purge, star, move and list filters. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class DiagramTrashTest extends PostgresIT {

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

  @Autowired
  private DiagramRepository diagrams;

  @Autowired
  private FolderRepository folders;

  @Autowired
  private AuditEventRepository auditEvents;

  @Autowired
  private AuditService auditService;

  @Autowired
  private PlatformTransactionManager transactionManager;

  @Autowired
  private EntityManager entityManager;

  private final ObjectMapper mapper = new ObjectMapper();

  private User alice;
  private Workspace aliceWs;
  private String aliceJwt;
  private String bobJwt;
  private String editorJwt;
  private String viewerJwt;

  @BeforeEach
  void setUp() {
    alice = persistUser("trash-alice");
    User bob = persistUser("trash-bob");
    User editor = persistUser("trash-editor");
    User viewer = persistUser("trash-viewer");
    aliceWs = workspaceService.resolvePersonalWorkspace(alice.getId());
    workspaceService.resolvePersonalWorkspace(bob.getId());
    workspaceService.resolvePersonalWorkspace(editor.getId());
    workspaceService.resolvePersonalWorkspace(viewer.getId());
    memberships.saveAndFlush(new WorkspaceMembership(aliceWs, editor, "editor", "active"));
    memberships.saveAndFlush(new WorkspaceMembership(aliceWs, viewer, "viewer", "active"));
    aliceJwt = "Bearer " + jwtService.generateToken(alice, "session-trash-a");
    bobJwt = "Bearer " + jwtService.generateToken(bob, "session-trash-b");
    editorJwt = "Bearer " + jwtService.generateToken(editor, "session-trash-e");
    viewerJwt = "Bearer " + jwtService.generateToken(viewer, "session-trash-v");
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

  private String createDiagram(String jwt, String title) throws Exception {
    MvcResult result = mockMvc.perform(json(post("/api/v1/diagrams"), jwt,
            "{\"title\":\"" + title + "\",\"graph\":{\"nodes\":[]}}"))
        .andExpect(status().isCreated())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString()).get("data").get("id")
        .asText();
  }

  private String createFolder(String jwt, String name) throws Exception {
    MvcResult result = mockMvc.perform(json(post("/api/v1/folders"), jwt,
            "{\"name\":\"" + name + "\"}"))
        .andExpect(status().isCreated())
        .andReturn();
    return mapper.readTree(result.getResponse().getContentAsString()).get("data").get("id")
        .asText();
  }

  private void trash(String jwt, String id) throws Exception {
    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", jwt))
        .andExpect(status().isNoContent());
  }

  private List<String> auditActions(UUID workspaceId) {
    return auditEvents.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId, PageRequest.of(0, 50))
        .stream().map(AuditEvent::getAction).toList();
  }

  private Diagram trashedDiagram(Workspace workspace, String title, Instant deletedAt) {
    Diagram diagram = new Diagram();
    diagram.setOwner(alice);
    diagram.setWorkspace(workspace);
    diagram.setTitle(title);
    diagram.setTags(List.of());
    diagram.setGraph("{}");
    diagram.setDeletedAt(deletedAt);
    return diagrams.saveAndFlush(diagram);
  }

  @Test
  void deleteMovesToTrashAndHidesFromList() throws Exception {
    String id = createDiagram(aliceJwt, "Doomed " + UUID.randomUUID());
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[*].id", hasItem(id)))
        .andExpect(jsonPath("$.data[0].starred", is(false)))
        .andExpect(jsonPath("$.data[0].role", is("owner")))
        .andExpect(jsonPath("$.data[0].deletedAt", nullValue()));

    // Viewers can't trash (403); foreign callers get 404 (R1-E07-T01).
    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", viewerJwt))
        .andExpect(status().isForbidden());
    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", bobJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(delete("/api/v1/diagrams/" + id)).andExpect(status().isUnauthorized());

    trash(aliceJwt, id);

    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[*].id", not(hasItem(id))));
    MvcResult trashed = mockMvc.perform(get("/api/v1/diagrams?trashed=true")
            .header("Authorization", aliceJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total", is(1)))
        .andExpect(jsonPath("$.data[0].id", is(id)))
        .andReturn();
    var item = mapper.readTree(trashed.getResponse().getContentAsString()).get("data").get(0);
    Instant deletedAt = Instant.parse(item.get("deletedAt").asText());
    assertThat(Instant.parse(item.get("purgeAt").asText()))
        .isEqualTo(deletedAt.plus(Duration.ofDays(30)));
    assertThat(diagrams.findById(UUID.fromString(id))).isPresent();
    assertThat(auditActions(aliceWs.getId())).contains("diagram.trash");

    // Already in the trash: a second DELETE finds nothing live.
    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
  }

  @Test
  void trashedGetIs404() throws Exception {
    String id = createDiagram(aliceJwt, "Hidden");
    trash(aliceJwt, id);
    String base = "/api/v1/diagrams/" + id;
    mockMvc.perform(get(base).header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(json(put(base), aliceJwt, "{\"title\":\"revive\"}"))
        .andExpect(status().isNotFound());
    mockMvc.perform(get(base + "/revisions").header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(get(base + "/checkpoints").header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(get(base + "/threads").header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(get("/api/v1/export?diagramId=" + id).header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(put(base + "/star").header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
  }

  @Test
  void restoreReturnsToFolderOrRoot() throws Exception {
    String keep = createFolder(aliceJwt, "Keep");
    String gone = createFolder(aliceJwt, "Gone");
    String inKeep = createDiagram(aliceJwt, "In keep");
    String inGone = createDiagram(aliceJwt, "In gone");
    mockMvc.perform(json(patch("/api/v1/diagrams/" + inKeep), aliceJwt,
        "{\"folderId\":\"" + keep + "\"}")).andExpect(status().isOk());
    mockMvc.perform(json(patch("/api/v1/diagrams/" + inGone), aliceJwt,
        "{\"folderId\":\"" + gone + "\"}")).andExpect(status().isOk());

    trash(aliceJwt, inKeep);
    trash(aliceJwt, inGone);
    mockMvc.perform(delete("/api/v1/folders/" + gone).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());

    // Guards: not in trash / foreign / too low a role / no token.
    String live = createDiagram(aliceJwt, "Live");
    mockMvc.perform(post("/api/v1/diagrams/" + live + "/restore").header("Authorization", aliceJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(post("/api/v1/diagrams/" + inKeep + "/restore").header("Authorization", bobJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(post("/api/v1/diagrams/" + inKeep + "/restore")
            .header("Authorization", viewerJwt))
        .andExpect(status().isForbidden());
    mockMvc.perform(post("/api/v1/diagrams/" + inKeep + "/restore"))
        .andExpect(status().isUnauthorized());

    mockMvc.perform(post("/api/v1/diagrams/" + inKeep + "/restore")
            .header("Authorization", editorJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.folderId", is(keep)))
        .andExpect(jsonPath("$.data.deletedAt", nullValue()))
        .andExpect(jsonPath("$.data.restoredTo", is("folder")));
    mockMvc.perform(post("/api/v1/diagrams/" + inGone + "/restore")
            .header("Authorization", aliceJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.folderId", nullValue()))
        .andExpect(jsonPath("$.data.restoredTo", is("root")));
    mockMvc.perform(get("/api/v1/diagrams/" + inGone).header("Authorization", aliceJwt))
        .andExpect(status().isOk());
    assertThat(auditActions(aliceWs.getId())).contains("diagram.untrash");
  }

  @Test
  void purgeRequiresExactTitle() throws Exception {
    String id = createDiagram(aliceJwt, "Payments Map");
    String url = "/api/v1/diagrams/" + id + "/purge";

    // Not in the trash yet.
    mockMvc.perform(json(delete(url), aliceJwt, "{\"confirmTitle\":\"Payments Map\"}"))
        .andExpect(status().isNotFound());
    trash(aliceJwt, id);

    mockMvc.perform(json(delete(url), aliceJwt, "{\"confirmTitle\":\"payments map\"}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.error.code", is("TITLE_MISMATCH")));
    mockMvc.perform(json(delete(url), aliceJwt, "{}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")));
    mockMvc.perform(delete(url).header("Authorization", aliceJwt))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(delete(url), bobJwt, "{\"confirmTitle\":\"Payments Map\"}"))
        .andExpect(status().isNotFound());
    mockMvc.perform(delete(url).contentType(MediaType.APPLICATION_JSON)
            .content("{\"confirmTitle\":\"Payments Map\"}"))
        .andExpect(status().isUnauthorized());

    mockMvc.perform(json(delete(url), aliceJwt, "{\"confirmTitle\":\"Payments Map\"}"))
        .andExpect(status().isNoContent());
    assertThat(diagrams.findById(UUID.fromString(id))).isEmpty();
    assertThat(auditActions(aliceWs.getId())).contains("diagram.purge");
    mockMvc.perform(get("/api/v1/diagrams?trashed=true").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[*].id", not(hasItem(id))));
  }

  @Test
  void purgeForbiddenForEditor() throws Exception {
    String id = createDiagram(aliceJwt, "Owned by alice");
    trash(editorJwt, id);
    String url = "/api/v1/diagrams/" + id + "/purge";
    mockMvc.perform(json(delete(url), editorJwt, "{\"confirmTitle\":\"Owned by alice\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("FORBIDDEN")));
    mockMvc.perform(json(delete(url), viewerJwt, "{\"confirmTitle\":\"Owned by alice\"}"))
        .andExpect(status().isForbidden());
    assertThat(diagrams.findById(UUID.fromString(id))).isPresent();
  }

  @Test
  void starFiltersList() throws Exception {
    String starred = createDiagram(aliceJwt, "Bravo starred");
    String plain = createDiagram(aliceJwt, "Alpha plain");

    mockMvc.perform(put("/api/v1/diagrams/" + starred + "/star").header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());
    // Idempotent.
    mockMvc.perform(put("/api/v1/diagrams/" + starred + "/star").header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());
    mockMvc.perform(get("/api/v1/diagrams?starred=true").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.total", is(1)))
        .andExpect(jsonPath("$.data[0].id", is(starred)))
        .andExpect(jsonPath("$.data[0].starred", is(true)));

    // Sort by title: Alpha before Bravo.
    mockMvc.perform(get("/api/v1/diagrams?sort=title").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[0].id", is(plain)))
        .andExpect(jsonPath("$.data[1].id", is(starred)));
    mockMvc.perform(get("/api/v1/diagrams?sort=size").header("Authorization", aliceJwt))
        .andExpect(status().isBadRequest());
    mockMvc.perform(get("/api/v1/diagrams?folderId=nope").header("Authorization", aliceJwt))
        .andExpect(status().isBadRequest());

    // Stars are per user: a viewer may star; their star does not leak to alice.
    mockMvc.perform(put("/api/v1/diagrams/" + plain + "/star").header("Authorization", viewerJwt))
        .andExpect(status().isNoContent());
    mockMvc.perform(get("/api/v1/diagrams?starred=true").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.total", is(1)));
    mockMvc.perform(put("/api/v1/diagrams/" + plain + "/star").header("Authorization", bobJwt))
        .andExpect(status().isNotFound());
    mockMvc.perform(put("/api/v1/diagrams/" + plain + "/star"))
        .andExpect(status().isUnauthorized());

    mockMvc.perform(delete("/api/v1/diagrams/" + starred + "/star").header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());
    mockMvc.perform(get("/api/v1/diagrams?starred=true").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.total", is(0)));
    assertThat(auditActions(aliceWs.getId())).contains("diagram.star", "diagram.unstar");
  }

  @Test
  void moveToFolderInOtherWorkspaceIs422() throws Exception {
    String id = createDiagram(aliceJwt, "Mover");
    String bobFolder = createFolder(bobJwt, "Bob's");
    String trashedFolder = createFolder(aliceJwt, "Trashed");
    mockMvc.perform(delete("/api/v1/folders/" + trashedFolder).header("Authorization", aliceJwt))
        .andExpect(status().isNoContent());
    String target = createFolder(aliceJwt, "Target");
    String url = "/api/v1/diagrams/" + id;

    mockMvc.perform(json(patch(url), aliceJwt, "{\"folderId\":\"" + bobFolder + "\"}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.error.code", is("UNPROCESSABLE_ENTITY")));
    mockMvc.perform(json(patch(url), aliceJwt, "{\"folderId\":\"" + trashedFolder + "\"}"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc.perform(json(patch(url), aliceJwt, "{\"folderId\":\"" + UUID.randomUUID() + "\"}"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc.perform(json(patch(url), aliceJwt, "{}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(patch(url), aliceJwt, "{\"folderId\":\"not-a-uuid\"}"))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(patch(url), bobJwt, "{\"folderId\":\"" + bobFolder + "\"}"))
        .andExpect(status().isNotFound());
    mockMvc.perform(json(patch(url), viewerJwt, "{\"folderId\":\"" + target + "\"}"))
        .andExpect(status().isForbidden());
    mockMvc.perform(patch(url).contentType(MediaType.APPLICATION_JSON)
            .content("{\"folderId\":null}"))
        .andExpect(status().isUnauthorized());

    mockMvc.perform(json(patch(url), aliceJwt, "{\"folderId\":\"" + target + "\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.folderId", is(target)));
    mockMvc.perform(get("/api/v1/diagrams?folderId=" + target).header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.total", is(1)))
        .andExpect(jsonPath("$.data[0].folderId", is(target)));
    mockMvc.perform(get("/api/v1/diagrams?folderId=root").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[*].id", not(hasItem(id))));

    mockMvc.perform(json(patch(url), aliceJwt, "{\"folderId\":null}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.folderId", nullValue()));
    mockMvc.perform(get("/api/v1/diagrams?folderId=root").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[*].id", hasItem(id)));
    assertThat(auditActions(aliceWs.getId())).contains("diagram.move");
  }

  @Test
  void purgeJobRemovesOnlyExpired() {
    Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
    Workspace teamWs = new Workspace("Team ws");
    teamWs.setPlan("team");
    teamWs = workspaces.saveAndFlush(teamWs);
    memberships.saveAndFlush(new WorkspaceMembership(teamWs, alice, "admin", "active"));

    Diagram expired = trashedDiagram(aliceWs, "expired", now.minus(Duration.ofDays(31)));
    Diagram recent = trashedDiagram(aliceWs, "recent", now.minus(Duration.ofDays(29)));
    Diagram live = trashedDiagram(aliceWs, "live", null);
    Diagram teamRecent = trashedDiagram(teamWs, "team recent", now.minus(Duration.ofDays(60)));
    Diagram teamExpired = trashedDiagram(teamWs, "team expired", now.minus(Duration.ofDays(91)));
    Folder expiredFolder = new Folder(aliceWs.getId(), null, "Old folder " + UUID.randomUUID(),
        alice.getId());
    expiredFolder.setDeletedAt(now.minus(Duration.ofDays(40)));
    expiredFolder = folders.saveAndFlush(expiredFolder);

    TrashPurgeJob job = new TrashPurgeJob(entityManager, auditService, transactionManager,
        Clock.fixed(now, ZoneOffset.UTC), true);
    int removed = job.purgeExpired();

    assertThat(removed).isGreaterThanOrEqualTo(3);
    assertThat(diagrams.findById(expired.getId())).isEmpty();
    assertThat(diagrams.findById(teamExpired.getId())).isEmpty();
    assertThat(diagrams.findById(recent.getId())).isPresent();
    assertThat(diagrams.findById(live.getId())).isPresent();
    assertThat(diagrams.findById(teamRecent.getId())).isPresent();
    assertThat(folders.findById(expiredFolder.getId())).isEmpty();

    List<AuditEvent> purges = auditEvents.findByWorkspaceIdAndActionOrderByCreatedAtDesc(
        aliceWs.getId(), "diagram.purge", PageRequest.of(0, 10));
    assertThat(purges).extracting(AuditEvent::getResourceId).contains(expired.getId().toString());
    assertThat(purges).allSatisfy(e -> assertThat(e.getActorId()).isNull());
    assertThat(auditActions(aliceWs.getId())).contains("folder.purge");

    // Second run finds nothing new for these rows.
    job.purgeExpired();
    assertThat(diagrams.findById(recent.getId())).isPresent();
  }
}
