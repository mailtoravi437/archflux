package com.archflux.sharing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.MigrationFiles;
import com.archflux.TestInfraMocks;
import com.archflux.domain.Diagram;
import com.archflux.domain.DiagramMember;
import com.archflux.repo.DiagramMemberRepository;
import com.archflux.repo.DiagramRepository;
import com.archflux.service.AccessService;
import com.archflux.service.AccessService.DiagramRole;
import jakarta.persistence.EntityManager;

/** R1-E07-T01: V11 owner backfill and the effective-role / 404-vs-403 rules. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class AccessServiceTest extends SharingIT {

  @Autowired
  private AccessService access;

  @Autowired
  private DiagramRepository diagrams;

  @Autowired
  private DiagramMemberRepository members;

  @Autowired
  private EntityManager entityManager;

  @BeforeEach
  void setUp() {
    setUpPeople("access");
  }

  @Test
  void ownerBackfilledFromOwnerId() throws Exception {
    // A pre-V11 row: no diagram_members entry yet.
    Diagram legacy = new Diagram();
    legacy.setOwner(viewer);
    legacy.setWorkspace(aliceWs);
    legacy.setTitle("legacy");
    legacy.setTags(List.of());
    legacy.setGraph("{}");
    legacy = diagrams.saveAndFlush(legacy);
    DiagramMember.Key key = new DiagramMember.Key(legacy.getId(), viewer.getId());
    assertThat(members.findById(key)).isEmpty();
    assertThat(access.effectiveRole(viewer.getId(), legacy.getId(), null))
        .contains(DiagramRole.VIEWER);

    // Run the exact backfill statement shipped in V11 (twice: idempotent).
    String sql = Files.readString(MigrationFiles.dir().resolve("V11__sharing.sql"));
    Matcher m = Pattern.compile("INSERT INTO public\\.diagram_members[^;]+;").matcher(sql);
    assertThat(m.find()).isTrue();
    String backfill = m.group();
    assertThat(backfill).contains("SELECT id, owner_id, 'owner' FROM public.diagrams")
        .contains("ON CONFLICT DO NOTHING");
    entityManager.createNativeQuery(backfill).executeUpdate();
    entityManager.createNativeQuery(backfill).executeUpdate();
    entityManager.clear();

    assertThat(members.findById(key)).get().extracting(DiagramMember::getRole).isEqualTo("owner");
    // The creator (a workspace viewer) is now owner, so the owner row wins.
    assertThat(access.effectiveRole(viewer.getId(), legacy.getId(), null))
        .contains(DiagramRole.OWNER);

    // New diagrams get the owner row on create.
    String id = createDiagram(aliceJwt, "fresh");
    assertThat(members.findById(new DiagramMember.Key(UUID.fromString(id), alice.getId())))
        .get().extracting(DiagramMember::getRole).isEqualTo("owner");
  }

  @Test
  void workspaceReviewerIsCommenter() throws Exception {
    UUID id = UUID.fromString(createDiagram(aliceJwt, "rev"));
    assertThat(access.effectiveRole(reviewer.getId(), id, null)).contains(DiagramRole.COMMENTER);
    assertThat(access.effectiveRole(editor.getId(), id, null)).contains(DiagramRole.EDITOR);
    assertThat(access.effectiveRole(viewer.getId(), id, null)).contains(DiagramRole.VIEWER);
    assertThat(access.effectiveRole(alice.getId(), id, null)).contains(DiagramRole.OWNER);
    assertThat(access.effectiveRole(bob.getId(), id, null)).isEmpty();

    // List items carry the effective role.
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", reviewerJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[?(@.id == '" + id + "')].role").value("commenter"));
    mockMvc.perform(get("/api/v1/diagrams").header("Authorization", aliceJwt))
        .andExpect(jsonPath("$.data[?(@.id == '" + id + "')].role").value("owner"));
    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", reviewerJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.role", is("commenter")));
  }

  @Test
  void explicitMemberHigherThanWorkspaceRoleWins() throws Exception {
    UUID id = UUID.fromString(createDiagram(aliceJwt, "promote"));
    mockMvc.perform(json(put("/api/v1/diagrams/" + id), viewerJwt, "{\"title\":\"nope\"}"))
        .andExpect(status().isForbidden());

    members.saveAndFlush(new DiagramMember(id, viewer.getId(), "editor", alice.getId()));
    assertThat(access.effectiveRole(viewer.getId(), id, null)).contains(DiagramRole.EDITOR);
    mockMvc.perform(json(put("/api/v1/diagrams/" + id), viewerJwt, "{\"title\":\"renamed\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.title", is("renamed")));

    // A lower explicit row never demotes a higher workspace role.
    members.saveAndFlush(new DiagramMember(id, editor.getId(), "viewer", alice.getId()));
    assertThat(access.effectiveRole(editor.getId(), id, null)).contains(DiagramRole.EDITOR);
  }

  @Test
  void noAccessIs404NotForbidden() throws Exception {
    String id = createDiagram(aliceJwt, "secret");
    String missing = UUID.randomUUID().toString();
    for (String target : List.of(id, missing)) {
      mockMvc.perform(get("/api/v1/diagrams/" + target).header("Authorization", bobJwt))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.error.code", is("NOT_FOUND")))
          .andExpect(jsonPath("$.error.message", is("Diagram not found: " + target)));
      mockMvc.perform(json(put("/api/v1/diagrams/" + target), bobJwt, "{\"title\":\"hijack\"}"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.error.message", is("Diagram not found: " + target)));
      mockMvc.perform(delete("/api/v1/diagrams/" + target).header("Authorization", bobJwt))
          .andExpect(status().isNotFound());
      mockMvc.perform(json(post("/api/v1/diagrams/" + target + "/threads"), bobJwt,
              "{\"author\":\"b\",\"text\":\"snoop\"}"))
          .andExpect(status().isNotFound());
      mockMvc.perform(json(post("/api/v1/diagrams/" + target + "/checkpoints"), bobJwt,
              "{\"title\":\"evil\"}"))
          .andExpect(status().isNotFound());
    }
    mockMvc.perform(get("/api/v1/diagrams/" + id)).andExpect(status().isUnauthorized());
  }

  @Test
  void viewerCannotEdit403() throws Exception {
    String id = createDiagram(aliceJwt, "readonly");
    mockMvc.perform(get("/api/v1/diagrams/" + id).header("Authorization", viewerJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.role", is("viewer")));
    mockMvc.perform(json(put("/api/v1/diagrams/" + id), viewerJwt, "{\"title\":\"x\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code", is("FORBIDDEN")));
    mockMvc.perform(delete("/api/v1/diagrams/" + id).header("Authorization", viewerJwt))
        .andExpect(status().isForbidden());
    mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/threads"), viewerJwt,
            "{\"author\":\"v\",\"text\":\"hi\"}"))
        .andExpect(status().isForbidden());
    mockMvc.perform(json(put("/api/v1/diagrams/" + id), editorJwt, "{\"title\":\"ok\"}"))
        .andExpect(status().isOk());
  }

  @Test
  void commenterCanCreateThread() throws Exception {
    String id = createDiagram(aliceJwt, "review me");
    MvcResult thread = mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/threads"),
            reviewerJwt, "{\"author\":\"rita\",\"text\":\"looks good\"}"))
        .andExpect(status().isCreated())
        .andReturn();
    String threadId = body(thread).get("data").get("id").asText();
    mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/threads/" + threadId + "/replies"),
            reviewerJwt, "{\"author\":\"rita\",\"text\":\"+1\"}"))
        .andExpect(status().isCreated());
    // Commenters cannot edit: checkpoints and restores need EDIT.
    mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/checkpoints"), reviewerJwt,
            "{\"title\":\"cp\"}"))
        .andExpect(status().isForbidden());
    mockMvc.perform(json(put("/api/v1/diagrams/" + id), reviewerJwt, "{\"title\":\"x\"}"))
        .andExpect(status().isForbidden());
    mockMvc.perform(json(post("/api/v1/diagrams/" + id + "/threads"), reviewerJwt,
            "{\"author\":\"\",\"text\":\"\"}"))
        .andExpect(status().isBadRequest());
    assertThat(auditActions(aliceWs.getId())).contains("thread.create", "thread.reply");
  }
}
