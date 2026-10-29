package com.archflux.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.archflux.PostgresIT;
import com.archflux.TestInfraMocks;
import com.archflux.auth.JwtService;
import com.archflux.domain.User;
import com.archflux.repo.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * R1-BUG-17: the SPA joins a y-websocket room at {@code /ws/diagram-<uuid>}. The API relays frames
 * between the peers of one diagram, authenticated by the ARCHFLUX_TOKEN cookie and scoped by
 * AccessService (SERVICES_SPEC 4.4). Not @Transactional: the socket runs on server threads.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestInfraMocks.class)
class DiagramRelayTest extends PostgresIT {

  @LocalServerPort
  int port;

  @Autowired
  TestRestTemplate rest;

  @Autowired
  JwtService jwt;

  @Autowired
  UserRepository users;

  private String jwtA;
  private String jwtOutsider;
  private String diagramId;

  @BeforeEach
  void setUp() throws Exception {
    jwtA = jwt.generateToken(persistUser("relay-a-" + UUID.randomUUID() + "@archflux.local"), "s-a");
    jwtOutsider = jwt.generateToken(persistUser("relay-c-" + UUID.randomUUID() + "@archflux.local"), "s-c");
    HttpHeaders headers = new HttpHeaders();
    headers.set("Authorization", "Bearer " + jwtA);
    headers.setContentType(MediaType.APPLICATION_JSON);
    String body = rest.postForObject("/api/v1/diagrams", new HttpEntity<>(
        "{\"title\":\"Relay\",\"tags\":[],\"graph\":{\"nodes\":[],\"edges\":[]}}", headers), String.class);
    diagramId = new ObjectMapper().readTree(body).get("data").get("id").asText();
  }

  private User persistUser(String email) {
    User user = new User();
    user.setEmail(email);
    user.setName("Relay");
    user.setProvider("email");
    user.setProviderId(email);
    user.setRole("member");
    return users.saveAndFlush(user);
  }

  private static final class Peer implements WebSocket.Listener {
    final BlockingQueue<byte[]> frames = new LinkedBlockingQueue<>();

    @Override
    public CompletionStage<?> onBinary(WebSocket ws, ByteBuffer data, boolean last) {
      byte[] b = new byte[data.remaining()];
      data.get(b);
      frames.add(b);
      ws.request(1);
      return null;
    }

    @Override
    public void onOpen(WebSocket ws) {
      ws.request(1);
    }
  }

  private CompletableFuture<WebSocket> connect(String room, String token, Peer peer, String origin) {
    WebSocket.Builder b = HttpClient.newHttpClient().newWebSocketBuilder();
    if (token != null) {
      b.header("Cookie", "ARCHFLUX_TOKEN=" + token);
    }
    if (origin != null) {
      b.header("Origin", origin);
    }
    return b.buildAsync(URI.create("ws://localhost:" + port + "/ws/" + room), peer);
  }

  private static int handshakeStatus(CompletableFuture<WebSocket> f) throws Exception {
    try {
      f.get(10, TimeUnit.SECONDS);
      return 101;
    } catch (Exception e) {
      Throwable c = e instanceof CompletionException || e.getCause() != null ? e.getCause() : e;
      if (c instanceof java.net.http.WebSocketHandshakeException h) {
        return h.getResponse().statusCode();
      }
      throw e;
    }
  }

  @Test
  void relaysFramesBetweenPeersOfTheSameDiagramButNotBackToTheSender() throws Exception {
    Peer a = new Peer();
    Peer b = new Peer();
    WebSocket wa = connect("diagram-" + diagramId, jwtA, a, null).get(10, TimeUnit.SECONDS);
    WebSocket wb = connect("diagram-" + diagramId, jwtA, b, null).get(10, TimeUnit.SECONDS);

    byte[] awareness = {1, 3, 'x', 'y', 'z'};
    wa.sendBinary(ByteBuffer.wrap(awareness), true).get(5, TimeUnit.SECONDS);

    assertEquals(awareness.length, b.frames.poll(5, TimeUnit.SECONDS).length);
    assertNull(a.frames.poll(500, TimeUnit.MILLISECONDS));
    wa.sendClose(WebSocket.NORMAL_CLOSURE, "");
    wb.sendClose(WebSocket.NORMAL_CLOSURE, "");
  }

  @Test
  void doesNotRelayAcrossDiagrams() throws Exception {
    Peer a = new Peer();
    Peer other = new Peer();
    WebSocket wa = connect("diagram-" + diagramId, jwtA, a, null).get(10, TimeUnit.SECONDS);
    // Another room the same user may not join: handshake is refused, nothing leaks.
    assertEquals(404, handshakeStatus(connect("diagram-" + UUID.randomUUID(), jwtA, other, null)));
    wa.sendBinary(ByteBuffer.wrap(new byte[] {1, 0}), true).get(5, TimeUnit.SECONDS);
    assertNull(other.frames.poll(300, TimeUnit.MILLISECONDS));
    wa.sendClose(WebSocket.NORMAL_CLOSURE, "");
  }

  @Test
  void rejectsMissingCredentialsWith401() throws Exception {
    assertEquals(401, handshakeStatus(connect("diagram-" + diagramId, null, new Peer(), null)));
  }

  @Test
  void anotherUsersDiagramIs404NotForbidden() throws Exception {
    assertEquals(404, handshakeStatus(connect("diagram-" + diagramId, jwtOutsider, new Peer(), null)));
  }

  @Test
  void rejectsMalformedRoomWith404() throws Exception {
    assertEquals(404, handshakeStatus(connect("diagram-not-a-uuid", jwtA, new Peer(), null)));
  }

  @Test
  void rejectsForeignOriginWith403() throws Exception {
    assertEquals(403, handshakeStatus(
        connect("diagram-" + diagramId, jwtA, new Peer(), "https://evil.example")));
  }

  @Test
  void viewersMayNotSendDocumentUpdatesButMaySyncAndShareAwareness() {
    // y-protocol: byte0 0 = sync (byte1: 0 step1, 1 step2, 2 update), byte0 1 = awareness.
    assertTrue(DiagramRelayHandler.allowedFrom(new byte[] {0, 0, 1}, false));
    assertTrue(DiagramRelayHandler.allowedFrom(new byte[] {1, 1, 1}, false));
    assertFalse(DiagramRelayHandler.allowedFrom(new byte[] {0, 1, 1}, false));
    assertFalse(DiagramRelayHandler.allowedFrom(new byte[] {0, 2, 1}, false));
    assertFalse(DiagramRelayHandler.allowedFrom(new byte[] {}, false));
    assertTrue(DiagramRelayHandler.allowedFrom(new byte[] {0, 2, 1}, true));
  }
}
