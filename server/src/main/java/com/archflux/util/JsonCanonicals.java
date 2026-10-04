package com.archflux.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Canonical JSON helpers: key-sorted serialization (array order preserved)
 * plus sha256 hex digests. Used for sync commit SHAs and canonical graph
 * storage.
 */
public final class JsonCanonicals {

  private JsonCanonicals() {
  }

  /** General mapper: tolerant reads, ISO instants. */
  public static ObjectMapper baseMapper() {
    ObjectMapper mapper = new ObjectMapper();
    mapper.registerModule(new JavaTimeModule());
    mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    return mapper;
  }

  private static final ObjectMapper CANONICAL = JsonMapper.builder()
      .addModule(new JavaTimeModule())
      .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
      .enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
      .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
      .build();

  public static String toCanonicalJson(Object value) {
    try {
      return CANONICAL.writeValueAsString(value);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("Value is not JSON-serializable", e);
    }
  }

  public static String sha256Hex(String input) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder(hash.length * 2);
      for (byte b : hash) {
        sb.append(Character.forDigit((b >> 4) & 0xF, 16));
        sb.append(Character.forDigit(b & 0xF, 16));
      }
      return sb.toString();
    } catch (Exception e) {
      throw new IllegalStateException("SHA-256 unavailable", e);
    }
  }

  /**
   * Builds the canonical graph object {@code {nodes,edges,strokes,texts}}
   * from either a graph object or flat sibling fields. Explicit flat arrays
   * override the corresponding graph arrays; everything else defaults to [].
   */
  public static Map<String, Object> canonicalGraph(JsonNode graph, JsonNode nodes,
      JsonNode edges, JsonNode strokes, JsonNode texts) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("nodes", toList(graph, "nodes", nodes));
    out.put("edges", toList(graph, "edges", edges));
    out.put("strokes", toList(graph, "strokes", strokes));
    out.put("texts", toList(graph, "texts", texts));
    return out;
  }

  private static List<Object> toList(JsonNode graph, String key, JsonNode flat) {
    JsonNode fromGraph = (graph != null && graph.isObject()) ? graph.get(key) : null;
    JsonNode chosen = (flat != null && flat.isArray()) ? flat
        : (fromGraph != null && fromGraph.isArray() ? fromGraph : null);
    List<Object> list = new ArrayList<>();
    if (chosen != null) {
      ObjectMapper mapper = baseMapper();
      for (JsonNode el : chosen) {
        list.add(mapper.convertValue(el, Object.class));
      }
    }
    return list;
  }

  @SuppressWarnings("unchecked")
  public static List<Map<String, Object>> listOfMaps(Object value) {
    if (!(value instanceof List<?> list)) {
      return List.of();
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object el : list) {
      if (el instanceof Map<?, ?> map) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
          row.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        out.add(row);
      }
    }
    return out;
  }

  public static String textOf(Map<String, Object> map, String key) {
    Object value = map.get(key);
    if (value == null) {
      return null;
    }
    String text = String.valueOf(value);
    return text.isBlank() ? null : text;
  }
}
