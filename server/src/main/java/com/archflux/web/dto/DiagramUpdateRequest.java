package com.archflux.web.dto;

import java.util.List;
import com.fasterxml.jackson.databind.JsonNode;

public class DiagramUpdateRequest {

  private String title;
  private List<String> tags;
  private boolean tagsPresent;
  private JsonNode graph;
  private JsonNode nodes;
  private JsonNode edges;
  private JsonNode strokes;
  private JsonNode texts;
  /** Optimistic-concurrency expectation (absent = legacy behavior). */
  private Long version;
  /** Explicit overwrite: bypasses the version check, still records history. */
  private boolean force;

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public List<String> getTags() {
    return tags;
  }

  public void setTags(List<String> tags) {
    this.tags = tags;
    this.tagsPresent = true;
  }

  public boolean isTagsPresent() {
    return tagsPresent;
  }

  public JsonNode getGraph() {
    return graph;
  }

  public void setGraph(JsonNode graph) {
    this.graph = graph;
  }

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

  public JsonNode getStrokes() {
    return strokes;
  }

  public void setStrokes(JsonNode strokes) {
    this.strokes = strokes;
  }

  public JsonNode getTexts() {
    return texts;
  }

  public void setTexts(JsonNode texts) {
    this.texts = texts;
  }

  public Long getVersion() {
    return version;
  }

  public void setVersion(Long version) {
    this.version = version;
  }

  public boolean isForce() {
    return force;
  }

  public void setForce(boolean force) {
    this.force = force;
  }

  /** True when the client supplied a graph object or any flat array. */
  public boolean isGraphProvided() {
    return graph != null || nodes != null || edges != null || strokes != null || texts != null;
  }
}
