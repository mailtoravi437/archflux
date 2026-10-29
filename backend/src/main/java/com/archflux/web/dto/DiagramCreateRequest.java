package com.archflux.web.dto;

import java.util.List;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;

public class DiagramCreateRequest {

  @NotBlank(message = "title is required")
  private String title;

  private List<String> tags;
  private JsonNode graph;
  private JsonNode nodes;
  private JsonNode edges;
  private JsonNode strokes;
  private JsonNode texts;

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
}
