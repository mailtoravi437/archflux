package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import com.archflux.service.LintService;
import com.archflux.util.JsonCanonicals;

/** Pure unit tests for the deterministic linter (no Spring, no DB). */
class LintServiceTest {

  private final LintService lintService = new LintService();
  private final ObjectMapper mapper = JsonCanonicals.baseMapper();

  private ArrayNode nodes(ObjectNode... nodes) {
    ArrayNode array = mapper.createArrayNode();
    for (ObjectNode node : nodes) {
      array.add(node);
    }
    return array;
  }

  private ArrayNode edges(ObjectNode... edges) {
    ArrayNode array = mapper.createArrayNode();
    for (ObjectNode edge : edges) {
      array.add(edge);
    }
    return array;
  }

  private ObjectNode node(String id) {
    return mapper.createObjectNode().put("id", id).put("label", id);
  }

  private ObjectNode edge(String id, String from, String to, String label, String protocol) {
    ObjectNode edge = mapper.createObjectNode().put("id", id);
    if (from != null) {
      edge.put("from", from);
    }
    if (to != null) {
      edge.put("to", to);
    }
    if (label != null) {
      edge.put("label", label);
    }
    if (protocol != null) {
      edge.put("protocol", protocol);
    }
    return edge;
  }

  @Test
  void orphanNodeWithDegreeZeroIsReported() {
    var result = lintService.lint(
        nodes(node("a"), node("b"), node("lonely")),
        edges(edge("e1", "a", "b", "calls", null)));

    assertThat(result.orphans()).containsExactly("lonely");
    assertThat(result.dangling()).isEmpty();
    assertThat(result.ok()).isFalse();
  }

  @Test
  void danglingEdgeWithMissingTargetIsReported() {
    var result = lintService.lint(
        nodes(node("a")),
        edges(edge("e1", "a", "ghost", "calls", null)));

    assertThat(result.dangling()).containsExactly("e1");
    assertThat(result.ambiguous()).isEmpty();
    assertThat(result.ok()).isFalse();
  }

  @Test
  void danglingEdgeWithNullTargetIsReported() {
    var result = lintService.lint(
        nodes(node("a"), node("b")),
        edges(edge("e1", "a", null, "calls", null)));

    assertThat(result.dangling()).containsExactly("e1");
    assertThat(result.ok()).isFalse();
  }

  @Test
  void ambiguousConnectedEdgeWithoutLabelOrProtocolIsReported() {
    var result = lintService.lint(
        nodes(node("a"), node("b")),
        edges(edge("e1", "a", "b", null, null)));

    assertThat(result.ambiguous()).containsExactly("e1");
    assertThat(result.dangling()).isEmpty();
    assertThat(result.orphans()).isEmpty();
    assertThat(result.ok()).isFalse();
  }

  @Test
  void protocolCountsAsNonAmbiguous() {
    var result = lintService.lint(
        nodes(node("a"), node("b")),
        edges(edge("e1", "a", "b", null, "grpc")));

    assertThat(result.ambiguous()).isEmpty();
    assertThat(result.ok()).isTrue();
  }

  @Test
  void labeledMeshIsOk() {
    var result = lintService.lint(
        nodes(node("storefront"), node("checkout"), node("payments")),
        edges(edge("e1", "storefront", "checkout", "cart checkout", null),
            edge("e2", "checkout", "payments", "charge", null)));

    assertThat(result.orphans()).isEmpty();
    assertThat(result.dangling()).isEmpty();
    assertThat(result.ambiguous()).isEmpty();
    assertThat(result.ok()).isTrue();
  }

  @Test
  void emptyGraphIsOk() {
    var result = lintService.lint(mapper.createArrayNode(), mapper.createArrayNode());
    assertThat(result.ok()).isTrue();
  }

  @Test
  void nullInputsAreOk() {
    var result = lintService.lint(null, null);
    assertThat(result.ok()).isTrue();
  }
}
