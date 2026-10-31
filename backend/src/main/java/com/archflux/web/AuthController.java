package com.archflux.web;

import com.archflux.auth.JwtService;
import com.archflux.auth.MagicLinkService;
import com.archflux.auth.OAuthEmail;
import com.archflux.auth.UserSessionService;
import com.archflux.domain.User;
import com.archflux.repo.UserRepository;
import com.archflux.security.AuthFilter;
import com.archflux.service.AuditService;
import com.archflux.service.WorkspaceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Cookie-based session endpoints (PROD-001/PROD-011). The session JWT lives in
 * the {@code ARCHFLUX_TOKEN} cookie (HttpOnly, Path=/, SameSite=Lax, Secure
 * per {@code app.cookie-secure}) and is accepted as a {@code Bearer} fallback.
 * Redirects never carry tokens: success → {@code {frontend}/auth/callback},
 * failure → {@code {frontend}/login?error=<code>}; the frontend then calls
 * {@code GET /api/v1/auth/me} to establish the session.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    /** OAuth registration ids /login/oidc may forward to (H5): never an arbitrary string. */
    private static final java.util.Set<String> OAUTH_REGISTRATIONS = java.util.Set.of("github", "google", "oidc");

    private final UserRepository userRepository;
    private final UserSessionService sessionService;
    private final MagicLinkService magicLinkService;
    private final JwtService jwtService;
    private final WorkspaceService workspaceService;
    private final AuditService auditService;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    /** Absolute API root for emailed links; blank = {frontend-url}/api (SERVICES_SPEC §4.1). */
    @Value("${app.public-api-url:}")
    private String publicApiUrl;

    @Value("${app.jwt-secret:dev-secret}")
    private String jwtSecret;

    @Value("${app.cookie-secure:true}")
    private boolean cookieSecure;

    public AuthController(UserRepository userRepository,
                          UserSessionService sessionService,
                          MagicLinkService magicLinkService,
                          JwtService jwtService,
                          WorkspaceService workspaceService,
                          AuditService auditService) {
        this.userRepository = userRepository;
        this.sessionService = sessionService;
        this.magicLinkService = magicLinkService;
        this.jwtService = jwtService;
        this.workspaceService = workspaceService;
        this.auditService = auditService;
    }

    /**
     * Initiate GitHub OAuth2 login - redirects to GitHub
     */
    @GetMapping("/login/github")
    public ResponseEntity<Void> loginWithGithub(
            @RequestParam(required = false) String redirectUri,
            HttpServletResponse response) throws IOException {
        String targetRedirect = redirectUri != null ? redirectUri : spaUrl("/canvas");
        // Store redirect in session
        String oauth2Redirect = "/oauth2/authorize/github?redirect_uri=" +
            java.net.URLEncoder.encode(targetRedirect, java.nio.charset.StandardCharsets.UTF_8);
        response.sendRedirect(oauth2Redirect);
        return ResponseEntity.ok().build();
    }

    /**
     * Initiate Google OAuth2 login - redirects to Google
     */
    @GetMapping("/login/google")
    public ResponseEntity<Void> loginWithGoogle(
            @RequestParam(required = false) String redirectUri,
            HttpServletResponse response) throws IOException {
        String targetRedirect = redirectUri != null ? redirectUri : spaUrl("/canvas");
        String oauth2Redirect = "/oauth2/authorize/google?redirect_uri=" +
            java.net.URLEncoder.encode(targetRedirect, java.nio.charset.StandardCharsets.UTF_8);
        response.sendRedirect(oauth2Redirect);
        return ResponseEntity.ok().build();
    }

    /**
     * Initiate SAML2 login - redirects to SAML Identity Provider
     */
    @GetMapping("/login/saml")
    public ResponseEntity<Void> loginWithSaml(
            @RequestParam(required = false) String redirectUri,
            HttpServletResponse response) throws IOException {
        String targetRedirect = redirectUri != null ? redirectUri : spaUrl("/canvas");
        String samlRedirect = "/saml2/authenticate/archflux?redirect_uri=" +
            java.net.URLEncoder.encode(targetRedirect, java.nio.charset.StandardCharsets.UTF_8);
        response.sendRedirect(samlRedirect);
        return ResponseEntity.ok().build();
    }

    /**
     * Initiate OIDC login - redirects to OIDC Identity Provider
     */
    @GetMapping("/login/oidc")
    public ResponseEntity<Void> loginWithOidc(
            @RequestParam(required = false) String redirectUri,
            @RequestParam(required = false) String provider,
            HttpServletResponse response) throws IOException {
        String registration = provider == null ? "oidc" : provider;
        if (!OAUTH_REGISTRATIONS.contains(registration)) {
            return ResponseEntity.badRequest().build();
        }
        String targetRedirect = redirectUri != null ? redirectUri : spaUrl("/canvas");
        String oidcRedirect = "/oauth2/authorize/" + registration + "?redirect_uri=" +
            java.net.URLEncoder.encode(targetRedirect, java.nio.charset.StandardCharsets.UTF_8);
        response.sendRedirect(oidcRedirect);
        return ResponseEntity.ok().build();
    }

    /**
     * Handle OAuth2 callback success - called by Spring Security after successful login.
     * Sets the ARCHFLUX_TOKEN cookie and redirects with provider only (no token).
     */
    @GetMapping("/success")
    public void handleSuccess(
            @AuthenticationPrincipal OAuth2User principal,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {

        OAuthEmail.Result resolved = OAuthEmail.resolve(principal);
        // @AuthenticationPrincipal only carries the OAuth2User (never the token),
        // so recover the registration id from the SecurityContext when available.
        org.springframework.security.core.Authentication auth =
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        final String provider = (auth instanceof OAuth2AuthenticationToken token)
            ? token.getAuthorizedClientRegistrationId()
            : extractProvider(principal);
        if (!resolved.ok()) {
            // H1: an email the provider has not verified never links to or creates an account.
            log.warn("OAuth2 login refused ({}) for provider {} from {}", resolved.error(), provider,
                request.getRemoteAddr());
            auditService.record(null, null, "auth.login_failed", "auth", resolved.error(), "error");
            response.sendRedirect(spaUrl("/login?error=") + resolved.error());
            return;
        }
        String email = resolved.email();
        String providerId = extractProviderId(principal);
        String avatarUrl = extractAvatarUrl(principal);
        String displayName = extractDisplayName(principal);

        log.info("OAuth2 success for {} ({}) from {}", email, provider, request.getRemoteAddr());

        // Provision via the SECURITY DEFINER function (login paths run with
        // no RequestUser yet, so direct writes would trip RLS under the app
        // role). provision_login upserts by email, refreshes profile +
        // last_login_at, and ensures a personal workspace.
        UUID userId = workspaceService.provisionLogin(null, email, displayName,
            "member", provider, providerId, avatarUrl, null /* H3: provider token is never stored */);
        User user = userRepository.findById(userId).orElseThrow(() ->
            new IllegalStateException("provisioned user missing: " + userId));

        // Create session
        String sessionId = sessionService.createSession(user, request.getRemoteAddr());

        // Mint JWT, set cookie, redirect with provider only (PROD-011: no token in URL)
        String jwt = jwtService.generateToken(user, sessionId);
        addAuthCookie(response, jwt);
        auditService.record(user.getId(), null, "auth.login", "user",
            user.getId().toString(), "ok");
        response.sendRedirect(callbackUrl(provider));
    }

    /**
     * Handle OAuth2 failure — redirects with a short error code (no token, no details).
     */
    @GetMapping("/failure")
    public void handleFailure(
            @RequestParam(required = false) String error,
            @RequestParam(required = false) String error_description,
            HttpServletResponse response) throws IOException {
        log.warn("OAuth2 failure: {} - {}", error, error_description);
        String code = (error != null && !error.isBlank()) ? error : "oauth_failed";
        auditService.record(null, null, "auth.login_failed", "auth", code, "error");
        response.sendRedirect(spaUrl("/login?error=") +
            java.net.URLEncoder.encode(code, java.nio.charset.StandardCharsets.UTF_8));
    }

    /**
     * Get current authenticated user (cookie or Bearer).
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser(
            @AuthenticationPrincipal OAuth2User principal,
            HttpServletRequest request) {

        if (principal != null) {
            OAuthEmail.Result resolved = OAuthEmail.resolve(principal);
            if (!resolved.ok()) {
                return ResponseEntity.status(404).build();
            }
            return userRepository.findByEmailIgnoreCase(resolved.email())
                .map(user -> ResponseEntity.ok(userToMap(user)))
                .orElse(ResponseEntity.status(404).build());
        }

        String token = extractCredential(request);
        if (token == null) {
            return unauthenticated();
        }
        try {
            UUID userId = jwtService.getUserId(token);
            // /me bypasses AuthFilter, so it applies the logout denylist itself (SVC-G26).
            if (sessionRevoked(jwtService.getSessionIdFromToken(token))) {
                return unauthenticated();
            }
            return userRepository.findById(userId)
                .map(user -> ResponseEntity.ok(userToMap(user)))
                .orElse(unauthenticated());
        } catch (Exception e) {
            return unauthenticated();
        }
    }

    /**
     * Initiate magic link email login
     */
    @PostMapping("/magic-link")
    public ResponseEntity<Map<String, Object>> sendMagicLink(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        String email = body.get("email");
        if (email == null || !email.contains("@")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Valid email required"));
        }

        if (!magicLinkService.allowSend(email)) {
            return ResponseEntity.status(429).body(Map.of(
                "error", "Too many sign-in links requested for this address — try again in 15 minutes"));
        }
        String token = magicLinkService.generateMagicLink(email);
        String link = apiRoot() + "/v1/auth/verify?token=" + token;

        // Send email
        magicLinkService.sendMagicLinkEmail(email, link);

        log.info("Magic link sent to {}", email);
        auditService.record(null, null, "auth.magic_link_requested", "auth", email, "ok");
        return ResponseEntity.ok(Map.of("message", "Magic link sent to " + email));
    }

    /**
     * Verify magic link token: mint JWT, set cookie, redirect with provider only.
     */
    @GetMapping("/verify")
    public void verifyMagicLink(
            @RequestParam String token,
            HttpServletResponse response) throws IOException {

        Optional<String> emailOpt = magicLinkService.verifyToken(token);

        if (emailOpt.isEmpty()) {
            auditService.record(null, null, "auth.login_failed", "auth", "invalid_token", "error");
            response.sendRedirect(spaUrl("/login?error=invalid_token"));
            return;
        }

        String email = emailOpt.get();
        UUID userId = workspaceService.provisionLogin(null, email, null,
            "member", "email", email, null, null);
        User user = userRepository.findById(userId).orElseThrow(() ->
            new IllegalStateException("provisioned user missing: " + userId));

        String sessionId = sessionService.createSession(user, "magic-link");
        String jwt = jwtService.generateToken(user, sessionId);

        addAuthCookie(response, jwt);
        auditService.record(user.getId(), null, "auth.login", "user",
            user.getId().toString(), "ok");
        response.sendRedirect(callbackUrl("email"));
    }

    /**
     * Logout: destroy server session, invalidate the HTTP session, and clear
     * the ARCHFLUX_TOKEN cookie.
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(
            @AuthenticationPrincipal OAuth2User principal,
            HttpServletRequest request,
            HttpServletResponse response) {

        // Only the caller's own session (from its credential) can be revoked —
        // never an arbitrary id supplied in a header (SVC-G26).
        String sessionId = sessionIdFromCredential(request);
        if (sessionId != null && !sessionId.isBlank()) {
            try {
                sessionService.revokeSession(sessionId);
            } catch (Exception e) {
                log.warn("Session revocation failed: {}", e.getMessage());
            }
        }

        HttpSession session = request.getSession(false);
        if (session != null) {
            try {
                session.invalidate();
            } catch (IllegalStateException ignored) {
                // Already invalidated.
            }
        }

        clearAuthCookie(response);

        auditService.record(actorIdFromCredential(request), null, "auth.logout",
            "session", sessionId, "ok");
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    /**
     * Refresh JWT: validate the incoming credential (cookie or Bearer), mint a
     * new JWT, and reset the cookie.
     */
    @PostMapping("/refresh")
    public ResponseEntity<Map<String, String>> refreshToken(
            HttpServletRequest request,
            HttpServletResponse response) {

        String token = extractCredential(request);
        if (token == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Missing token"));
        }

        try {
            UUID userId = jwtService.getUserId(token);
            String sessionId = jwtService.getSessionIdFromToken(token);
            // A logged-out session must not be revived by refresh (SVC-G26).
            if (sessionService.isRevoked(sessionId)) {
                clearAuthCookie(response);
                return ResponseEntity.status(401).body(Map.of("error", "Session revoked"));
            }
            Optional<User> userOpt = userRepository.findById(userId);
            if (userOpt.isEmpty()) {
                return ResponseEntity.status(401).body(Map.of("error", "Invalid token"));
            }

            String newToken = jwtService.generateToken(userOpt.get(), sessionId);
            addAuthCookie(response, newToken);
            auditService.record(userId, null, "auth.refresh", "session", sessionId, "ok");
            return ResponseEntity.ok(Map.of("token", newToken));
        } catch (Exception e) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid token"));
        }
    }

    // Cookie + credential helpers

    private void addAuthCookie(HttpServletResponse response, String jwt) {
        ResponseCookie cookie = ResponseCookie.from(AuthFilter.COOKIE_NAME, jwt)
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(Duration.ofSeconds(jwtService.getAccessTokenTtlSeconds()))
            .sameSite("Lax")
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private void clearAuthCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(AuthFilter.COOKIE_NAME, "")
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(Duration.ZERO)
            .sameSite("Lax")
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    /** Credential for controller-level checks: Bearer header or ARCHFLUX_TOKEN cookie. */
    private static String extractCredential(HttpServletRequest request) {
        return AuthFilter.extractJwt(request);
    }

    /** Denylist check; fails open on a Redis outage like AuthFilter. */
    private boolean sessionRevoked(String sessionId) {
        try {
            return sessionService.isRevoked(sessionId);
        } catch (Exception e) {
            log.warn("Session revocation check unavailable: {}", e.getMessage());
            return false;
        }
    }

    private String sessionIdFromCredential(HttpServletRequest request) {
        String token = extractCredential(request);
        if (token == null) {
            return null;
        }
        try {
            return jwtService.getSessionIdFromToken(token);
        } catch (Exception e) {
            return null;
        }
    }

    /** Best-effort actor resolution for audit trails (null when anonymous/invalid). */
    private UUID actorIdFromCredential(HttpServletRequest request) {
        String token = extractCredential(request);
        if (token == null) {
            return null;
        }
        try {
            return jwtService.getUserId(token);
        } catch (Exception e) {
            return null;
        }
    }

    /** SPA path route on archflux-web: {frontend-url}{route} (clean URLs, no hash; decision 2026-10-31). */
    String spaUrl(String route) {
        return stripTrailingSlash(frontendUrl) + route;
    }

    String apiRoot() {
        return publicApiUrl == null || publicApiUrl.isBlank()
            ? stripTrailingSlash(frontendUrl) + "/api"
            : stripTrailingSlash(publicApiUrl);
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private String callbackUrl(String provider) {
        return spaUrl("/auth/callback?provider=") +
            java.net.URLEncoder.encode(provider == null ? "unknown" : provider,
                java.nio.charset.StandardCharsets.UTF_8);
    }

    private static ResponseEntity<Map<String, Object>> unauthenticated() {
        Map<String, Object> inner = new HashMap<>();
        inner.put("code", "UNAUTHENTICATED");
        inner.put("message", "Missing or invalid credential");
        return ResponseEntity.status(401).body(Map.of("error", inner));
    }

    // Principal helpers

    private String extractProvider(OAuth2User principal) {
        if (principal instanceof OAuth2AuthenticationToken token) {
            return token.getAuthorizedClientRegistrationId();
        }
        return "unknown";
    }

    private String extractProviderId(OAuth2User principal) {
        return principal.getName();
    }

    private String extractAvatarUrl(OAuth2User principal) {
        for (String key : List.of("avatar_url", "picture", "avatarUrl")) {
            Object value = principal.getAttributes().get(key);
            if (value instanceof String s && !s.isBlank()) {
                return s;
            }
        }
        return null;
    }

    private String extractDisplayName(OAuth2User principal) {
        for (String key : List.of("name", "login", "preferred_username")) {
            Object value = principal.getAttributes().get(key);
            if (value instanceof String s && !s.isBlank()) {
                return s;
            }
        }
        return null;
    }

    private Map<String, Object> userToMap(User user) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", user.getId());
        map.put("email", user.getEmail());
        map.put("name", user.getName());
        map.put("role", user.getRole());
        map.put("provider", user.getProvider());
        map.put("avatarUrl", user.getAvatarUrl());
        map.put("createdAt", user.getCreatedAt());
        return map;
    }
}
