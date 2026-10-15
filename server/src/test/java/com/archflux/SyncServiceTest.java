package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.config.AppProperties;
import com.archflux.service.SyncService;
import com.archflux.util.JsonCanonicals;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Sync semantics: canonical SHA stability + DB-backed idempotency. */
@SpringBootTest
@Import(TestInfraMocks.class)
@Transactional
class SyncServiceTest extends PostgresIT {

  @Autowired
  private SyncService syncService;

  private final ObjectMapper mapper = JsonCanonicals.baseMapper();

  @Test
  void canonicalShaIsStableRegardlessOfKeyOrder() {
    Map<String, Object> first = new LinkedHashMap<>();
    first.put("diagram", Map.of("nodes", List.of(Map.of("id", "a", "label", "A"))));
    first.put("upstream", Map.of("version", 3));

    Map<String, Object> reordered = new LinkedHashMap<>();
    reordered.put("upstream", Map.of("version", 3));
    Map<String, Object> diagram = new LinkedHashMap<>();
    diagram.put("nodes", List.of(Map.of("label", "A", "id", "a")));
    reordered.put("diagram", diagram);

    String sha1 = SyncService.commitShaOf(first.get("diagram"), first.get("upstream"));
    String sha2 = SyncService.commitShaOf(reordered.get("diagram"), reordered.get("upstream"));
    assertThat(sha1).isEqualTo(sha2).hasSize(64);
  }

  @Test
  void differentPayloadsProduceDifferentShas() {
    String sha1 = SyncService.commitShaOf(Map.of("nodes", List.of("a")), null);
    String sha2 = SyncService.commitShaOf(Map.of("nodes", List.of("b")), null);
    assertThat(sha1).isNotEqualTo(sha2);
  }

  @Autowired
  private com.archflux.service.DiagramService diagramService;

  @Autowired
  private com.archflux.repo.SyncLogRepository syncLogRepository;

  @Test
  void fullIdempotencyRoundTrip() throws Exception {
    UUID owner = AppProperties.DEV_USER_ID;
    Map<String, Object> created = diagramService.create(owner, "sync-idem-" + UUID.randomUUID(),
        List.of("t"), null, null, null, null, null);
    String diagramId = (String) created.get("id");

    var payload = mapper.createObjectNode();
    payload.put("id", diagramId);
    var graph = mapper.createObjectNode();
    var nodes = mapper.createArrayNode();
    nodes.add(mapper.createObjectNode().put("id", "a"));
    graph.set("nodes", nodes);
    var edges = mapper.createArrayNode();
    edges.add(mapper.createObjectNode().put("id", "e1").put("from", "a").put("to", "a").put("label", "self"));
    graph.set("edges", edges);
    payload.set("graph", graph);

    SyncService.SyncOutcome first = syncService.sync(owner, "dev", payload, null);
    assertThat(first.status()).isEqualTo("synced");
    assertThat(first.nodesSynced()).isEqualTo(1);
    assertThat(first.edgesSynced()).isEqualTo(1);
    assertThat(first.commitSha()).hasSize(64);

    SyncService.SyncOutcome second = syncService.sync(owner, "dev", payload, null);
    assertThat(second.status()).isEqualTo("noop");
    assertThat(second.commitSha()).isEqualTo(first.commitSha());
    assertThat(second.nodesSynced()).isZero();
    assertThat(second.edgesSynced()).isZero();
    assertThat(second.timestamp()).isEqualTo(first.timestamp());

    assertThat(syncLogRepository.findAll()).hasSize(1);
  }

  @Test
  void diagramLessSyncIsAnsweredWithoutPersisting() {
    var upstream = mapper.createObjectNode();
    var nodes = mapper.createArrayNode();
    nodes.add(mapper.createObjectNode().put("id", "u1"));
    upstream.set("nodes", nodes);

    SyncService.SyncOutcome outcome =
        syncService.sync(AppProperties.DEV_USER_ID, "dev", null, upstream);
    assertThat(outcome.status()).isEqualTo("synced");
    assertThat(outcome.nodesSynced()).isEqualTo(1);
    assertThat(outcome.commitSha()).hasSize(64);
    assertThat(syncLogRepository.findAll()).isEmpty();
  }

  @Test
  void canonicalJsonOfGraphMatchesStoredShape() {
    Map<String, Object> graph = JsonCanonicals.canonicalGraph(null, null, null, null, null);
    assertThat(graph).containsOnlyKeys("nodes", "edges", "strokes", "texts");
  }
}
