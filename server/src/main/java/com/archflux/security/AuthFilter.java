package com.archflux.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import com.archflux.auth.JwtService;
import com.archflux.config.AppProperties;
import com.archflux.service.WorkspaceService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * JWT authentication (PROD-001). Credential is {@code Authorization: Bearer <jwt>}
 * or the {@code ARCHFLUX_TOKEN} cookie. Validated JWTs (signature, issuer,
 * audience, expiry) resolve to the real user UUID from the {@code sub} claim;
 * the User row is auto-provisioned when missing.
 *
 * <p>The static API token is a <em>service credential</em>, accepted ONLY on
 * {@code POST /api/v1/sync/webhook/git} so machine callers without user JWTs
 * can deliver webhooks. It never authenticates as a user anywhere else.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class AuthFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger(AuthFilter.class);

  public static final String COOKIE_NAME = "ARCHFLUX_TOKEN";

  /** Exact path where the static service token is accepted (POST only). */
  public static final String WEBHOOK_PATH = "/api/v1/sync/webhook/git";

  private static final Set<String> PUBLIC_PATHS = Set.of("/api/health", "/api/ready");

  private static final Set<String> PUBLIC_AUTH_PATHS = Set.of(
      "/api/v1/auth/magic-link",
      "/api/v1/auth/verify",
      "/api/v1/auth/success",
      "/api/v1/auth/failure");

  private static final String LOGIN_PREFIX = "/api/v1/auth/login/";

  private final AppProperties appProperties;
  private final JwtService jwtService;
  private final WorkspaceService workspaces;

  public AuthFilter(AppProperties appProperties, JwtService jwtService,
      WorkspaceService workspaces) {
    this.appProperties = appProperties;
    this.jwtService = jwtService;
    this.workspaces = workspaces;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    String path = request.getRequestURI();
    if (PUBLIC_PATHS.contains(path) || path.equals("/error") || isPublicAuthPath(path)) {
      chain.doFilter(request, response);
      return;
    }
    if (!path.startsWith("/api/v1/")) {
      chain.doFilter(request, response);
      return;
    }
    if (WEBHOOK_PATH.equals(path) && "POST".equalsIgnoreCase(request.getMethod())) {
      UUID userId = jwtUserId(request, extractJwt(request));
      if (userId != null) {
        // Validated identity is recorded on the request (see RequestUser);
        // RequestUserBridgeFilter promotes it into Spring Security downstream.
        RequestUser.set(request, userId);
        chain.doFilter(request, response);
        return;
      }
      // Service credential only: proves the caller holds the shared secret,
      // but carries no user identity (SyncController maps the webhook user).
      if (isValidStaticToken(request)) {
        chain.doFilter(request, response);
        return;
      }
      log.info("Unauthenticated webhook request to {}", path);
      writeUnauthorized(response);
      return;
    }
    UUID userId = jwtUserId(request, extractJwt(request));
    if (userId == null) {
      log.info("Unauthenticated request to {}", path);
      writeUnauthorized(response);
      return;
    }
    RequestUser.set(request, userId);
    chain.doFilter(request, response);
  }

  private static boolean isPublicAuthPath(String path) {
    return PUBLIC_AUTH_PATHS.contains(path) || path.startsWith(LOGIN_PREFIX);
  }

  /** Bearer header wins; falls back to the ARCHFLUX_TOKEN cookie. */
  public static String extractJwt(HttpServletRequest request) {
    String header = request.getHeader("Authorization");
    if (header != null && header.startsWith("Bearer ")) {
      String token = header.substring("Bearer ".length()).trim();
      if (!token.isEmpty()) {
        return token;
      }
    }
    Cookie[] cookies = request.getCookies();
    if (cookies != null) {
      for (Cookie cookie : cookies) {
        if (COOKIE_NAME.equals(cookie.getName())
            && cookie.getValue() != null && !cookie.getValue().isBlank()) {
          return cookie.getValue();
        }
      }
    }
    return null;
  }

  /** Validates the JWT and resolves/provisions the user; null when invalid. */
  private UUID jwtUserId(HttpServletRequest request, String token) {
    if (token == null) {
      return null;
    }
    try {
      Claims claims = jwtService.validateToken(token);
      UUID userId = UUID.fromString(claims.getSubject());
      return resolveUser(request, userId, claims);
    } catch (IllegalArgumentException e) {
      log.info("JWT with non-UUID subject rejected");
      return null;
    } catch (Exception e) {
      log.info("JWT validation failed: {}", e.getMessage());
      return null;
    }
  }

  /**
   * A validated JWT {@code sub} always resolves to a real User row via the
   * SECURITY DEFINER {@code provision_user()} function (claims seed profile
   * fields for new rows). Direct repository writes are deliberately avoided
   * here: this filter runs outside {@code @Transactional} service scope with
   * no RequestUser yet, so RLS would deny the write under the app role.
   */
  private UUID resolveUser(HttpServletRequest request, UUID userId, Claims claims) {
    String claimRole = claims.get("role", String.class);
    request.setAttribute(RequestUser.ATTRIBUTE + ".role",
        claimRole != null && !claimRole.isBlank() ? claimRole : "member");
    String email = claims.get("email", String.class);
    String name = claims.get("name", String.class);
    String role = claims.get("role", String.class);
    String provider = claims.get("provider", String.class);
    return workspaces.provisionLogin(userId, email, name, role, provider, null, null, null);
  }

  private boolean isValidStaticToken(HttpServletRequest request) {
    String header = request.getHeader("Authorization");
    if (header == null || !header.startsWith("Bearer ")) {
      return false;
    }
    String presented = header.substring("Bearer ".length()).trim();
    String expected = appProperties.effectiveToken();
    if (presented.isEmpty() || expected == null || expected.isBlank()) {
      return false;
    }
    return MessageDigest.isEqual(presented.getBytes(StandardCharsets.UTF_8),
        expected.getBytes(StandardCharsets.UTF_8));
  }

  static void writeUnauthorized(HttpServletResponse response) throws IOException {
    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
    response.setContentType("application/json");
    response.getWriter().write(
        "{\"error\":{\"code\":\"UNAUTHENTICATED\",\"message\":\"Missing or invalid credential\"}}");
  }
}
