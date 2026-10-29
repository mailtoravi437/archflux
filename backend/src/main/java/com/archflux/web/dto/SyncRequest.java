package com.archflux.web.dto;

import com.fasterxml.jackson.databind.JsonNode;

public class SyncRequest {

  private JsonNode diagram;
  private JsonNode upstream;

  public JsonNode getDiagram() {
    return diagram;
  }

  public void setDiagram(JsonNode diagram) {
    this.diagram = diagram;
  }

  public JsonNode getUpstream() {
    return upstream;
  }

  public void setUpstream(JsonNode upstream) {
    this.upstream = upstream;
  }
}
