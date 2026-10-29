package com.archflux.web.dto;

import java.util.List;
import com.fasterxml.jackson.databind.JsonNode;

/** Body for {@code POST /api/v1/events}. Props stay raw JSON so the service can reject nested values with 422. */
public class EventsRequest {

  public static class Item {
    private String name;
    private JsonNode props;

    public String getName() {
      return name;
    }

    public void setName(String name) {
      this.name = name;
    }

    public JsonNode getProps() {
      return props;
    }

    public void setProps(JsonNode props) {
      this.props = props;
    }
  }

  private List<Item> events;

  public List<Item> getEvents() {
    return events;
  }

  public void setEvents(List<Item> events) {
    this.events = events;
  }
}
