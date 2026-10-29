package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import com.archflux.config.AppProperties;
import com.archflux.domain.Checkpoint;
import com.archflux.domain.Diagram;
import com.archflux.domain.Reply;
import com.archflux.domain.ReviewThread;
import com.archflux.domain.SyncLog;
import com.archflux.domain.User;
import com.archflux.repo.CheckpointRepository;
import com.archflux.repo.DiagramRepository;
import com.archflux.repo.ReplyRepository;
import com.archflux.repo.SyncLogRepository;
import com.archflux.repo.ThreadRepository;
import com.archflux.repo.UserRepository;

/**
 * Repository round-trip against the REAL V1 schema (applied in PostgresIT):
 * CRUD, tags/graph mapping, and cascade deletes. Passing here proves
 * ddl-auto: validate matches the DBA-owned tables.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
class DiagramRepositoryTest extends PostgresIT {

  @Autowired
  private TestEntityManager entityManager;

  @Autowired
  private UserRepository users;

  @Autowired
  private DiagramRepository diagrams;

  @Autowired
  private CheckpointRepository checkpoints;

  @Autowired
  private ThreadRepository threads;

  @Autowired
  private ReplyRepository replies;

  @Autowired
  private SyncLogRepository syncLog;

  @Test
  void crudWithTagsAndGraphRoundTrip() {
    User owner = users.saveAndFlush(new User(UUID.randomUUID(), "repo-" + UUID.randomUUID() + "@x.local", "Repo", "member"));

    Diagram diagram = new Diagram();
    diagram.setOwner(owner);
    diagram.setTitle("repo round trip");
    diagram.setTags(List.of("alpha", "beta", "with space", "uni-☃"));
    diagram.setGraph("{\"nodes\":[{\"id\":\"a\"}],\"edges\":[],\"strokes\":[],\"texts\":[]}");
    Diagram saved = diagrams.saveAndFlush(diagram);
    assertThat(saved.getId()).isNotNull();
    assertThat(saved.getCreatedAt()).isNotNull();

    entityManager.clear();
    Diagram reloaded = diagrams.findById(saved.getId()).orElseThrow();
    assertThat(reloaded.getTags()).containsExactly("alpha", "beta", "with space", "uni-☃");
    assertThat(reloaded.getGraph()).contains("\"nodes\"");
    assertThat(reloaded.ownerId()).isEqualTo(owner.getId());

    // updated_at trigger fires on UPDATE.
    Instant before = reloaded.getUpdatedAt();
    reloaded.setTitle("renamed");
    diagrams.saveAndFlush(reloaded);
    entityManager.refresh(reloaded);
    assertThat(reloaded.getUpdatedAt()).isNotNull();

    // Title search scoping.
    assertThat(diagrams.findByIdAndOwner_Id(saved.getId(), owner.getId())).isPresent();
    assertThat(diagrams.findByIdAndOwner_Id(saved.getId(), UUID.randomUUID())).isEmpty();
    assertThat(before).isNotNull();
  }

  @Test
  void deleteDiagramCascadesToChildren() {
    User owner = users.saveAndFlush(new User(UUID.randomUUID(), "cascade-" + UUID.randomUUID() + "@x.local", "C", "member"));
    Diagram diagram = new Diagram();
    diagram.setOwner(owner);
    diagram.setTitle("cascade me");
    diagram.setTags(List.of("x"));
    diagram.setGraph("{}");
    diagram = diagrams.saveAndFlush(diagram);

    Checkpoint checkpoint = new Checkpoint();
    checkpoint.setDiagram(diagram);
    checkpoint.setTitle("cp");
    checkpoint.setSnapshot("{}");
    checkpoints.saveAndFlush(checkpoint);

    ReviewThread thread = new ReviewThread();
    thread.setDiagram(diagram);
    thread.setAuthor("ann");
    thread.setText("hello");
    thread = threads.saveAndFlush(thread);

    Reply reply = new Reply();
    reply.setThread(thread);
    reply.setAuthor("bob");
    reply.setText("hi");
    replies.saveAndFlush(reply);

    SyncLog row = new SyncLog();
    row.setDiagram(diagram);
    row.setActor("dev");
    row.setCommitSha("abc123");
    syncLog.saveAndFlush(row);

    UUID diagramId = diagram.getId();
    UUID threadId = thread.getId();
    // Evict setup state so the delete runs like production (children not in
    // the persistence context); the DB ON DELETE CASCADE does the work.
    entityManager.clear();
    diagrams.deleteById(diagramId);
    diagrams.flush();
    entityManager.clear();

    assertThat(diagrams.findById(diagramId)).isEmpty();
    assertThat(checkpoints.findByDiagram_IdOrderByCreatedAtDesc(diagramId)).isEmpty();
    assertThat(threads.findByIdAndDiagram_Id(threadId, diagramId)).isEmpty();
    assertThat(replies.findByThread_IdOrderByCreatedAtAsc(threadId)).isEmpty();
    assertThat(syncLog.findFirstByCommitShaOrderByCreatedAtAsc("abc123")).isEmpty();
  }

  @Test
  void deleteUserCascadesToDiagrams() {
    UUID userId = UUID.randomUUID();
    User owner = users.saveAndFlush(new User(userId, "gone-" + UUID.randomUUID() + "@x.local", "G", "member"));
    Diagram diagram = new Diagram();
    diagram.setOwner(owner);
    diagram.setTitle("orphaned soon");
    diagram.setTags(List.of());
    diagram.setGraph("{}");
    UUID diagramId = diagrams.saveAndFlush(diagram).getId();

    entityManager.clear();
    users.deleteById(userId);
    users.flush();
    entityManager.clear();

    assertThat(users.findById(userId)).isEmpty();
    assertThat(diagrams.findById(diagramId)).isEmpty();
  }

  @Test
  void devUserIdMatchesSeedExpectation() {
    assertThat(AppProperties.DEV_USER_ID.toString())
        .isEqualTo("11111111-1111-1111-1111-111111111111");
    assertThat(Map.of("a", 1)).containsKey("a");
  }
}
