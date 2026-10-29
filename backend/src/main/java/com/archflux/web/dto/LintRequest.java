package com.archflux.web.dto;

import com.fasterxml.jackson.databind.JsonNode;

public class LintRequest {

  private JsonNode nodes;
  private JsonNode edges;

  public JsonNode getNodes() {
    return nodes;
  }

  public void setNodes(JsonNode nodes) {
    this.nodes = nodes;
  }

  public JsonNode getEdges() {
    return edges;
  }

  public void setEdges(JsonNode edges) {
    this.edges = edges;
  }
}
