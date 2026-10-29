package com.archflux.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Pure deterministic diagram linter (no I/O):
 * <ul>
 *   <li>orphan: node with degree 0 (no incident edge)</li>
 *   <li>dangling: edge whose {@code to} is null or references no known node</li>
 *   <li>ambiguous: connected edge (both ends known) with neither protocol nor label</li>
 * </ul>
 */
@Service
public class LintService {

  public record LintResult(List<String> orphans, List<String> dangling,
      List<String> ambiguous, boolean ok) {
  }

  public LintResult lint(JsonNode nodes, JsonNode edges) {
    List<String> nodeIds = new ArrayList<>();
    Set<String> nodeIdSet = new LinkedHashSet<>();
    if (nodes != null && nodes.isArray()) {
      for (JsonNode node : nodes) {
        JsonNode id = node.get("id");
        if (id != null && id.isTextual() && !id.asText().isBlank()) {
          nodeIds.add(id.asText());
          nodeIdSet.add(id.asText());
        }
      }
    }

    List<Map<String, String>> edgeRows = new ArrayList<>();
    if (edges != null && edges.isArray()) {
      int index = 0;
      for (JsonNode edge : edges) {
        String id = text(edge, "id");
        if (id == null) {
          id = "edges[" + index + "]";
        }
        edgeRows.add(Map.of(
            "id", id,
            "from", text(edge, "from") == null ? "" : text(edge, "from"),
            "to", text(edge, "to") == null ? "" : text(edge, "to"),
            "label", text(edge, "label") == null ? "" : text(edge, "label"),
            "protocol", text(edge, "protocol") == null ? "" : text(edge, "protocol")));
        index++;
      }
    }

    Map<String, Integer> degree = new HashMap<>();
    for (String nodeId : nodeIdSet) {
      degree.put(nodeId, 0);
    }
    for (Map<String, String> edge : edgeRows) {
      if (!edge.get("from").isEmpty() && degree.containsKey(edge.get("from"))) {
        degree.merge(edge.get("from"), 1, Integer::sum);
      }
      if (!edge.get("to").isEmpty() && degree.containsKey(edge.get("to"))) {
        degree.merge(edge.get("to"), 1, Integer::sum);
      }
    }

    List<String> orphans = new ArrayList<>();
    for (String nodeId : nodeIds) {
      if (degree.getOrDefault(nodeId, 0) == 0 && !orphans.contains(nodeId)) {
        orphans.add(nodeId);
      }
    }

    List<String> dangling = new ArrayList<>();
    List<String> ambiguous = new ArrayList<>();
    for (Map<String, String> edge : edgeRows) {
      String to = edge.get("to");
      String from = edge.get("from");
      boolean toMissing = to.isEmpty() || !nodeIdSet.contains(to);
      if (toMissing) {
        dangling.add(edge.get("id"));
        continue;
      }
      boolean connected = !from.isEmpty() && nodeIdSet.contains(from);
      if (connected && edge.get("protocol").isBlank() && edge.get("label").isBlank()) {
        ambiguous.add(edge.get("id"));
      }
    }

    return new LintResult(orphans, dangling, ambiguous,
        orphans.isEmpty() && dangling.isEmpty() && ambiguous.isEmpty());
  }

  private static String text(JsonNode node, String field) {
    if (node == null || !node.isObject()) {
      return null;
    }
    JsonNode value = node.get(field);
    if (value == null || value.isNull() || !value.isTextual()) {
      return null;
    }
    String text = value.asText();
    return text.isBlank() ? null : text;
  }
}
