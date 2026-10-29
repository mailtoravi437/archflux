package com.archflux.web;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.BinaryWebSocketHandler;

/**
 * Stateless y-websocket relay (SERVICES_SPEC 4.4, R1-BUG-17). Forwards every binary frame from a peer
 * to the other peers of the same diagram. Nothing is persisted. Peers below EDIT may only send sync
 * step 1 and awareness frames, so a viewer cannot change the shared document.
 */
public class DiagramRelayHandler extends BinaryWebSocketHandler {

  static final String ATTR_DIAGRAM = "relay.diagramId";
  static final String ATTR_CAN_EDIT = "relay.canEdit";
  static final int MAX_FRAME_BYTES = 1024 * 1024;

  private static final Logger log = LoggerFactory.getLogger(DiagramRelayHandler.class);

  private final Map<UUID, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();

  /** y-protocol: byte0 0 = sync (byte1 0 step1, 1 step2, 2 update), byte0 1 = awareness. */
  static boolean allowedFrom(byte[] frame, boolean canEdit) {
    if (frame.length == 0) {
      return false;
    }
    if (canEdit) {
      return true;
    }
    if (frame[0] == 1) {
      return true;
    }
    return frame[0] == 0 && frame.length > 1 && frame[1] == 0;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) {
    UUID diagram = (UUID) session.getAttributes().get(ATTR_DIAGRAM);
    session.setBinaryMessageSizeLimit(MAX_FRAME_BYTES);
    rooms.computeIfAbsent(diagram, k -> ConcurrentHashMap.newKeySet()).add(session);
  }

  @Override
  protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
    UUID diagram = (UUID) session.getAttributes().get(ATTR_DIAGRAM);
    boolean canEdit = Boolean.TRUE.equals(session.getAttributes().get(ATTR_CAN_EDIT));
    java.nio.ByteBuffer payload = message.getPayload().asReadOnlyBuffer();
    byte[] frame = new byte[payload.remaining()];
    payload.get(frame);
    if (!allowedFrom(frame, canEdit)) {
      return;
    }
    Set<WebSocketSession> peers = rooms.get(diagram);
    if (peers == null) {
      return;
    }
    for (WebSocketSession peer : peers) {
      if (peer == session || !peer.isOpen()) {
        continue;
      }
      try {
        synchronized (peer) {
          peer.sendMessage(new BinaryMessage(frame));
        }
      } catch (IOException | IllegalStateException e) {
        log.debug("Relay send failed, dropping peer: {}", e.getMessage());
        try {
          peer.close(CloseStatus.SERVER_ERROR);
        } catch (IOException ignored) {
          // already gone
        }
      }
    }
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    UUID diagram = (UUID) session.getAttributes().get(ATTR_DIAGRAM);
    if (diagram == null) {
      return;
    }
    rooms.computeIfPresent(diagram, (k, set) -> {
      set.remove(session);
      return set.isEmpty() ? null : set;
    });
  }
}
