package com.archflux.service;

import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.web.dto.EventsRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/**
 * Product events (R1-E12-T04, DATA_MODEL_R1 §4.5). The user and workspace
 * come from the auth context, never from the body. Props are limited to
 * numbers, booleans and strings of at most 40 characters so diagram content
 * cannot leak. Events are not audit-logged (not security events).
 */
@Service
public class ProductEventService {

  public static final int MAX_BATCH = 50;
  public static final int MAX_PROP_KEYS = 10;
  public static final int MAX_STRING = 40;

  /** Mirrors the EventName union in frontend/src/lib/analytics.ts. */
  public static final Set<String> ALLOWED_NAMES = Set.of(
      "workspace_created", "diagram_created", "element_added", "relationship_added",
      "share_invited", "link_published", "access_requested", "access_granted",
      "search_performed", "search_result_opened",
      "limit_reached", "upgrade_viewed",
      "import_completed", "export_completed", "version_restored", "compare_opened");

  private final WorkspaceService workspaceService;
  private final SchemaReadinessService readiness;
  private final ObjectMapper mapper = new ObjectMapper();

  @PersistenceContext
  private EntityManager entityManager;

  public ProductEventService(WorkspaceService workspaceService, SchemaReadinessService readiness) {
    this.workspaceService = workspaceService;
    this.readiness = readiness;
  }

  /** Validates the whole batch first (422 on any bad item), then stores it unless the workspace opted out. */
  @Transactional
  public void ingest(UUID userId, EventsRequest body) {
    readiness.requireReady();
    if (body == null || body.getEvents() == null || body.getEvents().isEmpty()) {
      throw ApiException.unprocessable("events is required");
    }
    if (body.getEvents().size() > MAX_BATCH) {
      throw ApiException.unprocessable("At most " + MAX_BATCH + " events per request");
    }
    String[] json = new String[body.getEvents().size()];
    for (int i = 0; i < json.length; i++) {
      EventsRequest.Item item = body.getEvents().get(i);
      if (item == null || item.getName() == null || !ALLOWED_NAMES.contains(item.getName())) {
        throw ApiException.unprocessable("Unknown event name");
      }
      json[i] = validatedProps(item.getProps());
    }
    UUID workspaceId = workspaceService.resolvePersonalWorkspace(userId).getId();
    Object enabled = entityManager
        .createNativeQuery("SELECT analytics_enabled FROM workspaces WHERE id = :id")
        .setParameter("id", workspaceId).getResultStream().findFirst().orElse(Boolean.TRUE);
    if (Boolean.FALSE.equals(enabled)) {
      return; // opted out: drop silently
    }
    for (int i = 0; i < json.length; i++) {
      entityManager.createNativeQuery(
          "INSERT INTO product_events (workspace_id, user_id, name, props) "
              + "VALUES (:ws, :uid, :name, CAST(:props AS jsonb))")
          .setParameter("ws", workspaceId)
          .setParameter("uid", userId)
          .setParameter("name", body.getEvents().get(i).getName())
          .setParameter("props", json[i])
          .executeUpdate();
    }
  }

  private String validatedProps(JsonNode props) {
    if (props == null || props.isNull()) {
      return "{}";
    }
    if (!props.isObject()) {
      throw ApiException.unprocessable("props must be an object");
    }
    if (props.size() > MAX_PROP_KEYS) {
      throw ApiException.unprocessable("props may have at most " + MAX_PROP_KEYS + " keys");
    }
    ObjectNode out = mapper.createObjectNode();
    Iterator<Map.Entry<String, JsonNode>> it = props.fields();
    while (it.hasNext()) {
      Map.Entry<String, JsonNode> e = it.next();
      JsonNode v = e.getValue();
      if (v.isTextual()) {
        if (v.textValue().length() > MAX_STRING) {
          throw ApiException.unprocessable("props string values must be at most " + MAX_STRING + " characters");
        }
      } else if (!(v.isNumber() || v.isBoolean())) {
        throw ApiException.unprocessable("props values must be strings, numbers or booleans");
      }
      out.set(e.getKey(), v);
    }
    return out.toString();
  }
}
