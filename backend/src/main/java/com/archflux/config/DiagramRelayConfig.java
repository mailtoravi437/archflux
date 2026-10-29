package com.archflux.config;

import com.archflux.security.RequestUser;
import com.archflux.service.AccessService;
import com.archflux.web.DiagramRelayHandler;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.HandshakeInterceptor;

/**
 * y-websocket relay endpoint {@code /ws/diagram-{uuid}} (SERVICES_SPEC 4.4, R1-BUG-17).
 * {@code AuthFilter} authenticates the handshake (401); this checks the diagram role (404 when the
 * caller has no access, so another workspace's diagram is indistinguishable from a missing one).
 */
@Configuration
@EnableWebSocket
public class DiagramRelayConfig implements WebSocketConfigurer {

  public static final String PREFIX = "/ws/diagram-";
  private static final Pattern PATH = Pattern.compile(
      "^/ws/diagram-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$");

  private final String[] allowedOrigins;
  private final AccessService access;

  public DiagramRelayConfig(
      @Value("${app.cors.allowed-origins:}") String configuredOrigins,
      @Value("${app.frontend-url:http://localhost:5173}") String frontendUrl,
      AccessService access) {
    this.allowedOrigins = AllowedOrigins.from(configuredOrigins, frontendUrl)
        .asList().toArray(String[]::new);
    this.access = access;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    registry.addHandler(new DiagramRelayHandler(), PREFIX + "*")
        .addInterceptors(new RoleInterceptor())
        .setAllowedOrigins(allowedOrigins);
  }

  private final class RoleInterceptor implements HandshakeInterceptor {
    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
        WebSocketHandler handler, Map<String, Object> attributes) {
      HttpServletRequest servlet = ((ServletServerHttpRequest) request).getServletRequest();
      UUID userId = RequestUser.get(servlet);
      Matcher m = PATH.matcher(servlet.getRequestURI());
      Optional<AccessService.DiagramRole> role = Optional.empty();
      UUID diagramId = null;
      if (userId != null && m.matches()) {
        diagramId = UUID.fromString(m.group(1));
        role = access.effectiveRole(userId, diagramId, null);
      }
      if (role.isEmpty()) {
        response.setStatusCode(userId == null ? HttpStatus.UNAUTHORIZED : HttpStatus.NOT_FOUND);
        return false;
      }
      attributes.put("relay.diagramId", diagramId);
      attributes.put("relay.canEdit", role.get().atLeast(AccessService.DiagramRole.EDITOR));
      return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
        WebSocketHandler handler, Exception exception) {
      // nothing to clean up
    }
  }
}
